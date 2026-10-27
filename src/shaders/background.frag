uniform vec2 uResolution;
uniform vec3 uColor;
uniform vec3 uWashColor;
uniform float uWash;
uniform float uVignette;

#include ./paper.glsl

void main() {
  vec2 p = gl_FragCoord.xy / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Ungleichmässige Lasur: grossflächig hellere und dunklere Stellen im Lila
  float wash = paperFbm(p * 1.6 + 4.0);
  vec3 color = mix(uColor, uWashColor, smoothstep(0.3, 0.75, wash) * uWash);

  // Oben etwas heller, wie im Bild
  color *= 1.0 + (uv.y - 0.5) * uWash * 0.25;

  // Vignette
  float d = length((uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0));
  color *= 1.0 - smoothstep(0.35, 1.1, d) * uVignette;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
