'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { gridIdToBounds } from '@/lib/supabase';

type Props = {
  centerLat: number;
  centerLng: number;
  // 塗られたグリッドIDの一覧。DBから取得して渡す
  coloredGridIds: string[];
  // 地図がタップされたときに、その地点の緯度経度を伝える
  onLocationSelect?: (lat: number, lng: number) => void;
};

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
};

// グリッドIDの四隅を「画面上のピクセル座標」に変換し、SVGのpolygon用の文字列にする
function cellToScreenPolygon(map: maplibregl.Map, gridId: string): string {
  const { south, west, north, east } = gridIdToBounds(gridId);
  const corners: [number, number][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
  return corners
    .map(([lng, lat]) => {
      const p = map.project([lng, lat]);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export default function WalkMap({ centerLat, centerLng, coloredGridIds, onLocationSelect }: Props) {
  const grayContainerRef = useRef<HTMLDivElement>(null);
  const colorContainerRef = useRef<HTMLDivElement>(null);
  const grayMapRef = useRef<maplibregl.Map | null>(null);
  const colorMapRef = useRef<maplibregl.Map | null>(null);
  const [polygons, setPolygons] = useState<string[]>([]);
  const clipId = 'walk-color-clip';
  const onLocationSelectRef = useRef(onLocationSelect);
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // 地図を2枚(白黒・カラー)初期化し、白黒側の操作にカラー側を追従させる
  useEffect(() => {
    if (!grayContainerRef.current || !colorContainerRef.current) return;
    if (grayMapRef.current || colorMapRef.current) return;

    const grayMap = new maplibregl.Map({
      container: grayContainerRef.current,
      style: OSM_STYLE,
      center: [centerLng, centerLat],
      zoom: 15,
    });

    // カラー側は操作を受け付けない(白黒側の動きに追従するだけ)
    const colorMap = new maplibregl.Map({
      container: colorContainerRef.current,
      style: OSM_STYLE,
      center: [centerLng, centerLat],
      zoom: 15,
      interactive: false,
      attributionControl: false,
    });

    grayMapRef.current = grayMap;
    colorMapRef.current = colorMap;

    // 白黒地図をCSSフィルターでモノクロ化
    grayMap.on('load', () => {
      const canvas = grayMap.getCanvas();
      canvas.style.filter = 'grayscale(1) contrast(0.92) brightness(1.02)';
    });

    const updateClip = () => {
      const polys = coloredGridIdsRef.current.map((id) => cellToScreenPolygon(grayMap, id));
      setPolygons(polys);
    };

    grayMap.on('move', () => {
      colorMap.jumpTo({
        center: grayMap.getCenter(),
        zoom: grayMap.getZoom(),
        bearing: grayMap.getBearing(),
        pitch: grayMap.getPitch(),
      });
      updateClip();
    });

    grayMap.on('load', updateClip);
    colorMap.on('load', updateClip);

    grayMap.on('click', (e) => {
      onLocationSelectRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      grayMap.remove();
      colorMap.remove();
      grayMapRef.current = null;
      colorMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLat, centerLng]);

  // coloredGridIdsが変わるたびに再計算できるよう、常に最新値をrefにも保持しておく
  const coloredGridIdsRef = useRef<string[]>(coloredGridIds);
  useEffect(() => {
    coloredGridIdsRef.current = coloredGridIds;
    const grayMap = grayMapRef.current;
    if (!grayMap) return;
    const polys = coloredGridIds.map((id) => cellToScreenPolygon(grayMap, id));
    setPolygons(polys);
  }, [coloredGridIds]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '400px', borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={grayContainerRef} style={{ position: 'absolute', inset: 0 }} />
      <div
        ref={colorContainerRef}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: `url(#${clipId})`,
          pointerEvents: 'none',
        }}
      />
      {/* カラー地図を「塗ったマスの形」にくり抜くためのSVGクリップパス */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            {polygons.map((points, i) => (
              <polygon key={i} points={points} />
            ))}
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}
