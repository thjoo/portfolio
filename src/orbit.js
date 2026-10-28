import * as THREE from "three";

const normal = new THREE.Vector3();
const side = new THREE.Vector3();
const basis = new THREE.Matrix4();

// Schräge Kreisbahn um den Erdmittelpunkt: zwei Achsen in der Bahnebene aus Neigung und Drehung (Grad)
export function orbitAxes(inclinationDeg, nodeDeg, axisA, axisB) {
  const inclination = THREE.MathUtils.degToRad(inclinationDeg);
  const node = THREE.MathUtils.degToRad(nodeDeg);
  normal.set(Math.sin(inclination) * Math.cos(node), Math.cos(inclination), Math.sin(inclination) * Math.sin(node));
  axisA.set(-Math.sin(node), 0, Math.cos(node));
  axisB.crossVectors(normal, axisA).normalize();
}

// Punkt auf der Bahn (Einheitsvektor nach oben), Flugrichtung und Ausrichtung:
// lokal x = vorne, y = von der Erde weg, z = rechts
export function orbitPose(axisA, axisB, angle, up, forward, quaternion) {
  up.copy(axisA).multiplyScalar(Math.cos(angle)).addScaledVector(axisB, Math.sin(angle));
  // Flugrichtung = Ableitung der Kreisbahn; rechts = vorne × oben
  forward.copy(axisA).multiplyScalar(-Math.sin(angle)).addScaledVector(axisB, Math.cos(angle));
  side.crossVectors(forward, up);
  basis.makeBasis(forward, up, side);
  quaternion.setFromRotationMatrix(basis);
}
