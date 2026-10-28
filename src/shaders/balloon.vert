uniform float uOutlineWobble;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosition;

#include ./noise.glsl

void main() {
  // Leicht unregelmässiger Umriss wie von Hand gemalt
  vec3 displaced = position + normal * snoise(position * 2.5) * uOutlineWobble;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vUv = uv;
  vPosition = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
