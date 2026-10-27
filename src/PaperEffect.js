import { Effect, EffectAttribute } from "postprocessing";
import { Color, Matrix4, Uniform, Vector3 } from "three";
import paper from "./shaders/paper.glsl?raw";
import noise from "./shaders/noise.glsl?raw";
import ice from "./shaders/ice.glsl?raw";

// Letzter Pass, nach Kuwahara, damit die feine Papierstruktur nicht weggeglättet wird.
// Über den Tiefenpuffer wird unterschieden: Erde (Tiefe < 1) oder Hintergrund (Tiefe = 1).
// Beide bekommen ihr eigenes Papier.
// Für "dreht mit" wird aus Tiefe + Kamera der Punkt auf der Kugel im Objektraum der Erde
// zurückgerechnet: das Papier klebt dann an der Oberfläche und dreht sich mit.
// Derselbe Punkt dient für das Gekritzel im Eis, das hier nach Kuwahara scharf bleibt.
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

  uniform sampler2D uLand;
  uniform float uIceNorth;
  uniform float uIceSouth;
  uniform float uIceIrregular;
  uniform float uIceSoftness;
  uniform float uScribble;
  uniform float uScribbleDensity;
  uniform float uIceCoast;
  uniform vec3 uIceColor;
  uniform vec3 uSunDirection;


  ${paper}
  ${noise}
  ${ice}

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
    vec3 color = inputColor.rgb;
    vec3 local = vec3(0.0);
    if (isEarth > 0.5) {
      vec4 view = uInverseProjection * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
      vec4 world = uCameraWorld * vec4(view.xyz / view.w, 1.0);
      local = normalize((uGlobeInverse * world).xyz);

      // Gekritzel im Eis. UV wie bei SphereGeometry: u = atan(z, -x) / 2pi, v = 1 - acos(y) / pi
      vec2 sphereUv = vec2(atan(local.z, -local.x) / 6.28318530718, 1.0 - acos(clamp(local.y, -1.0, 1.0)) / 3.14159265359);
      sphereUv.x = fract(sphereUv.x);
      vec4 landTexel = texture2D(uLand, sphereUv);
      float iceValue = landTexel.a;
      float iceMask = iceCoverage(local, iceValue, uIceNorth, uIceSouth, uIceIrregular, uIceSoftness);
      if (iceMask > 0.001) {
        float sun = dot(normalize(world.xyz), normalize(uSunDirection));
        float light = 0.85 + 0.25 * smoothstep(-0.2, 0.2, sun);
        float pressure = iceScribble(local, iceMask, uScribbleDensity);
        // Auf dem Landeis weniger Druck, damit die Küste (z. B. der Antarktis) lesbar bleibt
        float landIce = smoothstep(0.3, 0.7, landTexel.r);
        pressure *= mix(1.0, 0.62, landIce);
        // Papierzahn für die Kreide, direkt auf der Kugel
        float tooth = crayonTooth(local, uEarthScale * 0.7);
        float scribble = crayonDeposit(pressure, tooth);
        color = mix(color, uIceColor * light * 1.05, clamp(scribble * uScribble, 0.0, 1.0));
        // Küstenlinie über dem Gekritzel
        float coastLine = 1.0 - smoothstep(0.0, 0.22, abs(landTexel.r - 0.5));
        color *= 1.0 - coastLine * iceMask * uIceCoast;
      }
    }

    float earth;
    if (uEarthFollow > 0.5 && isEarth > 0.5) {
      earth = sphericalPaper(local, uEarthScale, uEarthFibers, uEarthTooth, uEarthGrain);
    } else {
      earth = paperHeight(p, uEarthScale, uEarthFibers, uEarthTooth, uEarthGrain);
    }
    // Auf der Erde sammelt sich Pigment in den Papiertälern: Täler dunkler als Erhebungen hell
    earth = earth < 0.0 ? earth * uEarthPooling : earth * (2.0 - uEarthPooling) * 0.5;

    float h = mix(bg, earth, isEarth);
    outputColor = vec4(color * (1.0 + h), inputColor.a);
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
            ]),
            [
              ["uLand", new Uniform(null)],
              ["uIceNorth", new Uniform(0)],
              ["uIceSouth", new Uniform(0)],
              ["uIceIrregular", new Uniform(0)],
              ["uIceSoftness", new Uniform(0.1)],
              ["uScribble", new Uniform(0)],
              ["uScribbleDensity", new Uniform(1)],
              ["uIceCoast", new Uniform(0)],
              ["uIceColor", new Uniform(new Color())],
              ["uSunDirection", new Uniform(new Vector3(0, 0, 1))],
            ]
          )
      ),
    });
  }
}
