// Feuerschweif im gemalten Stil: vorne gelb, dann orange, hinten violett; schmaler und lichter nach hinten
uniform float uTime;
uniform float uOpacity;
uniform vec3 uHot;
uniform vec3 uWarm;
uniform vec3 uCool;

varying vec2 vUv;

#include ./noise.glsl

void main() {
  float along = vUv.x;  // 0 am Kopf, 1 am Ende
  float across = abs(vUv.y - 0.5) * 2.0;

  // Schweif wird nach hinten schmaler, Ränder flackern
  // Beginnt so breit wie die Flammenhülle und wird nach hinten schmaler
  float width = mix(1.0, 0.25, along);
  float flicker = snoise(vec3(along * 7.0 - uTime * 3.0, vUv.y * 2.5, 0.0)) * 0.25;
  float band = 1.0 - smoothstep(width * 0.45, width, across + flicker);

  // Gemalte Flammenzungen: bricht nach hinten auf
  float tongues = snoise(vec3(along * 16.0 - uTime * 5.0, vUv.y * 5.0, 3.0)) * 0.5
                + snoise(vec3(along * 34.0 - uTime * 8.0, vUv.y * 9.0, 7.0)) * 0.3;
  float broken = smoothstep(-0.4, 0.3, tongues + (1.0 - along) * 0.9);

  vec3 color = mix(uHot, uWarm, smoothstep(0.0, 0.35, along));
  color = mix(color, uCool, smoothstep(0.35, 1.0, along));
  // Mitte heller, wie ein ausgesparter Lichtkern
  color = mix(color, vec3(1.0, 0.97, 0.88), (1.0 - smoothstep(0.0, 0.35, across)) * (1.0 - smoothstep(0.0, 0.3, along)) * 0.7);

  // Vorne (unter der Flammenhülle) weich einblenden: Flamme und Schweif gehen ineinander über
  float alpha = band * broken * pow(1.0 - along, 1.2) * smoothstep(0.02, 0.22, along) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
