'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import WalkMap from '@/components/WalkMap';
import PhotoScene3D from '@/components/PhotoScene3D';
import PhotoManager from '@/components/PhotoManager';
import Login from '@/components/Login';
import { supabase, toGridId } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompress';

type PhotoRecord = {
  file_path: string;
  lat: number;
  lng: number;
  heading: number | null;
};

const DEFAULT_CENTER = { lat: 37.9161, lng: 139.0364 };

type ViewMode = 'map' | 'scene3d' | 'manage';

export default function Home() {
  const [session, setSession] = useState<any>(undefined); // undefined=確認中, null=未ログイン
  const [status, setStatus] = useState('');
  const [coloredGridIds, setColoredGridIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [scene3DOrigin, setScene3DOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [needsIOSPermission, setNeedsIOSPermission] = useState(false);
  const [iosPermissionGranted, setIosPermissionGranted] = useState(false);

  // 方位センサーの最新値を保持し続ける(撮影の瞬間だけ読みに行くと、値が安定する前に取得してしまい失敗しやすいため)
  const headingRef = useRef<number | null>(null);

  // ログイン状態を確認し、変化があれば追従する
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 初期表示時に、現在地を取得できればそこを地図の中心にする(取得できなければ既定の場所のまま)
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMapCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        // 許可されなかった場合などは既定の場所のままにする
      }
    );
  }, []);

  useEffect(() => {
    const w = window as any;
    if (typeof w.DeviceOrientationEvent?.requestPermission === 'function') {
      // iOSは明示的な許可が必要なので、ボタンを表示する
      setNeedsIOSPermission(true);
    }

    function extractHeading(event: any): number | null {
      if (typeof event.webkitCompassHeading === 'number') {
        return event.webkitCompassHeading;
      }
      if (typeof event.alpha === 'number') {
        return 360 - event.alpha;
      }
      return null;
    }

    function handler(event: any) {
      const h = extractHeading(event);
      if (h !== null) headingRef.current = h;
    }

    // 機種によっては deviceorientationabsolute の方が方位の精度が高いため、両方拾う
    window.addEventListener('deviceorientation', handler);
    window.addEventListener('deviceorientationabsolute', handler as any);
    return () => {
      window.removeEventListener('deviceorientation', handler);
      window.removeEventListener('deviceorientationabsolute', handler as any);
    };
  }, []);

  // カメラアプリから戻った直後などでheadingRefがまだ空の場合、短時間だけ新しい値を待つ
  function waitForHeading(timeoutMs: number): Promise<number | null> {
    if (headingRef.current !== null) {
      return Promise.resolve(headingRef.current);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('deviceorientation', onEvent);
        window.removeEventListener('deviceorientationabsolute', onEvent as any);
        resolve(null);
      }, timeoutMs);

      function onEvent(event: any) {
        const h =
          typeof (event as any).webkitCompassHeading === 'number'
            ? (event as any).webkitCompassHeading
            : typeof event.alpha === 'number'
            ? 360 - event.alpha
            : null;
        if (h === null) return;
        clearTimeout(timeout);
        window.removeEventListener('deviceorientation', onEvent);
        window.removeEventListener('deviceorientationabsolute', onEvent as any);
        headingRef.current = h;
        resolve(h);
      }

      window.addEventListener('deviceorientation', onEvent);
      window.addEventListener('deviceorientationabsolute', onEvent as any);
    });
  }

  async function requestIOSPermission() {
    const w = window as any;
    try {
      const result = await w.DeviceOrientationEvent.requestPermission();
      if (result === 'granted') {
        setIosPermissionGranted(true);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const fetchColoredCells = useCallback(async () => {
    const { data, error } = await supabase.from('grid_cells').select('grid_id');
    if (error) {
      console.error(error);
      return;
    }
    setColoredGridIds(data.map((row) => row.grid_id));
  }, []);

  const fetchPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from('photos')
      .select('file_path, lat, lng, heading');
    if (error) {
      console.error(error);
      return;
    }
    setPhotos(data);
  }, []);

  useEffect(() => {
    fetchColoredCells();
    fetchPhotos();
  }, [fetchColoredCells, fetchPhotos]);

  async function handleCapture(file: File) {
    setStatus('位置情報を取得中...');
    const heading = await waitForHeading(1000);

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      const gridId = toGridId(latitude, longitude);

      setStatus('画像を圧縮中...');
      let compressedBlob: Blob;
      try {
        compressedBlob = await compressImage(file);
      } catch (err) {
        console.error(err);
        compressedBlob = file; // 圧縮に失敗した場合は元の画像のままアップロードする
      }

      setStatus('写真をアップロード中...');

      const fileName = `${gridId}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

      if (uploadError) {
        setStatus('アップロードに失敗しました');
        return;
      }

      await supabase.from('photos').insert({
        file_path: fileName,
        lat: latitude,
        lng: longitude,
        grid_id: gridId,
        heading,
      });

      await supabase.from('grid_cells').upsert({
        grid_id: gridId,
        lat: latitude,
        lng: longitude,
        colored_at: new Date().toISOString(),
      });

      setStatus(heading !== null ? 'マスを塗りました!(方位も記録)' : 'マスを塗りました!(方位は取得できませんでした)');

      fetchColoredCells();
      fetchPhotos();
    });
  }

  function handleLocationSelect(lat: number, lng: number) {
    setScene3DOrigin({ lat, lng });
    setViewMode('scene3d');
  }

  const scene3DCenter = scene3DOrigin ?? (photos[0] ? { lat: photos[0].lat, lng: photos[0].lng } : null);

  if (session === undefined) {
    return (
      <main style={{ maxWidth: 480, margin: '4rem auto', padding: '1rem', textAlign: 'center', color: '#888' }}>
        読み込み中...
      </main>
    );
  }

  if (session === null) {
    return <Login />;
  }

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h1 style={{ margin: 0 }}>散歩の地図</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setViewMode(viewMode === 'scene3d' ? 'map' : 'scene3d')}
            style={{
              border: '1px solid #0F6E56',
              color: '#0F6E56',
              background: 'white',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            {viewMode === 'scene3d' ? '地図表示に戻る' : '3D写真空間を見る'}
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'manage' ? 'map' : 'manage')}
            style={{
              border: '1px solid #999',
              color: '#555',
              background: 'white',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            {viewMode === 'manage' ? '戻る' : '写真を管理'}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              border: '1px solid #ccc',
              color: '#888',
              background: 'white',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            ログアウト
          </button>
        </div>
      </div>

      {needsIOSPermission && !iosPermissionGranted && (
        <button
          onClick={requestIOSPermission}
          style={{
            marginTop: 8,
            width: '100%',
            border: '1px solid #999',
            background: '#fafaf7',
            borderRadius: 8,
            padding: '8px',
            fontSize: 13,
            color: '#555',
          }}
        >
          方位センサーを有効にする(iOSのみ必要)
        </button>
      )}

      <div style={{ marginTop: '1rem' }}>
        {viewMode === 'scene3d' && <PhotoScene3D photos={photos} origin={scene3DCenter ?? undefined} />}

        {viewMode === 'manage' && <PhotoManager photos={photos} onDeleted={fetchPhotos} />}

        {viewMode === 'map' && (
          <>
            <WalkMap
              centerLat={mapCenter.lat}
              centerLng={mapCenter.lng}
              coloredGridIds={coloredGridIds}
              onLocationSelect={handleLocationSelect}
            />
            <p style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
              地図をタップすると、その場所を中心に3D表示します
            </p>
          </>
        )}
      </div>

      <label
        style={{
          display: 'block',
          marginTop: '1rem',
          textAlign: 'center',
          background: '#0F6E56',
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        写真を撮ってマスを塗る
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleCapture(e.target.files[0]);
          }}
        />
      </label>

      {status && <p style={{ marginTop: '0.5rem', color: '#666' }}>{status}</p>}
    </main>
  );
}
