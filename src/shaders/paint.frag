// Malmaterial im Aquarell-Stil: Grundfarbe (× Instanzfarbe), weiches Licht, Pigment-Wolken,
// Körnung und dunklerer Rand – passend zu Ballonen und Erde
uniform vec3 uColor;
uniform vec3 uSunDirection;
uniform float uShade;
uniform float uPigment;
uniform float uEdge;
uniform float uGranulation;
uniform float uNoiseScale;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosition;
varying vec3 vTint;

#include ./noise.glsl

void main() {
  vec3 p = vPosition * uNoiseScale;
  vec3 normal = normalize(vNormalW);
  vec3 color = uColor * vTint;

  float diffuse = dot(normal, normalize(uSunDirection)) * 0.5 + 0.5;
  color *= mix(1.0 - uShade, 1.0 + uShade * 0.2, smoothstep(0.1, 0.9, diffuse));
  color *= 1.0 + fbm(p * 1.5 + 2.0) * uPigment;
  color *= 1.0 + (snoise(p * 40.0) * 0.6 + snoise(p * 13.0) * 0.4) * uGranulation;

  float rim = pow(1.0 - max(dot(normal, normalize(vViewDir)), 0.0), 2.2);
  color *= 1.0 - rim * uEdge * 0.6;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
