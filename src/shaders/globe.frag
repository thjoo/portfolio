uniform sampler2D uLand;
uniform vec3 uSunDirection;

uniform vec3 uOceanDay;
uniform vec3 uOceanNight;
uniform vec3 uLandDay;
uniform vec3 uLandNight;
uniform vec3 uIce;
uniform vec3 uSeaIce;
uniform vec3 uCityLights;
uniform vec3 uHighlight;

uniform float uTerminatorSoftness;
uniform float uTerminatorWobble;
uniform float uCoastWobble;
uniform float uPigment;
uniform float uEdgeDarkening;
uniform float uGranulation;
uniform float uIceAmount;
uniform float uIceCoast;
uniform float uCityDensity;
uniform float uSpecular;
uniform float uFresnel;


varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormalW;
varying vec3 vViewDir;

#include ./noise.glsl

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

  // Eis aus der Textur (A-Kanal): Regler 0 = Sommerminimum, 1 = Wintermaximum
  float iceThreshold = mix(0.92, 0.5, uIceAmount);
  float iceMask = smoothstep(iceThreshold - 0.02, iceThreshold + 0.02, landTex.a + wobble * 0.05);
  // Landeis hell, Meereis etwas dunkler und bläulicher -> die Küste bleibt unter dem Eis lesbar
  vec3 iceColor = mix(uSeaIce, uIce, land) * (0.85 + 0.25 * day);
  color = mix(color, iceColor, iceMask);

  // Feine Pigment-Kontur entlang der Küste, nur im Eis (Antarktis, Grönland)
  float coastLine = 1.0 - smoothstep(0.0, 0.18, abs(landTex.r - 0.5 + wobble * 0.03));
  color *= 1.0 - coastLine * iceMask * uIceCoast * (0.7 + 0.3 * edgeNoise);

  // Weicher Glanzfleck auf dem Meer, kein harter Specular
  vec3 reflected = reflect(-normalize(uSunDirection), normal);
  float spec = pow(max(dot(reflected, normalize(vViewDir)), 0.0), 6.0);
  spec *= (1.0 - land) * (0.7 + 0.3 * wash);
  color = mix(color, uHighlight, spec * uSpecular);

  // Stadtlichter aus echten Städten (B-Kanal), nur auf der Nachtseite
  float city = smoothstep(0.08, 0.45, landTex.b) * smoothstep(0.6, 0.0, day) * (1.0 - iceMask);
  color = mix(color, uCityLights, clamp(city * uCityDensity, 0.0, 1.0));

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
