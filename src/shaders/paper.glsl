// Papierstruktur: Fasern, Zahn (Oberflächenrauheit) und Korn.
// Liefert eine "Höhe" um 0: negativ = Papiertal (Pigment sammelt sich), positiv = Erhebung.
float paperHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float paperNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(paperHash(i), paperHash(i + vec2(1.0, 0.0)), u.x),
    mix(paperHash(i + vec2(0.0, 1.0)), paperHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float paperFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += paperNoise(p) * amp;
    p = p * 2.1 + 17.3;
    amp *= 0.5;
  }
  return sum;
}

// p: Papierkoordinaten (1.0 = Bildhöhe), scale: Grösse der Struktur
float paperHeight(vec2 p, float scale, float fibers, float tooth, float grain) {
  vec2 q = p * scale;
  float f = paperFbm(q * vec2(18.0, 70.0)) - 0.5;
  float t = paperFbm(q * 60.0 + 3.1) - 0.5;
  float g = paperHash(floor(q * 400.0)) - 0.5;
  return f * fibers + t * tooth + g * grain;
}
