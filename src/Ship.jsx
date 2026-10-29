import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import Paint from "./Paint.jsx";
import ShipLight from "./ShipLight.jsx";
import { useObjectStyle } from "./objectStyle.js";
import { usePresence } from "./journey.js";
import { createRoute, findLandOnRoute } from "./route.js";
import wakeVertex from "./shaders/wake.vert?raw";
import wakeFragmentSource from "./shaders/wake.frag?raw";
import noise from "./shaders/noise.glsl?raw";

const wakeFragment = wakeFragmentSource.replace("#include ./noise.glsl", noise);

// Containerschiff: Bug zeigt nach +x, oben ist +y, Breite entlang z. Länge etwa 2.1 Einheiten.
const CONTAINER_COLORS = ["#d9614c", "#f2c46b", "#5fae7a", "#efe8d8", "#e9874a", "#4fb3c9", "#c8506e", "#7d8fe0"];

// Rumpf von oben: Heck gerade, Bug spitz. depth = Höhe, bottom = Unterkante (y)
function hullGeometry({ depth = 0.16, width = 0.2, bottom = 0 } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.0, -width);
  shape.lineTo(0.7, -width);
  shape.quadraticCurveTo(1.0, -width * 0.9, 1.12, 0);
  shape.quadraticCurveTo(1.0, width * 0.9, 0.7, width);
  shape.lineTo(-1.0, width);
  shape.lineTo(-1.0, -width);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  // Umriss liegt in x/y, Extrusion entlang z -> so drehen, dass die Extrusion nach oben zeigt
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
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

const WINDOW_GLOW = "#ffd98a";

// Positionslichter wie auf echten Schiffen (Bug zeigt nach +x, Backbord = -z):
// rot Backbord, grün Steuerbord, weiss Topplicht und Hecklicht. Nur nachts sichtbar.
function NavigationLights({ beam, sideX, sideY, mastX, mastY, sternY }) {
  return (
    <group>
      <ShipLight position={[sideX, sideY, -beam]} color="#ff5a4a" />
      <ShipLight position={[sideX, sideY, beam]} color="#5dff9a" />
      <ShipLight position={[mastX, mastY, 0]} color="#fff6dc" size={0.26} />
      <ShipLight position={[-1.02, sternY, 0]} color="#fff6dc" size={0.18} />
    </group>
  );
}

// Fensterband vorne und an beiden Seiten eines Aufbaus; leuchtet nachts warm
function BridgeWindows({ x, y, depth, width }) {
  return (
    <group>
      <mesh position={[x + depth / 2 + 0.002, y, 0]}>
        <boxGeometry args={[0.004, 0.05, width * 0.86]} />
        <Paint color="#3b3a78" glow={WINDOW_GLOW} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x, y, s * (width / 2 + 0.002)]}>
          <boxGeometry args={[depth * 0.8, 0.05, 0.004]} />
          <Paint color="#3b3a78" glow={WINDOW_GLOW} />
        </mesh>
      ))}
    </group>
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
      <BridgeWindows x={-0.82} y={0.43} depth={0.16} width={0.34} />
      <NavigationLights beam={0.2} sideX={-0.74} sideY={0.47} mastX={-0.82} mastY={0.56} sternY={0.2} />
    </group>
  );
}

// Kreuzfahrtschiff: weiss mit rotem Unterwasserschiff, gestaffelte Decks, Fensterbänder, zwei rote Schornsteine
function CruiseShipModel() {
  const lower = useMemo(() => hullGeometry({ depth: 0.06, width: 0.21 }), []);
  const upper = useMemo(() => hullGeometry({ depth: 0.12, width: 0.21, bottom: 0.06 }), []);
  const decks = [
    { x: -0.12, length: 1.55, width: 0.36, y: 0.18, height: 0.1 },
    { x: -0.2, length: 1.25, width: 0.32, y: 0.28, height: 0.09 },
    { x: -0.3, length: 0.85, width: 0.27, y: 0.37, height: 0.08 },
  ];
  return (
    <group>
      <mesh geometry={lower}>
        <Paint color="#c4483e" />
      </mesh>
      <mesh geometry={upper}>
        <Paint color="#f1edf8" />
      </mesh>
      {decks.map((d, i) => (
        <group key={i}>
          <mesh position={[d.x, d.y + d.height / 2, 0]}>
            <boxGeometry args={[d.length, d.height, d.width]} />
            <Paint color="#f4f1fa" boxEdges />
          </mesh>
          {/* Fensterbänder auf beiden Seiten */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[d.x, d.y + d.height * 0.55, s * (d.width / 2 + 0.002)]}>
              <boxGeometry args={[d.length * 0.92, d.height * 0.28, 0.004]} />
              <Paint color="#3b3a78" glow={WINDOW_GLOW} glowStrength={0.95} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Zwei rote Schornsteine mit dunkler Kappe */}
      {[-0.28, -0.52].map((x) => (
        <group key={x} position={[x, 0.52, 0]}>
          <mesh>
            <boxGeometry args={[0.1, 0.16, 0.12]} />
            <Paint color="#d9503f" boxEdges />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.105, 0.03, 0.125]} />
            <Paint color="#2a2650" />
          </mesh>
        </group>
      ))}
      {/* Fenster im Rumpf: eine Reihe Bullaugen-Band, nachts warm */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-0.05, 0.12, s * 0.212]}>
          <boxGeometry args={[1.5, 0.025, 0.004]} />
          <Paint color="#3b3a78" glow={WINDOW_GLOW} glowStrength={0.8} />
        </mesh>
      ))}
      <NavigationLights beam={0.19} sideX={0.25} sideY={0.4} mastX={0.15} mastY={0.5} sternY={0.24} />
    </group>
  );
}

