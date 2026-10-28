import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import { latLonToVector } from "./route.js";
import noise from "./shaders/noise.glsl?raw";

// Geomagnetische Pole: um sie liegt das Polarlicht-Oval (etwa 20° Abstand)
const POLES = [
  [80.7, -72.7],
  [-80.7, 107.3],
];

// Vorhang als Band rund um das Oval: uv.x läuft einmal herum, uv.y vom unteren Rand nach oben.
// Die Form entsteht im Vertex-Shader (wellt sich mit der Zeit), die Geometrie liefert nur die UVs.
const SEGMENTS = 220;
function curtainGeometry() {
  const geometry = new THREE.BufferGeometry();
  const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
  const indices = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const f = i / SEGMENTS;
    uvs.set([f, 0, f, 1], i * 4);
    if (i < SEGMENTS) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const vertexShader = /* glsl */ `
  uniform vec3 uPole;
  uniform vec3 uAxisA;
  uniform vec3 uAxisB;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uTime;
  uniform vec3 uSunDirection;
  varying vec2 vUv;
  varying float vNight;
  varying float vTop;
  ${noise}
  void main() {
    vUv = uv;
    float phi = uv.x * 6.28318530718;
    // Oval wellt sich langsam: mehrere Falten, die wandern
    vec3 ring = vec3(cos(phi), sin(phi), 0.0);
    float fold = snoise(vec3(ring.xy * 1.6, uTime * 0.05)) * 0.05 + sin(phi * 7.0 + uTime * 0.12) * 0.012;
    float r = radians(uRadius) + fold;
    vec3 dir = normalize(uPole * cos(r) + (uAxisA * cos(phi) + uAxisB * sin(phi)) * sin(r));
    // Oberkante unruhig: Vorhang mal höher, mal niedriger
    float top = 0.55 + 0.45 * (0.5 + 0.5 * snoise(vec3(ring.xy * 3.0, uTime * 0.08 + 3.0)));
    vTop = top;
    float height = 1.006 + uHeight * top * uv.y;
    vec4 world = modelMatrix * vec4(dir * height, 1.0);
    // Nur auf der Nachtseite (Sonne unter dem Horizont des Ovals)
    vNight = 1.0 - smoothstep(-0.25, -0.02, dot(normalize(world.xyz), normalize(uSunDirection)));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  varying vec2 vUv;
  varying float vNight;
  varying float vTop;
  ${noise}
  void main() {
    float y = vUv.y;
    // Senkrechte Strahlen, die langsam wandern und flackern
    float rays = snoise(vec3(vUv.x * 160.0, uTime * 0.25, 0.0)) * 0.5 + 0.5;
    rays = mix(0.35, 1.0, pow(rays, 1.5));
    // Helle und dunkle Abschnitte entlang des Ovals
    float bands = smoothstep(-0.3, 0.6, snoise(vec3(vUv.x * 9.0, uTime * 0.04, 1.7)));
    // Unten scharfer, heller Saum, nach oben weich auslaufend
    float bottom = smoothstep(0.0, 0.06, y);
    float fade = 1.0 - smoothstep(0.15, 1.0, y);
    vec3 color = mix(uLow, uHigh, smoothstep(0.2, 0.9, y));
    float alpha = bottom * fade * rays * bands * vNight * uIntensity;
    // Nur leuchtende Stellen schreiben Tiefe: dort malt der Papier-Pass kein Eis darüber
    if (alpha < 0.04) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function Curtain({ pole, settings }) {
  const mesh = useRef();
  const scene = useThree((state) => state.scene);
  const geometry = useMemo(() => curtainGeometry(), []);
  const uniforms = useMemo(() => {
    const p = latLonToVector(...pole);
    const a = new THREE.Vector3(0, 1, 0).cross(p).normalize();
    const b = new THREE.Vector3().crossVectors(p, a);
    return {
      uPole: { value: p },
      uAxisA: { value: a },
      uAxisB: { value: b },
      uRadius: { value: 20 },
      uHeight: { value: 0.06 },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uLow: { value: new THREE.Color() },
      uHigh: { value: new THREE.Color() },
    };
  }, [pole]);

  useFrame(({ clock }) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    const u = mesh.current.material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
    u.uRadius.value = settings.radius;
    u.uHeight.value = settings.height;
    u.uIntensity.value = settings.intensity;
    u.uLow.value.set(settings.low);
    u.uHigh.value.set(settings.high);
  });

  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={3}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Polarlichter über Nord- und Südpol; drehen mit der Erde, leuchten nur auf der Nachtseite
export default function Aurora() {
  const frame = useRef();
  const scene = useThree((state) => state.scene);
  const settings = useControls(
    "Polarlichter",
    {
      intensity: { value: 1.3, min: 0, max: 2, label: "Stärke" },
      radius: { value: 20, min: 10, max: 30, label: "Abstand vom Pol (°)" },
      height: { value: 0.1, min: 0.01, max: 0.2, label: "Höhe" },
      low: { value: "#6dffb0", label: "Farbe unten" },
      high: { value: "#b06cff", label: "Farbe oben" },
    },
    { collapsed: true }
  );

  useFrame(() => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    globe.updateWorldMatrix(true, false);
    frame.current.matrix.copy(globe.matrixWorld);
  });

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      {POLES.map((pole) => (
        <Curtain key={pole[0]} pole={pole} settings={settings} />
      ))}
    </group>
  );
}
