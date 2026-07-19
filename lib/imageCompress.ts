// 写真をアップロード前に縮小・圧縮する。
// スマホのカメラ写真はそのままだと数MBあり、電波が弱い状況でのアップロードに
// 時間がかかったり失敗しやすくなるため、長辺を一定サイズに縮め、JPEGとして再圧縮する。
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  let { width, height } = bitmap;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('画像の圧縮に失敗しました'));
      },
      'image/jpeg',
      quality
    );
  });
}
