// Flammen um den Stein: am Rand heller, flackernd, vorne heiss (gelb), hinten orange
uniform float uTime;
uniform float uHeat;
uniform vec3 uHot;
uniform vec3 uWarm;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosition;
varying float vBack;

#include ./noise.glsl

void main() {
  vec3 n = normalize(vNormalW);
  float facing = abs(dot(n, normalize(vViewDir)));
  float rim = pow(1.0 - facing, 1.4);

  float flicker = snoise(vPosition * 3.0 + vec3(0.0, uTime * 3.0, 0.0)) * 0.5
                + snoise(vPosition * 7.0 - vec3(uTime * 5.0)) * 0.3;
  float tongues = smoothstep(-0.45, 0.35, flicker + 0.25);

  vec3 color = mix(uHot, uWarm, smoothstep(0.1, 0.8, vBack));
  // Deckend wie Farbe; nach hinten und am Rand züngelnd lichter
  float alpha = (0.6 + 0.4 * rim) * tongues * uHeat * (1.0 - vBack * 0.45) * 0.9;
  color = mix(color, vec3(1.0, 0.96, 0.82), (1.0 - rim) * (1.0 - vBack) * 0.5);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
