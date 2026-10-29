import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import noise from "./shaders/noise.glsl?raw";
import ice from "./shaders/ice.glsl?raw";

// Eis-Knäuel über den Polen als eigene, schwebende Schalen (Kinder der Erde, drehen mit).
// Die Schale liegt ein Stück über der Oberfläche: am Erdrand steht das Knäuel sichtbar ab, der Schatten
// darunter fällt weit versetzt auf die Erde. Die Dicke zeigt das Kreide-Relief.
// Den Schatten auf der Oberfläche malt weiterhin der Papier-Pass (PaperEffect).

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  void main() {
    vLocal = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uLand;
  uniform float uPole;
  uniform float uRadiusDeg;
  uniform float uIrregular;
  uniform float uScribble;
  uniform float uDensity;
  uniform float uWidth;
  uniform float uThickness;
  uniform float uToothScale;
  uniform vec3 uIceColor;
  uniform vec3 uSunDirection;
  varying vec3 vLocal;
  varying vec3 vWorld;

  ${noise}
  ${ice}

  void main() {
    vec3 local = normalize(vLocal);
    float unusedShadow;
    float pressure = scribbleBall(local, uPole, uRadiusDeg, 42.0 * uDensity, uWidth, uIrregular,
                                  vec2(0.0), 0.0, unusedShadow);
    // Über Landeis etwas weniger Druck, damit die Antarktis durchscheint (wie bisher)
    vec2 sphereUv = vec2(fract(atan(local.z, -local.x) / 6.28318530718), 1.0 - acos(clamp(local.y, -1.0, 1.0)) / 3.14159265359);
    vec4 landTexel = texture2D(uLand, sphereUv);
    float landIce = smoothstep(0.3, 0.7, landTexel.r) * step(0.97, landTexel.a);
    pressure *= mix(1.0, 0.92, landIce);

    // Relief der Kreide am Druckverlauf (Ableitungen vor dem discard bestimmen)
    float height = smoothstep(0.05, 0.75, pressure);
    vec2 grad = vec2(dFdx(height), dFdy(height)) * uWidth;

    float tooth = crayonTooth(local, uToothScale * 0.7);
    float scribble = crayonDeposit(pressure, tooth) * uScribble;
    if (scribble < 0.04) discard;

    float sun = dot(normalize(vWorld), normalize(uSunDirection));
    float day = smoothstep(-0.15, 0.2, sun);
    float light = mix(0.34, 1.08, day);
    vec2 sunScreen = (viewMatrix * vec4(normalize(uSunDirection), 0.0)).xy;
    sunScreen /= max(length(sunScreen), 1e-3);
    float relief = clamp(-dot(grad, sunScreen) * 1.2, -1.0, 1.0) * clamp(uThickness / 5.0, 0.0, 2.0);
    vec3 color = uIceColor * light * mix(vec3(0.82, 0.8, 1.0), vec3(1.0), day) * (1.0 + relief * 0.4 * (0.3 + 0.7 * day));
    gl_FragColor = vec4(color, clamp(scribble, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// Kalotte bis gut 58° vom Pol: so weit reicht das Knäuel höchstens (Radius × 1.6 in der Projektion)
const CAP = THREE.MathUtils.degToRad(58);

function Cap({ pole, radius, settings }) {
  const mesh = useRef();
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const geometry = useMemo(
    () =>
      pole > 0
        ? new THREE.SphereGeometry(radius, 160, 40, 0, Math.PI * 2, 0, CAP)
        : new THREE.SphereGeometry(radius, 160, 40, 0, Math.PI * 2, Math.PI - CAP, CAP),
    [pole, radius]
  );
  const uniforms = useMemo(
    () => ({
      uLand: { value: null },
      uPole: { value: pole },
      uRadiusDeg: { value: 30 },
      uIrregular: { value: 1 },
      uScribble: { value: 1 },
      uDensity: { value: 1 },
      uWidth: { value: 3 },
      uThickness: { value: 6 },
      uToothScale: { value: 1.6 },
      uIceColor: { value: new THREE.Color() },
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
    }),
    [pole]
  );

  useFrame(() => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    const g = globe.material.uniforms;
    const u = mesh.current.material.uniforms;
    u.uLand.value = g.uLand.value;
    // Grösse je Jahreszeit (0 Sommer, 1 Winter), wie bisher im Papier-Pass
    u.uRadiusDeg.value = pole > 0 ? THREE.MathUtils.lerp(13, 30, g.uIceNorth.value) : THREE.MathUtils.lerp(24, 35, g.uIceSouth.value);
    u.uIrregular.value = g.uIceIrregular.value;
    u.uScribble.value = g.uScribble.value;
    u.uDensity.value = g.uScribbleDensity.value;
    u.uWidth.value = g.uScribbleWidth.value * gl.getPixelRatio();
    u.uThickness.value = g.uIceThickness.value * gl.getPixelRatio();
    u.uToothScale.value = settings.toothScale;
    u.uIceColor.value.copy(g.uIce.value);
    u.uSunDirection.value.copy(g.uSunDirection.value);
  });

  return (
    <mesh ref={mesh} geometry={geometry} renderOrder={1}>
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} transparent />
    </mesh>
  );
}

export default function IceCaps() {
  const c = useControls(
    "Eis schwebt",
    {
      height: { value: 0.035, min: 0, max: 0.12, label: "Abstand zur Erde" },
    },
    { collapsed: true }
  );
  const settings = { toothScale: 1.6 };
  return (
    <>
      {[1, -1].map((pole) => (
        <group key={pole}>
          <Cap pole={pole} radius={1 + c.height} settings={settings} />
        </group>
      ))}
    </>
  );
}
