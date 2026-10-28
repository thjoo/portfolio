// Eis-Gekritzel für den Papier-Pass nach Kuwahara. Braucht snoise aus noise.glsl.

// Eis als gekritzeltes Knäuel über dem Pol (wie mit dem Stift drübergezeichnet):
// viele grosse, leicht wackelige Ellipsen um den Pol, versetzt und gedreht. Zusammen ergeben
// sie eine runde, gekritzelte Fläche; ihr Rand ist dort, wo die Schlaufen aufhören.
// p: Punkt auf der Einheitskugel, pole: +1 Nord / -1 Süd, radiusDeg: Grösse des Knäuels.
// Liefert den "Druck" 0..1; ob Pigment haftet, entscheidet danach der Papierzahn (crayonDeposit).
float scribbleHash(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

float scribbleBall(vec3 p, float pole, float radiusDeg, float loops, float widthPx, float messiness) {
  // Stereografische Projektion vom Pol: flache 2D-Koordinaten um den Pol
  float h = p.y * pole;
  vec2 q = vec2(p.x, p.z * pole) / (1.0 + max(h, 0.0));
  // Pixelgrösse in q-Einheiten: vor jeder Verzweigung bestimmen (Ableitungen brauchen gleichförmigen Ablauf)
  float pixel = max(length(fwidth(q)) * 0.7071, 1e-6);
  float radius = tan(radians(radiusDeg) * 0.5);
  float inside = step(0.0, h) * step(length(q), radius * 1.6);
  if (inside < 0.5) return 0.0;

  // Kreideschichten: jeder Strich legt Pigment dazu (1 - Produkt der Lücken)
  float uncovered = 1.0;
  float seed = pole > 0.0 ? 11.0 : 47.0;
  for (int i = 0; i < 96; i++) {
    float fi = float(i);
    if (fi >= loops) break;
    float k = seed + fi * 7.13;
    // Mittelpunkte häufen sich nahe am Pol -> die Mitte wird durch Überlagerung dicht
    float spreadRadius = pow(scribbleHash(k), 1.6) * radius * 0.6 * messiness;
    float spreadAngle = scribbleHash(k + 1.3) * 6.28318;
    vec2 center = vec2(cos(spreadAngle), sin(spreadAngle)) * spreadRadius;
    // Viele kleine und mittlere, wenige grosse Schlaufen
    float a = radius * (0.12 + 0.88 * pow(scribbleHash(k + 2.1), 1.2));
    float b = a * (0.55 + 0.45 * scribbleHash(k + 3.7));
    float angle = scribbleHash(k + 4.9) * 3.14159;
    float c = cos(angle);
    float s = sin(angle);
    vec2 r = q - center;
    r = vec2(c * r.x + s * r.y, -s * r.x + c * r.y);
    // Wackelige Hand: Radius schwankt entlang der Schlaufe
    float t = atan(r.y, r.x);
    float wobble = 1.0 + 0.07 * sin(t * 2.0 + k) + 0.04 * sin(t * 5.0 + k * 1.7);
    float f = length(r / vec2(a, b)) - wobble;
    // Abstand zur Schlaufe in Pixeln (Gradient der Ellipse ~ 1 / mittlerer Radius)
    float dPx = abs(f) * (a + b) * 0.5 / pixel;
    float halfWidth = widthPx * (0.75 + 0.5 * scribbleHash(k + 6.1));
    // Dicker Farbstift: breites, weich abfallendes Druckprofil.
    // Im Abfall entscheidet das Papierkorn, wo Pigment haftet -> ausgefranste Ränder.
    float stroke = 1.0 - smoothstep(0.0, halfWidth * 1.7, dPx);
    // Druck schwankt entlang des Strichs: stellenweise trocken und lückig
    stroke *= 0.8 + 0.3 * sin(t * 3.0 + k) * sin(t * 7.3 + k * 2.3);
    // Manche Schlaufen sind nur Bögen (Stift abgesetzt)
    float arcStart = scribbleHash(k + 8.3) * 6.28318;
    float arcLength = 3.5 + scribbleHash(k + 9.1) * 3.5;
    float along = mod(t + 3.14159 - arcStart, 6.28318);
    stroke *= 1.0 - smoothstep(arcLength - 0.3, arcLength, along);
    uncovered *= 1.0 - stroke * 0.62;
  }
  return 1.0 - uncovered;
}

// Papierzahn für Wachskreide: organische Körnung auf der Kugel, ohne Raster.
// Liefert eine Höhe um 0 (negativ = Tal).
float crayonTooth(vec3 p, float scale) {
  vec3 q = p * scale;
  return snoise(q * 420.0) * 0.45 + snoise(q * 190.0 + 3.1) * 0.35 + snoise(q * 70.0 + 7.3) * 0.2;
}

// Wachskreide haftet nur auf den Papierspitzen; mit mehr Druck schliesst sich die Fläche.
float crayonDeposit(float pressure, float tooth) {
  return smoothstep(0.18, 0.9, pressure + tooth * 0.4);
}
