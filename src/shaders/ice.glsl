// Eis: wird im Erd-Shader (Grundfläche) und im Papier-Pass nach Kuwahara (Gekritzel) verwendet.
// Braucht snoise/fbm aus noise.glsl.

// Eisdichte 0..1 aus dem A-Kanal der Landtextur. p = Punkt auf der Einheitskugel (Objektraum).
// season: 0 = Sommer, 1 = Winter (je Halbkugel)
float iceCoverage(vec3 p, float iceValue, float iceNorth, float iceSouth, float irregular, float softness) {
  float season = p.y > 0.0 ? iceNorth : iceSouth;
  float threshold = mix(0.92, 0.5, season);
  // Weicher, ausfransender Rand zum Wasser, dazu grosse Lappen und Buchten statt eines Kreises
  float lobes = (fbm(p * 2.2 + 8.0) * 0.14 + fbm(p * 5.5 + 3.0) * 0.06) * irregular;
  float edgeNoise = lobes + fbm(p * 6.0) * 0.06 + fbm(p * 14.0 + 2.0) * 0.04 * softness * 10.0;
  float value = iceValue + edgeNoise * step(iceValue, 0.99);
  return smoothstep(threshold - softness, threshold + softness, value);
}

// Gekritzel wie ein Knäuel aus Kreidestrichen: lange, geschwungene Schlaufen kreuz und quer.
// Jede Lage = Höhenlinien eines weichen Noise-Feldes (geschlossene, unregelmässige Schlaufen),
// mehrere Lagen übereinander ergeben das Knäuel. Strichbreite konstant in Pixeln wie bei einem Stift.
// Liefert den "Druck" 0..1; ob Pigment haftet, entscheidet danach der Papierzahn (crayonDeposit).
const int SCRIBBLE_LAYERS = 5;

float iceScribble(vec3 p, float iceMask, float density, float lineWidthPx) {
  float pressure = 0.0;
  for (int i = 0; i < SCRIBBLE_LAYERS; i++) {
    float fi = float(i);
    vec3 seed = vec3(fi * 5.3, fi * 2.1, fi * 7.9);
    float field = snoise(p * (1.4 + fi * 0.25) + seed) + 0.45 * snoise(p * (3.0 + fi * 0.4) + seed * 1.7);
    float u = field * 5.0 * density;
    // Abstand zur nächsten Linie in Pixeln
    float dPx = abs(fract(u) - 0.5) / max(fwidth(u), 1e-4);
    float halfWidth = lineWidthPx * (0.8 + 0.4 * snoise(p * 4.0 + seed));
    float stroke = 1.0 - smoothstep(halfWidth - 0.8, halfWidth + 0.8, dPx);
    // Lange Bögen: Striche setzen nur selten ab
    float breaks = smoothstep(-0.8, -0.4, snoise(p * 2.0 + seed * 0.7));
    // Je dichter das Eis, desto mehr Lagen
    float layer = smoothstep(0.02 + fi * 0.08, 0.2 + fi * 0.08, iceMask);
    pressure = max(pressure, stroke * breaks * layer);
  }
  return pressure;
}

// Papierzahn für Wachskreide: organische Körnung auf der Kugel, ohne Raster.
// Liefert eine Höhe um 0 (negativ = Tal).
float crayonTooth(vec3 p, float scale) {
  vec3 q = p * scale;
  return snoise(q * 420.0) * 0.45 + snoise(q * 190.0 + 3.1) * 0.35 + snoise(q * 70.0 + 7.3) * 0.2;
}

// Wachskreide haftet nur auf den Papierspitzen; mit mehr Druck schliesst sich die Fläche.
float crayonDeposit(float pressure, float tooth) {
  return smoothstep(0.3, 0.6, pressure + tooth * 0.35);
}
