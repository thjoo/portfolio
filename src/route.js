import * as THREE from "three";

// Breite/Länge (Grad) -> Punkt auf der Einheitskugel, passend zu den UVs der SphereGeometry
// (u = atan(z, -x) / 2π, v = 1 - acos(y) / π; Länge -180 bei u = 0)
export function latLonToVector(lat, lon, target = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(lon + 180);
  const theta = THREE.MathUtils.degToRad(90 - lat);
  return target.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
}

// Route aus Wegpunkten [Breite, Länge], dazwischen Grosskreise (slerp).
// sample(t): t von 0 bis 1 über die ganze Route
export function createRoute(waypoints) {
  const points = waypoints.map(([lat, lon]) => latLonToVector(lat, lon));
  const angles = points.slice(1).map((p, i) => points[i].angleTo(p));
  const total = angles.reduce((a, b) => a + b, 0);

  return {
    length: total,
    sample(t, target = new THREE.Vector3()) {
      let distance = THREE.MathUtils.clamp(t, 0, 1) * total;
      for (let i = 0; i < angles.length; i++) {
        if (distance <= angles[i] || i === angles.length - 1) {
          const f = angles[i] > 0 ? Math.min(distance / angles[i], 1) : 0;
          return slerpVectors(points[i], points[i + 1], f, target);
        }
        distance -= angles[i];
      }
      return target.copy(points[points.length - 1]);
    },
  };
}

function slerpVectors(a, b, f, target) {
  const angle = a.angleTo(b);
  if (angle < 1e-6) return target.copy(a);
  const s = Math.sin(angle);
  return target
    .copy(a)
    .multiplyScalar(Math.sin((1 - f) * angle) / s)
    .addScaledVector(b, Math.sin(f * angle) / s)
    .normalize();
}
