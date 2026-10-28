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

// Prüft eine Route gegen die Landmaske (R-Kanal der Landtextur) und liefert die Stellen über Land.
// Gedacht für die Entwicklung: neue Routen sofort kontrollieren.
export function findLandOnRoute(route, landTexture, samples = 1500) {
  const { data, width, height } = landTexture.image;
  const hits = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    route.sample(i / samples, v);
    const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)));
    let lon = THREE.MathUtils.radToDeg(Math.atan2(v.z, -v.x)) - 180;
    if (lon < -180) lon += 360;
    const x = Math.floor(((lon + 180) / 360) * width) % width;
    // Die Textur ist mit flipY hochgeladen; die Daten liegen von oben (Nordpol) nach unten
    const y = Math.floor(((90 - lat) / 180) * height);
    if (data[(y * width + x) * 4] > 100) hits.push([+lat.toFixed(2), +lon.toFixed(2)]);
  }
  return hits;
}
