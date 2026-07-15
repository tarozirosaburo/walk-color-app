import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '散歩の地図',
    short_name: '散歩の地図',
    description: '歩いて写真を撮ると、地図が少しずつ色づいていくアプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f6f2',
    theme_color: '#0F6E56',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
