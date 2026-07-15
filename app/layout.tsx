import './globals.css';

export const metadata = {
  title: '散歩の地図',
  description: '歩いて写真を撮ると、地図が少しずつ色づいていくアプリ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
