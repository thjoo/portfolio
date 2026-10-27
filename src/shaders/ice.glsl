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

// Gekritzel wie mit fetter Wachs-/Ölkreide: liefert den "Druck" 0..1 der Striche.
// Breite Striche entlang der Breitengrade, von Noise zu Schlaufen verbogen, in der Mitte stärker.
// Ob Pigment haftet, entscheidet danach der Papierzahn (siehe crayonDeposit).
float iceScribble(vec3 p, float iceMask, float density) {
  float pressure = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 q = p + fi * 3.17;
    // Jede Lage hat eine leicht geneigte Achse: die Striche kreuzen sich,
    // statt am Pol einen gemeinsamen Mittelpunkt (Fingerabdruck) zu bilden
    vec3 axis = normalize(vec3(fi == 1.0 ? 0.32 : (fi == 2.0 ? -0.24 : 0.0), 1.0, fi == 1.0 ? 0.12 : (fi == 2.0 ? -0.3 : 0.0)));
    float axial = dot(p, axis);
    float latitude = asin(clamp(axial, -1.0, 1.0));
    // Direkt um die Achse ausblenden
    float poleFade = 1.0 - smoothstep(0.93, 0.985, abs(axial));
    float lineCount = (11.0 + fi * 4.0) * density;
    float u = latitude * lineCount + fbm(q * 1.6) * 3.0 + snoise(q * 4.0 + 1.7) * 0.6;
    float d = abs(fract(u) - 0.5) * 2.0;
    // Breites, weiches Strichprofil: Mitte voll, Rand läuft aus
    float width = 0.8 + 0.2 * snoise(q * 3.0);
    float stroke = 1.0 - smoothstep(0.0, width, d);
    // Druck schwankt entlang des Strichs, Striche setzen ab
    float strokePressure = 0.6 + 0.4 * snoise(q * vec3(4.0, 9.0, 4.0));
    float breaks = smoothstep(-0.7, -0.1, snoise(q * vec3(3.0, 7.0, 3.0)));
    // Je dichter das Eis, desto mehr Lagen
    float layer = smoothstep(0.02 + fi * 0.15, 0.25 + fi * 0.15, iceMask);
    pressure = max(pressure, stroke * strokePressure * breaks * layer * poleFade);
  }
  return pressure * smoothstep(0.0, 0.3, iceMask);
}

// Papierzahn für Wachskreide: organische Körnung auf der Kugel, ohne Raster.
// Liefert eine Höhe um 0 (negativ = Tal).
float crayonTooth(vec3 p, float scale) {
  vec3 q = p * scale;
  return snoise(q * 420.0) * 0.45 + snoise(q * 190.0 + 3.1) * 0.35 + snoise(q * 70.0 + 7.3) * 0.2;
}

// Wachskreide haftet nur auf den Papierspitzen; mit mehr Druck schliesst sich die Fläche.
float crayonDeposit(float pressure, float tooth) {
  return smoothstep(0.34, 0.52, pressure + tooth * 0.5);
}
