// Malmaterial im Aquarell-Stil: Grundfarbe (× Instanzfarbe), weiches Licht, Pigment-Wolken,
// Körnung und dunklerer Rand – passend zu Ballonen und Erde
uniform vec3 uColor;
uniform vec3 uSunDirection;
uniform float uShade;
uniform float uPigment;
uniform float uEdge;
uniform float uGranulation;
uniform float uNoiseScale;
uniform float uBoxEdges;
uniform vec3 uGlow;
uniform float uGlowStrength;
uniform float uGlowAlways;   // 1 = leuchtet auch am Tag (Lava)
uniform float uLandLike;     // 1 = färbt sich wie das Land der Erde: Tag- und Nachtfarbe statt Licht und Schatten
uniform vec3 uNightColor;
uniform float uTerminator;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vWorld;
varying vec3 vPosition;
varying vec3 vTint;
varying vec2 vUv;

#include ./noise.glsl
#include ./sunlight.glsl

void main() {
  vec3 p = vPosition * uNoiseScale;
  vec3 normal = normalize(vNormalW);
  vec3 color = uColor * vTint;

  // Sonne wie bei der Erde: Sonnenseite hell, Schattenseite und Erdschatten dunkel
  float lit = sunLit(normal, vWorld, uSunDirection);
  if (uLandLike > 0.5) {
    // Wie die Erdoberfläche: Tag/Nacht nach der Lage auf der Kugel, Flanken nur leicht schattiert (Relief)
    float day = smoothstep(-uTerminator, uTerminator, dot(normalize(vWorld), normalize(uSunDirection)));
    float relief = mix(0.82, 1.08, smoothstep(-0.35, 0.55, dot(normal, normalize(uSunDirection))));
    color = mix(uNightColor * vTint, color * relief, day);
  } else {
    color = applySunlight(color, lit, uShade);
  }
  color *= 1.0 + fbm(p * 1.5 + 2.0) * uPigment;
  color *= 1.0 + (snoise(p * 40.0) * 0.6 + snoise(p * 13.0) * 0.4) * uGranulation;

  float rim = pow(1.0 - max(dot(normal, normalize(vViewDir)), 0.0), 2.2);
  color *= 1.0 - rim * uEdge * 0.6;

  // Kanten betonen (für Boxen: UV pro Fläche 0..1): dunklere, leicht unregelmässige Pigmentlinie
  float toEdge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edgeWidth = 0.07 + 0.03 * snoise(p * 9.0);
  float edgeLine = 1.0 - smoothstep(edgeWidth * 0.4, edgeWidth, toEdge);
  color *= 1.0 - edgeLine * uBoxEdges * 0.5;

  // Nachts leuchten (Fenster …): nur dort, wo die Erde zwischen Objekt und Sonne liegt
  float night = 1.0 - earthShadow(vWorld, uSunDirection);
  color = mix(color, uGlow, max(night, uGlowAlways) * uGlowStrength);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