// Frachter: dunkler Rumpf mit rotem Unterwasserschiff, grüne Ladeluken, Masten mit Ladebäumen, Aufbau am Heck
function FreighterModel() {
  const lower = useMemo(() => hullGeometry({ depth: 0.06, width: 0.19 }), []);
  const upper = useMemo(() => hullGeometry({ depth: 0.12, width: 0.19, bottom: 0.06 }), []);
  const hatches = [0.62, 0.36, 0.1, -0.16, -0.42];
  return (
    <group>
      <mesh geometry={lower}>
        <Paint color="#b8463c" />
      </mesh>
      <mesh geometry={upper}>
        <Paint color="#2f2b5e" />
      </mesh>
      {/* Deck */}
      <mesh position={[0.05, 0.185, 0]}>
        <boxGeometry args={[1.9, 0.01, 0.34]} />
        <Paint color="#8a6a52" boxEdges />
      </mesh>
      {hatches.map((x) => (
        <mesh key={x} position={[x, 0.21, 0]}>
          <boxGeometry args={[0.2, 0.04, 0.26]} />
          <Paint color="#4f8f6a" boxEdges />
        </mesh>
      ))}
      {/* Masten mit Ladebäumen */}
      {[0.49, -0.03].map((x) => (
        <group key={x} position={[x, 0.19, 0]}>
          <mesh position={[0, 0.17, 0]}>
            <boxGeometry args={[0.025, 0.34, 0.025]} />
            <Paint color="#e9874a" />
          </mesh>
          <mesh position={[0.1, 0.2, 0]} rotation={[0, 0, -0.9]}>
            <boxGeometry args={[0.012, 0.28, 0.012]} />
            <Paint color="#e9874a" />
          </mesh>
        </group>
      ))}
      {/* Aufbau am Heck */}
      <mesh position={[-0.78, 0.3, 0]}>
        <boxGeometry args={[0.26, 0.22, 0.3]} />
        <Paint color="#efeaf6" boxEdges />
      </mesh>
      <mesh position={[-0.82, 0.45, 0]}>
        <boxGeometry args={[0.07, 0.1, 0.08]} />
        <Paint color="#2a2650" boxEdges />
      </mesh>
      <BridgeWindows x={-0.78} y={0.36} depth={0.26} width={0.3} />
      <NavigationLights beam={0.17} sideX={-0.65} sideY={0.4} mastX={0.49} mastY={0.56} sternY={0.22} />
    </group>
  );
}

