import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import Paint from "./Paint.jsx";
import { createRoute } from "./route.js";
import wakeVertex from "./shaders/wake.vert?raw";
import wakeFragmentSource from "./shaders/wake.frag?raw";
import noise from "./shaders/noise.glsl?raw";

const wakeFragment = wakeFragmentSource.replace("#include ./noise.glsl", noise);

// Containerschiff: Bug zeigt nach +x, oben ist +y, Breite entlang z. Länge etwa 2.1 Einheiten.
const CONTAINER_COLORS = ["#d9614c", "#f2c46b", "#5fae7a", "#efe8d8", "#e9874a", "#4fb3c9", "#c8506e", "#7d8fe0"];

function hullGeometry() {
  // Umriss von oben: Heck gerade, Bug spitz
  const shape = new THREE.Shape();
  shape.moveTo(-1.0, -0.2);
  shape.lineTo(0.7, -0.2);
  shape.quadraticCurveTo(1.0, -0.18, 1.12, 0);
  shape.quadraticCurveTo(1.0, 0.18, 0.7, 0.2);
  shape.lineTo(-1.0, 0.2);
  shape.lineTo(-1.0, -0.2);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  // Umriss liegt in x/y, Extrusion entlang z -> so drehen, dass die Extrusion nach oben zeigt
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function random(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function Containers({ seed = 7 }) {
  const mesh = useRef();
  const boxes = useMemo(() => {
    const rand = random(seed);
    const list = [];
    for (let bay = 0; bay < 13; bay++) {
      const x = -0.58 + bay * 0.1;
      // Zum Bug hin weniger Lagen
      const maxLayers = bay > 10 ? 2 : bay > 8 ? 3 : 4;
      for (let row = 0; row < 5; row++) {
        const z = -0.14 + row * 0.07;
        const layers = 1 + Math.floor(rand() * maxLayers);
        for (let layer = 0; layer < layers; layer++) {
          if (rand() < 0.06) continue; // ein paar Lücken
          list.push({
            position: [x + (rand() - 0.5) * 0.006, 0.16 + 0.03 + layer * 0.062, z],
            color: CONTAINER_COLORS[Math.floor(rand() * CONTAINER_COLORS.length)],
          });
        }
      }
    }
    return list;
  }, [seed]);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    boxes.forEach((box, i) => {
      matrix.makeTranslation(...box.position);
      mesh.current.setMatrixAt(i, matrix);
      mesh.current.setColorAt(i, color.set(box.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [boxes]);

  return (
    <instancedMesh ref={mesh} args={[null, null, boxes.length]}>
      <boxGeometry args={[0.092, 0.058, 0.062]} />
      <Paint color="#ffffff" noiseScale={8} boxEdges />
    </instancedMesh>
  );
}

function ContainerShipModel() {
  const hull = useMemo(() => hullGeometry(), []);
  return (
    <group>
      <mesh geometry={hull}>
        <Paint color="#2d2a5e" />
      </mesh>
      {/* Deck */}
      <mesh position={[0.05, 0.165, 0]}>
        <boxGeometry args={[1.9, 0.01, 0.36]} />
        <Paint color="#4f6fd6" boxEdges />
      </mesh>
      <Containers />
      {/* Brücke am Heck */}
      <mesh position={[-0.82, 0.33, 0]}>
        <boxGeometry args={[0.16, 0.34, 0.34]} />
        <Paint color="#efeaf6" boxEdges />
      </mesh>
      <mesh position={[-0.82, 0.47, 0]}>
        <boxGeometry args={[0.18, 0.04, 0.4]} />
        <Paint color="#efeaf6" boxEdges />
      </mesh>
      {/* Schornstein */}
      <mesh position={[-0.93, 0.44, 0]}>
        <boxGeometry args={[0.06, 0.14, 0.08]} />
        <Paint color="#d9614c" boxEdges />
      </mesh>
    </group>
  );
}

const WAKE_POINTS = 24;
// Drei Schaumbänder: links, rechts (V-förmig auseinander) und eine kurze Spur in der Mitte
const WAKE_ARMS = [
  { spread: -0.38, width: [0.05, 0.16], length: 1 },
  { spread: 0.38, width: [0.05, 0.16], length: 1 },
  { spread: 0, width: [0.1, 0.22], length: 0.55 },
];

function wakeGeometry() {
  const vertexCount = WAKE_ARMS.length * WAKE_POINTS * 2;
  const geometry = new THREE.BufferGeometry();
  const uvs = new Float32Array(vertexCount * 2);
  const arms = new Float32Array(vertexCount);
  const indices = [];
  WAKE_ARMS.forEach((_, a) => {
    for (let i = 0; i < WAKE_POINTS; i++) {
      const v = (a * WAKE_POINTS + i) * 2;
      const f = i / (WAKE_POINTS - 1);
      uvs.set([f, 0, f, 1], v * 2);
      arms[v] = a;
      arms[v + 1] = a;
      if (i < WAKE_POINTS - 1) indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  });
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("arm", new THREE.BufferAttribute(arms, 1));
  geometry.setIndex(indices);
  return geometry;
}
const up = new THREE.Vector3();
const ahead = new THREE.Vector3();
const forward = new THREE.Vector3();
const side = new THREE.Vector3();
const basis = new THREE.Matrix4();
const point = new THREE.Vector3();
const corner = new THREE.Vector3();

// Ein Schiff auf einer Route: hängt an der Erde (dreht mit), fährt hin und her
export default function Ship({ label = "Containerschiff", waypoints, speed = 0.004, size = 0.06, start = 0 }) {
  const frame = useRef();
  const ship = useRef();
  const wake = useRef();
  const scene = useThree((state) => state.scene);
  const route = useMemo(() => createRoute(waypoints), [waypoints]);
  const progress = useRef({ t: start, direction: 1 });

  const c = useControls(
    label,
    {
      size: { value: size, min: 0.02, max: 0.15, label: "Grösse" },
      speed: { value: speed, min: 0, max: 0.05, label: "Tempo" },
      wake: { value: 1, min: 0, max: 2, label: "Kielwasser" },
    },
    { collapsed: true }
  );

  const wakeGeo = useMemo(() => wakeGeometry(), []);
  const wakeUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color("#f2f0ff") }, uOpacity: { value: 0.8 } }),
    []
  );

  useFrame((state, delta) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    // Rahmen folgt der Erde: alles darin ist in Erd-Koordinaten (Einheitskugel)
    // Erst die aktuelle Rotation der Erde übernehmen, sonst hinkt das Schiff ein Bild hinterher
    globe.updateWorldMatrix(true, false);
    frame.current.matrix.copy(globe.matrixWorld);

    // Hin und her über die Route; Tempo in "Anteil der Route pro Sekunde", unabhängig von der Länge
    const p = progress.current;
    p.t += (delta * c.speed * p.direction) / Math.max(route.length, 0.01);
    if (p.t > 1) {
      p.t = 1;
      p.direction = -1;
    } else if (p.t < 0) {
      p.t = 0;
      p.direction = 1;
    }

    route.sample(p.t, up);
    route.sample(p.t + 0.002 * p.direction, ahead);
    forward.copy(ahead).sub(up);
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    side.crossVectors(forward, up).normalize();
    basis.makeBasis(forward, up, side);

    ship.current.position.copy(up).multiplyScalar(1.0015);
    ship.current.quaternion.setFromRotationMatrix(basis);
    ship.current.scale.setScalar(c.size);

    // Kielwasser: Schaumbänder hinter dem Heck, auf der Meeresoberfläche
    const length = c.size * 2.4 * c.wake;
    const positions = wake.current.geometry.attributes.position;
    WAKE_ARMS.forEach((arm, a) => {
      for (let i = 0; i < WAKE_POINTS; i++) {
        const f = i / (WAKE_POINTS - 1);
        const distance = c.size * 0.95 + f * length * arm.length;
        // Mittellinie des Bandes, läuft schräg nach aussen
        point
          .copy(up)
          .addScaledVector(forward, -distance)
          .addScaledVector(side, arm.spread * f * length * arm.length);
        const halfWidth = c.size * THREE.MathUtils.lerp(arm.width[0], arm.width[1], f);
        for (let k = 0; k < 2; k++) {
          corner.copy(point).addScaledVector(side, k === 0 ? -halfWidth : halfWidth).normalize().multiplyScalar(1.0008);
          positions.setXYZ((a * WAKE_POINTS + i) * 2 + k, corner.x, corner.y, corner.z);
        }
      }
    });
    positions.needsUpdate = true;
    wake.current.material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      <group ref={ship}>
        <ContainerShipModel />
      </group>
      <mesh ref={wake} geometry={wakeGeo} frustumCulled={false}>
        <shaderMaterial
          vertexShader={wakeVertex}
          fragmentShader={wakeFragment}
          uniforms={wakeUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
