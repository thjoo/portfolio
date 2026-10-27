uniform sampler2D uLand;
uniform vec3 uSunDirection;

uniform vec3 uOceanDay;
uniform vec3 uOceanNight;
uniform vec3 uLandDay;
uniform vec3 uLandNight;
uniform vec3 uIce;
uniform vec3 uCityLights;
uniform vec3 uHighlight;

uniform float uTerminatorSoftness;
uniform float uTerminatorWobble;
uniform float uCoastWobble;
uniform float uPigment;
uniform float uEdgeDarkening;
uniform float uGranulation;
uniform float uIceAmount;
uniform float uCityDensity;
uniform float uSpecular;
uniform float uFresnel;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormalW;
varying vec3 vViewDir;

#include ./noise.glsl

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // Rauschen auf der Kugeloberfläche (Objektraum -> keine UV-Naht)
  vec3 p = normalize(vPosition);
  float wobble = fbm(p * 6.0);
  float wash = fbm(p * 1.8 + 3.7);
  float grainFine = snoise(p * 140.0);
  float grainCoarse = snoise(p * 22.0 + 11.0);

  // Land: Küste mit Noise verschieben -> handgemalte, leicht wackelige Kontur
  vec4 landTex = texture2D(uLand, vUv);
  float landSoft = landTex.g;
  float land = smoothstep(0.42, 0.58, landTex.r + wobble * uCoastWobble);

  // Tag / Nacht
  vec3 normal = normalize(vNormalW);
  float sun = dot(normal, normalize(uSunDirection));
  float terminatorNoise = fbm(p * 3.0 + 1.3) * uTerminatorWobble;
  float day = smoothstep(-uTerminatorSoftness, uTerminatorSoftness, sun + terminatorNoise);

  vec3 ocean = mix(uOceanNight, uOceanDay, day);
  vec3 ground = mix(uLandNight, uLandDay, day);

  // Pigment-Wolken: grossflächige Helligkeitsschwankung wie ungleichmässig verteilte Farbe
  ocean *= 1.0 + wash * uPigment;
  ground *= 1.0 + wash * uPigment * 0.8;

  // Dunkler Pigmentrand: Farbe sammelt sich beim Trocknen am Rand der Fläche
  float landEdge = land * (1.0 - landSoft);
  float oceanEdge = (1.0 - land) * landSoft;
  float edgeNoise = 0.6 + 0.4 * abs(snoise(p * 9.0));
  ground *= 1.0 - landEdge * uEdgeDarkening * 1.6 * edgeNoise;
  ocean *= 1.0 - oceanEdge * uEdgeDarkening * 0.6 * edgeNoise;

  vec3 color = mix(ocean, ground, land);

  // Polkappe (Norden), helle Lasur mit unregelmässigem Rand
  float iceMask = smoothstep(0.955, 0.975, p.y + wobble * 0.03) * uIceAmount;
  color = mix(color, uIce * (0.85 + 0.25 * day), iceMask);

  // Weicher Glanzfleck auf dem Meer, kein harter Specular
  vec3 reflected = reflect(-normalize(uSunDirection), normal);
  float spec = pow(max(dot(reflected, normalize(vViewDir)), 0.0), 6.0);
  spec *= (1.0 - land) * (0.7 + 0.3 * wash);
  color = mix(color, uHighlight, spec * uSpecular);

  // Stadtlichter: Zufallspunkte in einem Raster, nur auf Land und Nachtseite
  vec2 grid = vUv * vec2(320.0, 160.0);
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float rnd = hash(cell);
  vec2 offset = vec2(hash(cell + 7.1), hash(cell + 3.3)) - 0.5;
  float dotShape = 1.0 - smoothstep(0.08, 0.16, length(local - offset * 0.6));
  float city = step(1.0 - uCityDensity, rnd) * dotShape * land * (1.0 - day) * (1.0 - iceMask);
  color = mix(color, uCityLights, city * (0.6 + 0.4 * hash(cell + 1.7)));

  // Körnung: Pigment setzt sich in den Papiertälern ab
  float granulation = grainFine * 0.6 + grainCoarse * 0.4;
  color *= 1.0 + granulation * uGranulation;

  // Leicht weicher, kaum aufgehellter Kugelrand
  float fresnel = pow(1.0 - max(dot(normal, normalize(vViewDir)), 0.0), 3.0);
  color = mix(color, uOceanDay * 1.1, fresnel * uFresnel);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