// Forschungsschiff (nach dem Vorbild von Polarforschungsschiffen): roter Rumpf, weisser mehrstöckiger
// Aufbau vorne mit Brücke und Mast mit Radarkuppeln, roter Schornstein mit weissem Band,
// Arbeitsdeck am Heck mit orangem A-Rahmen und Kran
function ResearchShipModel() {
  const hull = useMemo(() => hullGeometry({ depth: 0.18, width: 0.23 }), []);
  const blocks = [
    { x: 0.28, length: 0.62, width: 0.42, y: 0.18, height: 0.13 },
    { x: 0.32, length: 0.46, width: 0.38, y: 0.31, height: 0.11 },
    { x: 0.36, length: 0.28, width: 0.34, y: 0.42, height: 0.08 },
  ];
  return (
    <group>
      <mesh geometry={hull}>
        <Paint color="#c9413a" />
      </mesh>
      {/* Weisser Streifen am Rumpf */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.0, 0.15, s * 0.232]}>
          <boxGeometry args={[1.9, 0.02, 0.004]} />
          <Paint color="#f1edf8" />
        </mesh>
      ))}
      {/* Deck */}
      <mesh position={[0.05, 0.185, 0]}>
        <boxGeometry args={[1.9, 0.01, 0.4]} />
        <Paint color="#8a8fb8" boxEdges />
      </mesh>
      {/* Weisser Aufbau, gestaffelt */}
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + b.height / 2, 0]}>
          <boxGeometry args={[b.length, b.height, b.width]} />
          <Paint color="#f4f1fa" boxEdges />
        </mesh>
      ))}
      {/* Fensterbänder an den Seiten der unteren Decks */}
      {blocks.slice(0, 2).map((b, i) =>
        [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} position={[b.x, b.y + b.height * 0.55, s * (b.width / 2 + 0.002)]}>
            <boxGeometry args={[b.length * 0.85, b.height * 0.25, 0.004]} />
            <Paint color="#3b3a78" glow={WINDOW_GLOW} />
          </mesh>
        ))
      )}
      <BridgeWindows x={0.36} y={0.47} depth={0.28} width={0.34} />
      {/* Mast mit Radarkuppeln */}
      <mesh position={[0.3, 0.6, 0]}>
        <boxGeometry args={[0.03, 0.2, 0.03]} />
        <Paint color="#f4f1fa" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.3, 0.66, s * 0.07]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <Paint color="#f4f1fa" />
        </mesh>
      ))}
      {/* Schornstein: rot mit weissem Band */}
      <group position={[-0.05, 0.3, 0]}>
        <mesh>
          <boxGeometry args={[0.13, 0.22, 0.14]} />
          <Paint color="#c9413a" boxEdges />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.135, 0.04, 0.145]} />
          <Paint color="#f1edf8" />
        </mesh>
      </group>
      {/* Kran mittschiffs */}
      <group position={[-0.35, 0.19, 0.08]}>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.04, 0.2, 0.04]} />
          <Paint color="#e9874a" />
        </mesh>
        <mesh position={[-0.1, 0.22, 0]} rotation={[0, 0, 1.0]}>
          <boxGeometry args={[0.018, 0.3, 0.018]} />
          <Paint color="#e9874a" />
        </mesh>
      </group>
      {/* A-Rahmen am Heck */}
      <group position={[-0.95, 0.19, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0.12, s * 0.15]} rotation={[0, 0, -0.25]}>
            <boxGeometry args={[0.03, 0.26, 0.03]} />
            <Paint color="#e9874a" />
          </mesh>
        ))}
        <mesh position={[-0.03, 0.245, 0]}>
          <boxGeometry args={[0.03, 0.03, 0.33]} />
          <Paint color="#e9874a" />
        </mesh>
      </group>
      <NavigationLights beam={0.22} sideX={0.5} sideY={0.48} mastX={0.3} mastY={0.74} sternY={0.24} />
    </group>
  );
}

const MODELS = {
  container: ContainerShipModel,
  cruise: CruiseShipModel,
  freighter: FreighterModel,
  research: ResearchShipModel,
};

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
// model: "container" | "cruise" | "freighter" | "research"
export default function Ship({ label = "Containerschiff", model = "container", waypoints, speed = 0.004, size = 0.06, start = 0 }) {
  const Model = MODELS[model];
  const frame = useRef();
  const ship = useRef();
  const wake = useRef();
  const scene = useThree((state) => state.scene);
  const route = useMemo(() => createRoute(waypoints), [waypoints]);
  const progress = useRef({ t: start, direction: 1 });
  const checked = useRef(false);
  const style = useObjectStyle();
  // Sichtbarkeit und Grösse je Stadium der Reise
  const presence = usePresence();

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
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#f2f0ff") },
      uOpacity: { value: 0.8 },
      uLand: { value: null },
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
    }),
    []
  );

  useFrame((state, delta) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    // Rahmen folgt der Erde: alles darin ist in Erd-Koordinaten (Einheitskugel)
    // In der Entwicklung einmal prüfen, ob die Route über Land führt
    if (import.meta.env.DEV && !checked.current && globe.material.uniforms.uLand.value) {
      checked.current = true;
      const hits = findLandOnRoute(route, globe.material.uniforms.uLand.value);
      if (hits.length) console.warn(`Route von "${label}" führt über Land, z. B. bei`, hits.slice(0, 5));
    }

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
    // Grösse des Schiffs mal gemeinsamer Faktor aller Objekte
    const weight = presence();
    frame.current.visible = weight > 0.005;
    const size = c.size * style.scale * Math.max(weight, 1e-3);
    ship.current.scale.setScalar(size);

    // Kielwasser: Schaumbänder hinter dem Heck, auf der Meeresoberfläche
    const length = size * 2.4 * c.wake;
    const positions = wake.current.geometry.attributes.position;
    WAKE_ARMS.forEach((arm, a) => {
      for (let i = 0; i < WAKE_POINTS; i++) {
        const f = i / (WAKE_POINTS - 1);
        const distance = size * 0.95 + f * length * arm.length;
        // Mittellinie des Bandes, läuft schräg nach aussen
        point
          .copy(up)
          .addScaledVector(forward, -distance)
          .addScaledVector(side, arm.spread * f * length * arm.length);
        const halfWidth = size * THREE.MathUtils.lerp(arm.width[0], arm.width[1], f);
        for (let k = 0; k < 2; k++) {
          corner.copy(point).addScaledVector(side, k === 0 ? -halfWidth : halfWidth).normalize().multiplyScalar(1.0008);
          positions.setXYZ((a * WAKE_POINTS + i) * 2 + k, corner.x, corner.y, corner.z);
        }
      }
    });
    positions.needsUpdate = true;
    wake.current.material.uniforms.uTime.value = state.clock.elapsedTime;
    wake.current.material.uniforms.uLand.value = globe.material.uniforms.uLand.value;
    wake.current.material.uniforms.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
  });

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      <group ref={ship}>
        <Model />
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
