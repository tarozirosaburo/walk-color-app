'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import { latLngToLocalMeters } from '@/lib/geo';

type PhotoRecord = {
  file_path: string;
  lat: number;
  lng: number;
  heading: number | null;
};

type Props = {
  photos: PhotoRecord[];
};

export default function PhotoScene3D({ photos }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (photos.length === 0) return;

    const width = container.clientWidth;
    const height = 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    // 地面を「半透明の地図」らしい見た目にする(道・敷地の区画のような表現)
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf1efe8,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    const grid = new THREE.GridHelper(60, 30, 0xbdbbb5, 0xd8d5cd);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);

    // 最初の写真の位置を基準点(原点)にする
    const originLat = photos[0].lat;
    const originLng = photos[0].lng;

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
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);

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
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
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

  return <div ref={containerRef} style={{ width: '100%', height: 400, borderRadius: 12, overflow: 'hidden', cursor: 'grab' }} />;
}
