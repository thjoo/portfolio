// Heissluftballon im Aquarell-Stil: Streifen, weiches Licht, Pigment-Wolken, dunklerer Rand
uniform vec3 uSunDirection;
uniform vec3 uStripeA;
uniform vec3 uStripeB;
uniform float uStripes;
uniform float uShade;
uniform float uPigment;
uniform float uEdge;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosition;

#include ./noise.glsl

void main() {
  vec3 p = vPosition * 3.0;

  // Streifen über den Umfang, Grenzen leicht wackelig wie von Hand
  float wobble = snoise(p * 2.0) * 0.06 + snoise(p * 7.0) * 0.02;
  float stripe = fract(vUv.x * uStripes + wobble);
  float stripeMask = smoothstep(0.47, 0.53, stripe) * (1.0 - smoothstep(0.97, 1.0, stripe));
  vec3 color = mix(uStripeA, uStripeB, stripeMask);

  // Weiches Licht von der Sonne (umwickelt, damit die Schattenseite nicht schwarz wird)
  vec3 normal = normalize(vNormalW);
  float diffuse = dot(normal, normalize(uSunDirection)) * 0.5 + 0.5;
  color *= mix(1.0 - uShade, 1.0 + uShade * 0.25, smoothstep(0.1, 0.9, diffuse));

  // Pigment-Wolken
  color *= 1.0 + fbm(p * 1.5 + 2.0) * uPigment;

  // Dunklerer Pigmentrand am Umriss
  float rim = pow(1.0 - max(dot(normal, normalize(vViewDir)), 0.0), 2.5);
  color *= 1.0 - rim * uEdge * (0.7 + 0.3 * snoise(p * 5.0));

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
