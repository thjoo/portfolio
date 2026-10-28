// Weicher Schein (Kopf des Meteoriten, Aufblitzen beim Verglühen)
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  float alpha = pow(1.0 - smoothstep(0.0, 1.0, d), 2.0) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
