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
