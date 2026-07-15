// 緯度経度を、ある基準点(origin)からの相対的なメートル座標に変換する
// 3D空間ではx=東方向, z=南方向として扱う(three.jsのY-up座標系に合わせるため)
export function latLngToLocalMeters(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number
) {
  const metersPerDegLat = 110574;
  const metersPerDegLng = 111320 * Math.cos((originLat * Math.PI) / 180);

  const x = (lng - originLng) * metersPerDegLng;
  const z = (lat - originLat) * metersPerDegLat * -1; // 北にいくほどzが小さくなるようにする

  return { x, z };
}

// 緯度経度から、スリッピーマップ方式のタイル座標(x, y)を計算する
export function lonLatToTileXY(lon: number, lat: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

// タイル座標(x, y)から、そのタイルの左上(北西)の緯度経度を計算する
export function tileXYToLonLat(x: number, y: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lon, lat };
}
