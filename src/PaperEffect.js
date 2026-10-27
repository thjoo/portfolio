import { Effect, EffectAttribute } from "postprocessing";
import { Uniform } from "three";
import paper from "./shaders/paper.glsl?raw";

// Letzter Pass, nach Kuwahara, damit die feine Papierstruktur nicht weggeglättet wird.
// Über den Tiefenpuffer wird unterschieden: Erde (Tiefe < 1) oder Hintergrund (Tiefe = 1).
// Beide bekommen ihr eigenes Papier.
const fragmentShader = /* glsl */ `
  uniform float uDistortion;
  uniform float uAspect;

  uniform float uBgScale;
  uniform float uBgFibers;
  uniform float uBgTooth;
  uniform float uBgGrain;

  uniform float uEarthScale;
  uniform float uEarthFibers;
  uniform float uEarthTooth;
  uniform float uEarthGrain;
  uniform float uEarthPooling;

  ${paper}

  void mainUv(inout vec2 uv) {
    vec2 p = uv * vec2(uAspect, 1.0);
    vec2 offset = vec2(paperFbm(p * 4.0), paperFbm(p * 4.0 + 5.2)) - 0.5;
    uv += offset * uDistortion;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec2 p = uv * vec2(uAspect, 1.0);
    float isEarth = step(depth, 0.9999);

    float bg = paperHeight(p, uBgScale, uBgFibers, uBgTooth, uBgGrain);
    float earth = paperHeight(p, uEarthScale, uEarthFibers, uEarthTooth, uEarthGrain);
    // Auf der Erde sammelt sich Pigment in den Papiertälern: Täler dunkler als Erhebungen hell
    earth = earth < 0.0 ? earth * uEarthPooling : earth * (2.0 - uEarthPooling) * 0.5;

    float h = mix(bg, earth, isEarth);
    outputColor = vec4(inputColor.rgb * (1.0 + h), inputColor.a);
  }
`;

export class PaperEffect extends Effect {
  constructor() {
    super("PaperEffect", fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map(
        [
          "uDistortion", "uAspect",
          "uBgScale", "uBgFibers", "uBgTooth", "uBgGrain",
          "uEarthScale", "uEarthFibers", "uEarthTooth", "uEarthGrain", "uEarthPooling",
        ].map((name) => [name, new Uniform(0)])
      ),
    });
  }
}
