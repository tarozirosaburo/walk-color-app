'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { supabase, toGridId, gridIdToBounds } from '@/lib/supabase';
import { latLngToLocalMeters, lonLatToTileXY, tileXYToLonLat, lonLatToGlobalPixel } from '@/lib/geo';

type PhotoRecord = {
  file_path: string;
  lat: number;
  lng: number;
  heading: number | null;
};

type Props = {
  photos: PhotoRecord[];
  // 3D空間の中心地点。指定がなければ最初の写真の位置を使う
  origin?: { lat: number; lng: number };
};

const TILE_ZOOM = 16;
const TILE_SIZE = 256;
// 原点タイルを中心に、縦横何タイル分を貼り合わせるか(半径1なら3x3=9枚)
const TILE_RADIUS = 1;

// CARTOの無料ベースマップタイル(クロスオリジン許可あり、WebGLのテクスチャとして安全に使える)
// カラー版(voyager)とモノクロ版(light_all)の2種類を使い分ける
function colorTileUrl(x: number, y: number, z: number) {
  return `https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}.png`;
}
function grayTileUrl(x: number, y: number, z: number) {
  return `https://basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// 原点付近のタイルを貼り合わせ、「歩いたマスだけカラー・それ以外は白黒」のテクスチャを作る
async function buildGroundTexture(
  originLat: number,
  originLng: number,
  coloredGridIds: string[]
): Promise<{ texture: THREE.CanvasTexture; width: number; depth: number; centerX: number; centerZ: number } | null> {
  try {
    const center = lonLatToTileXY(originLng, originLat, TILE_ZOOM);
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const span = TILE_RADIUS * 2 + 1;

    const grayCanvas = document.createElement('canvas');
    grayCanvas.width = TILE_SIZE * span;
    grayCanvas.height = TILE_SIZE * span;
    const grayCtx = grayCanvas.getContext('2d')!;

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = TILE_SIZE * span;
    colorCanvas.height = TILE_SIZE * span;
    const colorCtx = colorCanvas.getContext('2d')!;

    const tasks: Promise<void>[] = [];
    for (let dy = -TILE_RADIUS; dy <= TILE_RADIUS; dy++) {
      for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        const px = (dx + TILE_RADIUS) * TILE_SIZE;
        const py = (dy + TILE_RADIUS) * TILE_SIZE;
        tasks.push(
          loadImage(grayTileUrl(tx, ty, TILE_ZOOM)).then((img) => {
            grayCtx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
          })
        );
        tasks.push(
          loadImage(colorTileUrl(tx, ty, TILE_ZOOM)).then((img) => {
            colorCtx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
          })
        );
      }
    }
    await Promise.all(tasks);

    // モザイクの左上(北西)を原点としたときの、全体地図上のピクセル座標
    const originPixelX = (cx - TILE_RADIUS) * TILE_SIZE;
    const originPixelY = (cy - TILE_RADIUS) * TILE_SIZE;

    // 歩いたマスの範囲だけ、カラー版の絵をモノクロ版の上に描き直す
    coloredGridIds.forEach((gridId) => {
      const { south, west, north, east } = gridIdToBounds(gridId);
      const p1 = lonLatToGlobalPixel(west, north, TILE_ZOOM, TILE_SIZE);
      const p2 = lonLatToGlobalPixel(east, south, TILE_ZOOM, TILE_SIZE);

      const sx = Math.min(p1.px, p2.px) - originPixelX;
      const sy = Math.min(p1.py, p2.py) - originPixelY;
      const sw = Math.abs(p2.px - p1.px);
      const sh = Math.abs(p2.py - p1.py);

      if (sw <= 0 || sh <= 0) return;
      grayCtx.drawImage(colorCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
    });

    // 北西・南東の角の実世界サイズ(メートル)を計算し、地面の板のサイズを合わせる
    const nw = tileXYToLonLat(cx - TILE_RADIUS, cy - TILE_RADIUS, TILE_ZOOM);
    const se = tileXYToLonLat(cx + TILE_RADIUS + 1, cy + TILE_RADIUS + 1, TILE_ZOOM);
    const nwMeters = latLngToLocalMeters(nw.lat, nw.lon, originLat, originLng);
    const seMeters = latLngToLocalMeters(se.lat, se.lon, originLat, originLng);

    const width = seMeters.x - nwMeters.x;
    const depth = seMeters.z - nwMeters.z;
    const centerX = (nwMeters.x + seMeters.x) / 2;
    const centerZ = (nwMeters.z + seMeters.z) / 2;

    const texture = new THREE.CanvasTexture(grayCanvas);
    return { texture, width, depth, centerX, centerZ };
  } catch (err) {
    console.error('地図タイルの読み込みに失敗しました', err);
    return null;
  }
}

export default function PhotoScene3D({ photos, origin }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (photos.length === 0) return;

    let disposed = false;
    const width = container.clientWidth;
    const height = 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    const originLat = origin?.lat ?? photos[0].lat;
    const originLng = origin?.lng ?? photos[0].lng;

    const fallbackGround = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        color: 0xf1efe8,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    fallbackGround.rotation.x = -Math.PI / 2;
    fallbackGround.position.y = -0.02;
    scene.add(fallbackGround);

    // 撮影済み写真の位置から、実際に塗られているグリッドIDの一覧を求める
    const coloredGridIds = Array.from(new Set(photos.map((p) => toGridId(p.lat, p.lng))));

    buildGroundTexture(originLat, originLng, coloredGridIds).then((result) => {
      if (disposed || !result) return;
      scene.remove(fallbackGround);

      const mat = new THREE.MeshStandardMaterial({
        map: result.texture,
        side: THREE.DoubleSide,
      });
      const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(result.width, result.depth), mat);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.set(result.centerX, -0.02, result.centerZ);
      scene.add(groundMesh);
    });

    const textureLoader = new THREE.TextureLoader();

    photos.forEach((photo) => {
      const { x, z } = latLngToLocalMeters(photo.lat, photo.lng, originLat, originLng);
      const { data } = supabase.storage.from('photos').getPublicUrl(photo.file_path);

      const planeHeight = 1.6;
      const planeWidth = 1.6;
      const baseY = 1.2;

      textureLoader.load(data.publicUrl, (texture) => {
        const aspect = texture.image.width / texture.image.height;
        const w = aspect >= 1 ? planeWidth : planeWidth * aspect;
        const h = aspect >= 1 ? planeHeight / aspect : planeHeight;

        const geo = new THREE.PlaneGeometry(w, h);
        const mat = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, baseY, z);

        if (photo.heading !== null) {
          mesh.rotation.y = THREE.MathUtils.degToRad(-photo.heading);
        }
        scene.add(mesh);

        const frame = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        frame.position.copy(mesh.position);
        frame.rotation.copy(mesh.rotation);
        scene.add(frame);
      });

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, baseY - planeHeight / 2, 8),
        new THREE.MeshStandardMaterial({ color: 0x888780 })
      );
      pole.position.set(x, (baseY - planeHeight / 2) / 2, z);
      scene.add(pole);
    });

    let camAngleY = 0.6;
    let camAngleX = 0.5;
    let radius = 12;
    const MIN_RADIUS = 3;
    const MAX_RADIUS = 30;
    // 視点の中心(クリックした地面の位置に動かせるようにする)
    let targetX = 0;
    let targetZ = 0;

    function updateCamera() {
      camera.position.x = targetX + radius * Math.sin(camAngleY) * Math.cos(camAngleX);
      camera.position.y = radius * Math.sin(camAngleX) + 1;
      camera.position.z = targetZ + radius * Math.cos(camAngleY) * Math.cos(camAngleX);
      camera.lookAt(targetX, 0.8, targetZ);
    }
    updateCamera();

    // クリックした地面の位置を割り出すためのレイキャスト(y=0の地面と光線の交点を求める)
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    function screenToGround(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const point = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(groundPlane, point);
      return hit ? point : null;
    }

    let autoRotate = true;
    // 現在押されている指(ポインター)を管理し、1本指=回転、2本指=ピンチ拡大縮小を判定する
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    let pinchStartRadius = radius;
    // ドラッグかタップ(クリック)かを区別するための移動量の積算
    let dragDistance = 0;

    function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    const onPointerDown = (e: PointerEvent) => {
      autoRotate = false;
      renderer.domElement.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDistance = 0;

      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        pinchStartDist = distanceBetween(pts[0], pts[1]);
        pinchStartRadius = radius;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasSinglePointer = activePointers.size === 1;
      activePointers.delete(e.pointerId);

      // ほとんど動かさずに指を離した場合は「タップ」とみなし、その地面の位置に視点を移動する
      if (wasSinglePointer && dragDistance < 6) {
        const point = screenToGround(e.clientX, e.clientY);
        if (point) {
          targetX = point.x;
          targetZ = point.z;
          updateCamera();
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      const prev = activePointers.get(e.pointerId)!;
      dragDistance += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);

      if (activePointers.size === 2) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = Array.from(activePointers.values());
        const dist = distanceBetween(pts[0], pts[1]);
        if (pinchStartDist > 0) {
          const scale = pinchStartDist / dist;
          radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, pinchStartRadius * scale));
          updateCamera();
        }
        return;
      }

      // 1本指ドラッグ = 視点回転
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      camAngleY -= dx * 0.005;
      camAngleX = Math.max(-0.3, Math.min(1.1, camAngleX + dy * 0.005));
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      updateCamera();
    };

    // PC: マウスホイールで拡大縮小
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoRotate = false;
      radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, radius + e.deltaY * 0.01));
      updateCamera();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let frameId: number;
    function animate() {
      frameId = requestAnimationFrame(animate);
      if (autoRotate) {
        camAngleY += 0.002;
        updateCamera();
      }
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [photos, origin?.lat, origin?.lng]);

  if (photos.length === 0) {
    return (
      <div
        style={{
          height: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          background: '#f1efe8',
          borderRadius: 12,
        }}
      >
        まだ写真がありません
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: 400, borderRadius: 12, overflow: 'hidden', cursor: 'grab' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          right: 10,
          fontSize: 10,
          color: '#999',
          background: 'rgba(255,255,255,0.6)',
          padding: '1px 6px',
          borderRadius: 6,
        }}
      >
        © OpenStreetMap contributors © CARTO
      </div>
    </div>
  );
}
