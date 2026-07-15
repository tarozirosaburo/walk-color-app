'use client';

import { supabase } from '@/lib/supabase';

type PhotoRecord = {
  file_path: string;
  lat: number;
  lng: number;
  heading: number | null;
};

type Props = {
  photos: PhotoRecord[];
  onDeleted: () => void;
};

export default function PhotoManager({ photos, onDeleted }: Props) {
  async function handleDelete(photo: PhotoRecord) {
    if (!confirm('この写真を削除しますか?(元に戻せません)')) return;

    await supabase.storage.from('photos').remove([photo.file_path]);
    await supabase.from('photos').delete().eq('file_path', photo.file_path);
    onDeleted();
  }

  if (photos.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        まだ写真がありません
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}
    >
      {photos.map((photo) => {
        const { data } = supabase.storage.from('photos').getPublicUrl(photo.file_path);
        return (
          <div key={photo.file_path} style={{ position: 'relative' }}>
            <img
              src={data.publicUrl}
              alt=""
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                objectFit: 'cover',
                borderRadius: 8,
                display: 'block',
              }}
            />
            <button
              onClick={() => handleDelete(photo)}
              aria-label="削除"
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.6)',
                color: 'white',
                fontSize: 14,
                lineHeight: '24px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
