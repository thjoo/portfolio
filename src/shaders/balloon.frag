// Heissluftballon im Aquarell-Stil: verlaufende Streifen mit Pigmenträndern, jeder Streifen
// leicht anders getönt, ausgesparte helle Papierstelle, Pigment-Wolken, Körnung, dunklerer Rand.
uniform vec3 uSunDirection;
uniform vec3 uStripeA;
uniform vec3 uStripeB;
uniform float uStripes;
uniform float uShade;
uniform float uPigment;
uniform float uEdge;
uniform float uBleed;
uniform float uGranulation;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vWorld;
varying vec3 vPosition;

#include ./noise.glsl
#include ./sunlight.glsl

float hash(float n) {
  return fract(sin(n * 91.7 + 13.3) * 43758.5453);
}

void main() {
  vec3 p = vPosition * 3.0;
  vec3 normal = normalize(vNormalW);
  vec3 viewDir = normalize(vViewDir);

  // Streifen über den Umfang; Grenzen wackeln und verlaufen ineinander
  float wobble = snoise(p * 1.8) * 0.08 + snoise(p * 6.0) * 0.03;
  float s = vUv.x * uStripes + wobble;
  float index = floor(s);
  float local = fract(s);
  // Abwechselnd Farbe A und B, Übergang weich (Farbe läuft in die nasse Nachbarfläche)
  float parity = mod(index, 2.0);
  float edgeA = smoothstep(0.0, uBleed, local) * (1.0 - smoothstep(1.0 - uBleed, 1.0, local));
  vec3 own = parity < 0.5 ? uStripeA : uStripeB;
  vec3 other = parity < 0.5 ? uStripeB : uStripeA;
  // Jeder Streifen von Hand gemischt: leicht andere Helligkeit und Sättigung
  float mixVariation = (hash(index + 3.0) - 0.5) * 0.18;
  own *= 1.0 + mixVariation;
  vec3 color = mix(mix(own, other, 0.5), own, edgeA);
  // Ohne Streifen (Wetterballon): einfarbig
  if (uStripes < 0.5) color = uStripeA * (1.0 + (snoise(p * 0.8) * 0.05));

  // Pigmentrand: Farbe sammelt sich beim Trocknen an der Streifengrenze
  float border = (1.0 - smoothstep(0.0, 0.12, min(local, 1.0 - local))) * step(0.5, uStripes);
  color *= 1.0 - border * uEdge * 0.45 * (0.6 + 0.4 * abs(snoise(p * 8.0)));

  // Weiches Licht von der Sonne (umwickelt, die Schattenseite wird nicht schwarz)
  // Sonne wie bei der Erde: Sonnenseite hell, Schattenseite und Erdschatten dunkel
  float lit = sunLit(normal, vWorld, uSunDirection);
  color = applySunlight(color, lit, uShade);

  // Ausgesparte Papierstelle: auf der Sonnenseite bleibt das Papier fast weiss
  vec3 halfway = normalize(normalize(uSunDirection) + viewDir);
  float highlight = smoothstep(0.82, 0.97, dot(normal, halfway) + snoise(p * 3.0) * 0.06);
  color = mix(color, vec3(0.96, 0.95, 1.0), highlight * 0.75 * earthShadow(vWorld, uSunDirection));

  // Pigment-Wolken und Körnung
  color *= 1.0 + fbm(p * 1.4 + 2.0) * uPigment;
  color *= 1.0 + (snoise(p * 40.0) * 0.6 + snoise(p * 13.0) * 0.4) * uGranulation;

  // Dunklerer, unregelmässiger Pigmentrand am Umriss
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.2);
  color *= 1.0 - rim * uEdge * (0.6 + 0.4 * snoise(p * 5.0));

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
