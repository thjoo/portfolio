import { Effect, EffectAttribute } from "postprocessing";
import { Matrix4, Uniform } from "three";
import paper from "./shaders/paper.glsl?raw";

// Letzter Pass, nach Kuwahara, damit die feine Papierstruktur nicht weggeglättet wird.
// Über den Tiefenpuffer wird unterschieden: Erde (Tiefe < 1) oder Hintergrund (Tiefe = 1).
// Beide bekommen ihr eigenes Papier.
// Für "dreht mit" wird aus Tiefe + Kamera der Punkt auf der Kugel im Objektraum der Erde
// zurückgerechnet: das Papier klebt dann an der Oberfläche und dreht sich mit.
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
  uniform float uEarthFollow;
  uniform mat4 uInverseProjection;
  uniform mat4 uCameraWorld;
  uniform mat4 uGlobeInverse;


  ${paper}

  // Papier triplanar auf die Kugel projizieren (keine Naht, keine verzerrten Pole)
  float sphericalPaper(vec3 pos, float scale, float fibers, float tooth, float grain) {
    vec3 n = abs(normalize(pos));
    n = pow(n, vec3(4.0));
    n /= n.x + n.y + n.z;
    vec2 q = pos.xy * 0.5;
    return paperHeight(pos.zy * 0.5, scale, fibers, tooth, grain) * n.x
      + paperHeight(pos.xz * 0.5 + 7.0, scale, fibers, tooth, grain) * n.y
      + paperHeight(q + 13.0, scale, fibers, tooth, grain) * n.z;
  }

  void mainUv(inout vec2 uv) {
    vec2 p = uv * vec2(uAspect, 1.0);
    vec2 offset = vec2(paperFbm(p * 4.0), paperFbm(p * 4.0 + 5.2)) - 0.5;
    uv += offset * uDistortion;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec2 p = uv * vec2(uAspect, 1.0);
    float isEarth = step(depth, 0.9999);

    float bg = paperHeight(p, uBgScale, uBgFibers, uBgTooth, uBgGrain);
    float earth;
    if (uEarthFollow > 0.5 && isEarth > 0.5) {
      vec4 view = uInverseProjection * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
      vec4 world = uCameraWorld * vec4(view.xyz / view.w, 1.0);
      vec3 local = (uGlobeInverse * world).xyz;
      earth = sphericalPaper(local, uEarthScale, uEarthFibers, uEarthTooth, uEarthGrain);
    } else {
      earth = paperHeight(p, uEarthScale, uEarthFibers, uEarthTooth, uEarthGrain);
    }
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
          "uEarthScale", "uEarthFibers", "uEarthTooth", "uEarthGrain", "uEarthPooling", "uEarthFollow",
        ]
          .map((name) => [name, new Uniform(0)])
          .concat(
            ["uInverseProjection", "uCameraWorld", "uGlobeInverse"].map((name) => [
              name,
              new Uniform(new Matrix4()),
            ])
          )
      ),
    });
  }
}
