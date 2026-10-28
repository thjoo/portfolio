// Flammenhülle: Kugel um den Stein, Rückseite nach hinten zur Flammenform gezogen
uniform vec3 uDirection;  // Flugrichtung (Welt)
uniform float uStretch;
uniform float uTime;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosition;
varying float vBack;

#include ./noise.glsl

void main() {
  vec3 n = normalize(normal);
  // Wie stark zeigt dieser Punkt nach hinten (weg von der Flugrichtung)?
  float back = max(dot(n, -uDirection), 0.0);
  vBack = back;
  float lick = snoise(position * 2.5 + vec3(0.0, 0.0, -uTime * 2.0)) * 0.18;
  vec3 displaced = position * (1.0 + lick) - uDirection * pow(back, 1.6) * uStretch;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vPosition = position;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
