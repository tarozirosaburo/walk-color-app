'use client';

import { useEffect, useState, useCallback } from 'react';
import WalkMap from '@/components/WalkMap';
import PhotoScene3D from '@/components/PhotoScene3D';
import { supabase, toGridId } from '@/lib/supabase';

type PhotoRecord = {
  file_path: string;
  lat: number;
  lng: number;
  heading: number | null;
};

// 端末の方位センサーから、その瞬間の方位(0〜360度、北=0)を1回だけ取得する
function getCurrentHeading(): Promise<number | null> {
  return new Promise((resolve) => {
    const w = window as any;

    const handler = (event: any) => {
      window.removeEventListener('deviceorientation', handler);
      // iOSは webkitCompassHeading、Androidなどは alpha(360-alphaで北基準に変換)を使う
      if (typeof event.webkitCompassHeading === 'number') {
        resolve(event.webkitCompassHeading);
      } else if (typeof event.alpha === 'number') {
        resolve(360 - event.alpha);
      } else {
        resolve(null);
      }
    };

    // iOS Safariは事前に許可を求める必要がある
    if (typeof w.DeviceOrientationEvent?.requestPermission === 'function') {
      w.DeviceOrientationEvent.requestPermission()
        .then((result: string) => {
          if (result === 'granted') {
            window.addEventListener('deviceorientation', handler, { once: true });
            // 一定時間イベントが来なければ諦める
            setTimeout(() => resolve(null), 1500);
          } else {
            resolve(null);
          }
        })
        .catch(() => resolve(null));
    } else if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handler, { once: true });
      setTimeout(() => resolve(null), 1500);
    } else {
      resolve(null);
    }
  });
}

export default function Home() {
  const [status, setStatus] = useState('');
  const [coloredGridIds, setColoredGridIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [showScene3D, setShowScene3D] = useState(false);

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
    setStatus('位置情報と方位を取得中...');

    const heading = await getCurrentHeading();

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      const gridId = toGridId(latitude, longitude);

      setStatus('写真をアップロード中...');

      const fileName = `${gridId}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file);

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

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>散歩の地図</h1>
        <button
          onClick={() => setShowScene3D((v) => !v)}
          style={{
            border: '1px solid #0F6E56',
            color: '#0F6E56',
            background: 'white',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 13,
          }}
        >
          {showScene3D ? '地図表示に戻る' : '3D写真空間を見る'}
        </button>
      </div>

      <div style={{ marginTop: '1rem' }}>
        {showScene3D ? (
          <PhotoScene3D photos={photos} />
        ) : (
          <WalkMap centerLat={37.9161} centerLng={139.0364} coloredGridIds={coloredGridIds} />
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
