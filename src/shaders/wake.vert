attribute float arm;
varying vec2 vUv;
varying float vArm;

void main() {
  vUv = uv;
  vArm = arm;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
