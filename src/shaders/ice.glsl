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

// Gekritzel wie mit weissem Farbstift: Linien entlang der Breitengrade, von Noise so stark
// verbogen, dass Schlaufen entstehen. Drei Lagen, die mit der Eisdichte dazukommen.
float iceScribble(vec3 p, float iceMask, float density) {
  float latitude = asin(clamp(p.y, -1.0, 1.0));
  float scribble = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 q = p + fi * 3.17;
    float lineCount = (15.0 + fi * 5.0) * density;
    float u = latitude * lineCount + fbm(q * 2.0) * 2.5 + fbm(q * 5.0 + 1.7) * 2.2;
    float d = abs(fract(u) - 0.5);
    float aa = fwidth(u) * 0.75;
    float lineWidth = 0.17 + 0.06 * snoise(q * 6.0);
    float stroke = 1.0 - smoothstep(lineWidth - aa, lineWidth + aa, d);
    // Striche setzen ab und laufen aus
    float breaks = smoothstep(-0.6, 0.0, snoise(q * vec3(5.0, 11.0, 5.0)));
    // Je dichter das Eis, desto mehr Lagen
    float layer = smoothstep(0.02 + fi * 0.12, 0.2 + fi * 0.12, iceMask);
    scribble = max(scribble, stroke * breaks * layer);
  }
  // Kreidekorn: der Strich deckt nicht überall
  float chalk = smoothstep(-0.85, 0.1, snoise(p * 120.0)) * (0.85 + 0.15 * snoise(p * 45.0));
  return scribble * chalk;
}
