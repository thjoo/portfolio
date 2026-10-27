import { Effect } from "postprocessing";
import { Uniform } from "three";

// Papier-Pass über das ganze Bild:
// - leichte UV-Verzerrung (nichts wirkt perfekt gerendert)
// - Papierfasern + Körnung
// - sanfte Vignette
const fragmentShader = /* glsl */ `
  uniform float uDistortion;
  uniform float uGrain;
  uniform float uFibers;
  uniform float uVignette;
  uniform float uAspect;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += valueNoise(p) * amp;
      p *= 2.1;
      amp *= 0.5;
    }
    return sum;
  }

  void mainUv(inout vec2 uv) {
    vec2 p = uv * vec2(uAspect, 1.0);
    vec2 offset = vec2(fbm(p * 4.0), fbm(p * 4.0 + 5.2)) - 0.5;
    uv += offset * uDistortion;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 p = uv * vec2(uAspect, 1.0);
    vec3 color = inputColor.rgb;

    // Papierfasern: gestreckter Noise, grob + fein
    float fibers = fbm(p * vec2(60.0, 220.0)) - 0.5;
    float tooth = fbm(p * 180.0) - 0.5;
    float grain = hash(floor(uv * resolution)) - 0.5;
    color *= 1.0 + fibers * uFibers + tooth * uFibers * 0.8 + grain * uGrain;

    // Vignette
    float d = length((uv - 0.5) * vec2(uAspect, 1.0));
    color *= 1.0 - smoothstep(0.35, 1.1, d) * uVignette;

    outputColor = vec4(color, inputColor.a);
  }
`;

export class PaperEffect extends Effect {
  constructor() {
    super("PaperEffect", fragmentShader, {
      uniforms: new Map([
        ["uDistortion", new Uniform(0.003)],
        ["uGrain", new Uniform(0.06)],
        ["uFibers", new Uniform(0.12)],
        ["uVignette", new Uniform(0.25)],
        ["uAspect", new Uniform(1)],
      ]),
    });
  }
}
