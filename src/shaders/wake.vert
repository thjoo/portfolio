attribute float arm;
varying vec2 vUv;
varying float vArm;
varying vec3 vLocal;
varying vec3 vWorld;

void main() {
  vUv = uv;
  vArm = arm;
  // Position in Erd-Koordinaten (der Rahmen folgt der Erde) -> für die Landmaske
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
