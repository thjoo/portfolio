// Malmaterial für Objekte; unterstützt InstancedMesh mit eigener Farbe je Instanz
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vWorld;
varying vec3 vPosition;
varying vec3 vTint;
varying vec2 vUv;

void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  vTint = vec3(1.0);
  vUv = uv;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    n = mat3(instanceMatrix) * n;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 worldPosition = modelMatrix * local;
  vPosition = local.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vWorld = worldPosition.xyz;
  vViewDir = normalize(cameraPosition - worldPosition.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
