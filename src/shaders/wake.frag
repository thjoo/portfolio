// Kielwasser als gemaltes Schaumband: hinten breiter und lichter, mit Noise aufgebrochen
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;
varying float vArm;

#include ./noise.glsl

void main() {
  float along = vUv.x;  // 0 am Heck, 1 am Ende
  float across = abs(vUv.y - 0.5) * 2.0;  // 0 Mitte, 1 Rand

  // Weiche, leicht ausgefranste Ränder des Bandes
  float edgeNoise = snoise(vec3(along * 9.0, vUv.y * 2.0, vArm * 3.1)) * 0.25;
  float band = 1.0 - smoothstep(0.35, 0.95, across + edgeNoise);

  // Schaum bricht auf und treibt langsam nach hinten
  float foam = snoise(vec3(along * 14.0 - uTime * 0.6, vUv.y * 3.0, vArm * 7.7)) * 0.5
             + snoise(vec3(along * 32.0 - uTime * 1.1, vUv.y * 6.0, vArm)) * 0.3;
  float broken = smoothstep(-0.35, 0.25, foam + (1.0 - along) * 0.7);

  float fade = pow(1.0 - along, 1.4) * smoothstep(0.0, 0.06, along);
  float alpha = band * broken * fade * uOpacity;
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
