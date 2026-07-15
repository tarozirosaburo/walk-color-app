'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { latLngToLocalMeters, lonLatToTileXY, tileXYToLonLat } from '@/lib/geo';

type PhotoRecord = {
  file_path: string;
  lat: number;
  lng: number;
  heading: number | null;
};

type Props = {
  photos: PhotoRecord[];
};

const TILE_ZOOM = 16;
const TILE_SIZE = 256;
// 原点タイルを中心に、縦横何タイル分を貼り合わせるか(3なら3x3=9枚)
const TILE_RADIUS = 1;

// CARTOの無料ベースマップタイル(クロスオリジン許可あり、WebGLのテクスチャとして安全に使える)
function tileUrl(x: number, y: number, z: number) {
  return `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
}

// 原点付近のタイルを貼り合わせて1枚のキャンバステクスチャを作り、
// あわせてその範囲の実際の地面サイズ(メートル)を返す
async function buildGroundTexture(
  originLat: number,
  originLng: number
): Promise<{ texture: THREE.CanvasTexture; width: number; depth: number; centerX: number; centerZ: number } | null> {
  try {
    const center = lonLatToTileXY(originLng, originLat, TILE_ZOOM);
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);

    const span = TILE_RADIUS * 2 + 1;
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE * span;
    canvas.height = TILE_SIZE * span;
    const ctx = canvas.getContext('2d')!;

    const loadImage = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

    const tasks: Promise<void>[] = [];
    for (let dy = -TILE_RADIUS; dy <= TILE_RADIUS; dy++) {
      for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        tasks.push(
          loadImage(tileUrl(tx, ty, TILE_ZOOM)).then((img) => {
            ctx.drawImage(
              img,
              (dx + TILE_RADIUS) * TILE_SIZE,
              (dy + TILE_RADIUS) * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE
            );
          })
        );
      }
    }
    await Promise.all(tasks);

    // 貼り合わせた範囲全体(北西の角〜南東の角)の実世界サイズを計算する
    const nw = tileXYToLonLat(cx - TILE_RADIUS, cy - TILE_RADIUS, TILE_ZOOM);
    const se = tileXYToLonLat(cx + TILE_RADIUS + 1, cy + TILE_RADIUS + 1, TILE_ZOOM);

    const nwMeters = latLngToLocalMeters(nw.lat, nw.lon, originLat, originLng);
    const seMeters = latLngToLocalMeters(se.lat, se.lon, originLat, originLng);

    const width = seMeters.x - nwMeters.x;
    const depth = seMeters.z - nwMeters.z;
    const centerX = (nwMeters.x + seMeters.x) / 2;
    const centerZ = (nwMeters.z + seMeters.z) / 2;

    const texture = new THREE.CanvasTexture(canvas);
    return { texture, width, depth, centerX, centerZ };
  } catch (err) {
    console.error('地図タイルの読み込みに失敗しました', err);
    return null;
  }
}

export default function PhotoScene3D({ photos }: Props) {
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
    // スマホでの描画負荷を抑えるため、解像度倍率に上限を設ける
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // ドラッグ操作をブラウザのスクロールと競合させない
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    // 最初の写真の位置を基準点(原点)にする
    const originLat = photos[0].lat;
    const originLng = photos[0].lng;

    // 地面: まずは仮の色付き板を出しておき、地図タイルが読み込めたら差し替える
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

    buildGroundTexture(originLat, originLng).then((result) => {
      if (disposed || !result) return;
      scene.remove(fallbackGround);

      const mat = new THREE.MeshStandardMaterial({
        map: result.texture,
        transparent: true,
        opacity: 0.75,
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

        // 方位(0=北, 90=東...)を、three.jsのY軸回転に変換する
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
    const radius = 12;

    function updateCamera() {
      camera.position.x = radius * Math.sin(camAngleY) * Math.cos(camAngleX);
      camera.position.y = radius * Math.sin(camAngleX) + 1;
      camera.position.z = radius * Math.cos(camAngleY) * Math.cos(camAngleX);
      camera.lookAt(0, 0.8, 0);
    }
    updateCamera();

    let rotating = false;
    let lastX = 0;
    let lastY = 0;
    let autoRotate = true;

    const onPointerDown = (e: PointerEvent) => {
      rotating = true;
      autoRotate = false;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerUp = () => {
      rotating = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!rotating) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      camAngleY -= dx * 0.005;
      camAngleX = Math.max(-0.3, Math.min(1.1, camAngleX + dy * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

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
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [photos]);

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
