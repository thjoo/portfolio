varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vUv = uv;
  vPosition = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
