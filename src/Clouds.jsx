import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import Paint from "./Paint.jsx";
import { latLonToVector } from "./route.js";

// Haufenwolken aus wenigen abgeflachten Kugeln, die mit dem Wind nach Osten ziehen und einen weichen
// Schatten auf die Erde werfen. Alle Kugeln in einer InstancedMesh, alle Schatten in einer zweiten:
// zwei Zeichenaufrufe für alle Wolken zusammen.

// [Breite, Länge, Grösse]
const CLOUDS = [
  [52, -35, 1.1],
  [44, -15, 0.8],
  [12, -40, 0.9],
  [-8, -20, 1.0],
  [-38, -10, 1.2],
  [-45, -60, 0.9],
  [30, 60, 1.0],
  [5, 80, 0.8],
  [-20, 65, 1.1],
  [58, 100, 0.9],
  [20, 150, 1.2],
  [-10, -150, 1.0],
  [40, -150, 0.9],
  [-50, 150, 1.1],
  [62, -20, 0.8],
  [-30, 30, 0.9],
];

// Zufall mit festem Startwert, damit die Wolken bei jedem Laden gleich aussehen
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Jede Wolke: 6–9 Kugeln, in der Mitte grösser und höher, aussen kleiner
function buildPuffs() {
  const random = mulberry32(7);
  return CLOUDS.map(([lat, lon, size]) => {
    const count = 6 + Math.floor(random() * 4);
    const puffs = [];
    for (let i = 0; i < count; i++) {
      // Kugeln um die Mitte gehäuft (etwas länger als breit), in der Mitte grösser und höher
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * (i === 0 ? 0 : 1);
      const middle = 1 - distance * 0.8;
      puffs.push({
        east: Math.cos(angle) * distance * 1.1,
        north: Math.sin(angle) * distance * 0.65,
        up: middle * 0.3,
        radius: (0.4 + 0.45 * middle) * (0.85 + random() * 0.3),
      });
    }
    return { lat, lon, size, puffs, drift: 0.6 + random() * 0.8, phase: random() * 10 };
  });
}

const shadowVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const shadowFragment = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.15, 1.0, d);
    // Schatten nur auf der Tagseite
    float day = smoothstep(-0.05, 0.3, dot(normalize(vWorld), normalize(uSunDirection)));
    float alpha = soft * day * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(0.14, 0.11, 0.36, alpha);
    #include <colorspace_fragment>
  }
`;

const up = new THREE.Vector3();
const east = new THREE.Vector3();
const north = new THREE.Vector3();
const sunLocal = new THREE.Vector3();
const offset = new THREE.Vector3();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const basis = new THREE.Matrix4();
const inverse = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

export default function Clouds() {
  const frame = useRef();
  const puffMesh = useRef();
  const shadowMesh = useRef();
  const scene = useThree((state) => state.scene);
  const style = useObjectStyle();
  const clouds = useMemo(() => buildPuffs(), []);
  const puffCount = useMemo(() => clouds.reduce((sum, cloud) => sum + cloud.puffs.length, 0), [clouds]);
  const shadowUniforms = useMemo(
    () => ({ uSunDirection: { value: new THREE.Vector3(0, 0, 1) }, uOpacity: { value: 0.75 } }),
    []
  );

  const c = useControls(
    "Wolken",
    {
      visible: { value: true, label: "an" },
      size: { value: 0.05, min: 0.005, max: 0.1, label: "Grösse" },
      altitude: { value: 0.025, min: 0.005, max: 0.15, label: "Höhe" },
      speed: { value: 0.6, min: 0, max: 5, label: "Wind (°/s)" },
      color: { value: "#f6f3fc", label: "Farbe" },
      shadow: { value: 0.75, min: 0, max: 1, label: "Schatten" },
    },
    { collapsed: true }
  );

  useFrame(({ clock }) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    globe.updateWorldMatrix(true, false);
    frame.current.matrix.copy(globe.matrixWorld);
    const t = clock.elapsedTime;
    const size = c.size * style.scale;

    // Sonne in Erd-Koordinaten: Schatten fällt von der Sonne weg auf den Boden
    inverse.copy(globe.matrixWorld).invert();
    sunLocal.copy(globe.material.uniforms.uSunDirection.value).transformDirection(inverse);

    let i = 0;
    clouds.forEach((cloud, k) => {
      // Mit dem Wind nach Osten, dazu leichtes Pendeln in der Breite
      const lon = cloud.lon + t * c.speed * cloud.drift;
      const lat = cloud.lat + Math.sin(t * 0.05 + cloud.phase) * 2;
      latLonToVector(lat, ((lon + 180) % 360) - 180, up);
      east.crossVectors(Y, up).normalize();
      north.crossVectors(up, east);
      const s = size * cloud.size;

      // Kugeln der Wolke im Tangentenraum: x = Osten, y = oben, z = Norden
      basis.makeBasis(east, up, north);
      quaternion.setFromRotationMatrix(basis);
      for (const puff of cloud.puffs) {
        // Langsames Quellen: jede Kugel atmet ein wenig
        const breathe = 1 + 0.06 * Math.sin(t * 0.4 + k * 1.7 + puff.east * 3);
        offset
          .copy(east)
          .multiplyScalar(puff.east * s)
          .addScaledVector(north, puff.north * s)
          .addScaledVector(up, puff.up * s);
        position.copy(up).multiplyScalar(1 + c.altitude).add(offset);
        const r = puff.radius * s * breathe;
        scaleVector.set(r, r * 0.62, r);
        matrix.compose(position, quaternion, scaleVector);
        puffMesh.current.setMatrixAt(i, matrix);
        i++;
      }

      // Schatten: eine weiche Scheibe auf dem Boden, von der Sonne weg verschoben (etwas übertrieben, damit
      // er neben der Wolke sichtbar wird und nicht von ihr verdeckt)
      const away = sunLocal.dot(up);
      offset.copy(sunLocal).addScaledVector(up, -away).multiplyScalar(-(c.altitude + size * 1.2) * 1.6);
      position.copy(up).multiplyScalar(1.0008).add(offset);
      scaleVector.set(s * 3.6, s * 2.6, 1);
      // Scheibe liegt in der Tangentialebene: Ebene (x, y) der Geometrie -> (Osten, Norden)
      basis.makeBasis(east, north, up);
      quaternion.setFromRotationMatrix(basis);
      matrix.compose(position, quaternion, scaleVector);
      shadowMesh.current.setMatrixAt(k, matrix);
    });
    puffMesh.current.instanceMatrix.needsUpdate = true;
    shadowMesh.current.instanceMatrix.needsUpdate = true;
    puffMesh.current.visible = shadowMesh.current.visible = c.visible;

    const u = shadowMesh.current.material.uniforms;
    u.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
    u.uOpacity.value = c.shadow;
  });

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      <instancedMesh ref={puffMesh} args={[null, null, puffCount]} frustumCulled={false}>
        <sphereGeometry args={[1, 18, 12]} />
        <Paint color={c.color} noiseScale={60} />
      </instancedMesh>
      <instancedMesh ref={shadowMesh} args={[null, null, clouds.length]} frustumCulled={false} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={shadowVertex}
          fragmentShader={shadowFragment}
          uniforms={shadowUniforms}
          transparent
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
