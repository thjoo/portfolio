// Gemeinsame Beleuchtung aller Objekte: dieselbe Sonne wie bei der Erde.
// Erde im Ursprung, Radius 1. Punkte hinter der Erde (im Schattenzylinder) liegen im Erdschatten.

// 1 = von der Sonne beschienen, 0 = im Erdschatten (mit weichem Halbschatten)
float earthShadow(vec3 worldPosition, vec3 sunDirection) {
  vec3 L = normalize(sunDirection);
  float along = dot(worldPosition, L);              // < 0: hinter der Erde (von der Sonne aus)
  float fromAxis = length(worldPosition - along * L); // Abstand zur Schattenachse
  float behind = 1.0 - smoothstep(-0.12, 0.08, along);
  float inside = 1.0 - smoothstep(0.92, 1.1, fromAxis);
  return 1.0 - behind * inside;
}

// Wie hell ist ein Punkt: Seite zur Sonne × nicht im Erdschatten (0 dunkel … 1 hell)
float sunLit(vec3 normal, vec3 worldPosition, vec3 sunDirection) {
  float facing = smoothstep(-0.35, 0.55, dot(normalize(normal), normalize(sunDirection)));
  return facing * earthShadow(worldPosition, sunDirection);
}

// Farbe beleuchten: im Licht leicht aufgehellt, im Dunkeln wie die Nachtseite der Erde (dunkel, kühl)
vec3 applySunlight(vec3 color, float lit, float shade) {
  vec3 night = color * vec3(0.3, 0.28, 0.46) + vec3(0.03, 0.025, 0.07);
  vec3 day = color * (1.0 + shade * 0.15);
  return mix(night, day, lit);
}
