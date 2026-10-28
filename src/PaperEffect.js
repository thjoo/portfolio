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
  uniform float uScribble;
  uniform float uScribbleDensity;
  uniform float uIceCoast;
  uniform float uScribbleWidth;
  uniform float uIceThickness;
  uniform mat4 uViewMatrix;
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
    float onGlobe = 0.0;
    if (isEarth > 0.5) {
      vec4 view = uInverseProjection * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
      vec4 world = uCameraWorld * vec4(view.xyz / view.w, 1.0);
      vec3 localRaw = (uGlobeInverse * world).xyz;
      local = normalize(localRaw);
      // Nur Pixel auf der Kugeloberfläche sind Erde; Objekte davor (Ballon …) bekommen kein Eis
      onGlobe = step(abs(length(localRaw) - 1.0), 0.0012);

      // Gekritzel im Eis. UV wie bei SphereGeometry: u = atan(z, -x) / 2pi, v = 1 - acos(y) / pi
      vec2 sphereUv = vec2(atan(local.z, -local.x) / 6.28318530718, 1.0 - acos(clamp(local.y, -1.0, 1.0)) / 3.14159265359);
      sphereUv.x = fract(sphereUv.x);
      vec4 landTexel = texture2D(uLand, sphereUv);

      // Eis = gekritzeltes Knäuel über jedem Pol. Grösse je nach Jahreszeit (0 Sommer, 1 Winter)
      float pole = local.y > 0.0 ? 1.0 : -1.0;
      float radiusDeg = pole > 0.0 ? mix(13.0, 30.0, uIceNorth) : mix(24.0, 35.0, uIceSouth);
      // Dicke: Schatten fällt von der Sonne weg; dafür die Sonnenrichtung in die Pol-Koordinaten bringen
      vec3 sunLocal = normalize(mat3(uGlobeInverse) * normalize(uSunDirection));
      vec2 sunQ = vec2(sunLocal.x, sunLocal.z * pole);
      vec2 shadowDir = sunQ / max(length(sunQ), 1e-3) * clamp(length(sunQ) * 3.0, 0.0, 1.0);
      float shadowPressure;
      float pressure = scribbleBall(local, pole, radiusDeg, 42.0 * uScribbleDensity, uScribbleWidth, uIceIrregular,
                                    shadowDir, uIceThickness, shadowPressure);
      float tooth = crayonTooth(local, uEarthScale * 0.7);
      float sun = dot(normalize(world.xyz), normalize(uSunDirection));
      float light = 0.85 + 0.25 * smoothstep(-0.2, 0.2, sun);
      // Über Landeis etwas weniger Druck, damit die Antarktis durchscheint
      float landIce = smoothstep(0.3, 0.7, landTexel.r) * step(0.97, landTexel.a);
      pressure *= mix(1.0, 0.92, landIce);
      float scribble = crayonDeposit(pressure, tooth) * uScribble * onGlobe;
      float shadowCover = crayonDeposit(shadowPressure, tooth * 0.3) * uScribble * onGlobe;

      // Schlagschatten auf dem Untergrund: weich, dunkler und violett getönt
      float castShadow = shadowCover * (1.0 - scribble);
      color = mix(color, color * vec3(0.5, 0.45, 0.78), castShadow * 0.65 * (0.5 + 0.5 * light));

      // Relief der Kreide am weichen Druckverlauf (nicht am Korn): Kanten zur Sonne glänzen,
      // abgewandte fallen dunkel ab -> die Schicht wirkt aufgetragen und dick
      vec2 sunScreen = (uViewMatrix * vec4(normalize(uSunDirection), 0.0)).xy;
      sunScreen /= max(length(sunScreen), 1e-3);
      float height = smoothstep(0.05, 0.75, pressure);
      vec2 grad = vec2(dFdx(height), dFdy(height)) * uScribbleWidth;
      float relief = clamp(-dot(grad, sunScreen) * 1.2, -1.0, 1.0) * clamp(uIceThickness / 5.0, 0.0, 2.0);
      vec3 iceColor = uIceColor * light * 1.05 * (1.0 + relief * 0.4);
      color = mix(color, iceColor, clamp(scribble, 0.0, 1.0));
    }

    float earth;
    if (uEarthFollow > 0.5 && onGlobe > 0.5) {
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
            ["uInverseProjection", "uCameraWorld", "uGlobeInverse", "uViewMatrix"].map((name) => [
              name,
              new Uniform(new Matrix4()),
            ]),
            [
              ["uLand", new Uniform(null)],
              ["uIceNorth", new Uniform(0)],
              ["uIceSouth", new Uniform(0)],
              ["uIceIrregular", new Uniform(0)],
              ["uScribble", new Uniform(0)],
              ["uScribbleDensity", new Uniform(1)],
              ["uIceCoast", new Uniform(0)],
              ["uScribbleWidth", new Uniform(1.6)],
              ["uIceThickness", new Uniform(4)],
              ["uIceColor", new Uniform(new Color())],
              ["uSunDirection", new Uniform(new Vector3(0, 0, 1))],
            ]
          )
      ),
    });
  }
}
