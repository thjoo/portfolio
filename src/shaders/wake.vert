attribute float arm;
varying vec2 vUv;
varying float vArm;
varying vec3 vLocal;

void main() {
  vUv = uv;
  vArm = arm;
  // Position in Erd-Koordinaten (der Rahmen folgt der Erde) -> für die Landmaske
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
