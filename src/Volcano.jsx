import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import Paint from "./Paint.jsx";
import { latLonToVector } from "./route.js";
import { SmokePool } from "./smoke.js";
import glowFragment from "./shaders/glow.frag?raw";

// Ätna auf Sizilien
const SITE = [37.75, 14.99];

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Berg statt Kegel: Höhe fällt weich zum Fuss ab, oben nur eine kleine Mulde
const HEIGHT = 0.55;
const mountainHeight = (r) => (HEIGHT * (1 / (1 + Math.pow(r / 0.36, 2.2)) - 0.06 * r));
const CRATER = mountainHeight(0.08);

function mountainGeometry() {
  const points = [];
  for (let i = 0; i <= 28; i++) {
    const r = 1 - (i / 28) * (1 - 0.08);
    points.push(new THREE.Vector2(r, Math.max(mountainHeight(r), 0)));
  }
  // Kleine Kratermulde
  points.push(new THREE.Vector2(0.04, CRATER - 0.025), new THREE.Vector2(0, CRATER - 0.03));
  const geometry = new THREE.LatheGeometry(points, 48);
  // Unregelmässig machen: Grate und Täler um den Berg, Flanken verschieden hoch.
  // Nur ganzzahlige Frequenzen im Winkel, damit die Naht der Lathe-Geometrie geschlossen bleibt
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let k = 0; k < position.count; k++) {
    v.fromBufferAttribute(position, k);
    const r = Math.hypot(v.x, v.z);
    const a = Math.atan2(v.z, v.x);
    const ridges = 0.1 * Math.sin(3 * a + 0.7) + 0.06 * Math.sin(5 * a + 2.1) + 0.04 * Math.sin(8 * a);
    const radial = 1 + ridges * Math.min(r * 2, 1);
    const lift = 1 + (0.25 * Math.sin(2 * a + 1.3) + ridges * 0.6) * r;
    position.setXYZ(k, v.x * radial, v.y * lift, v.z * radial);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Lavaströme: kurze Streifen vom Kraterrand den Hang hinunter (Winkel um die Achse, Länge)
const LAVA = [
  [0.4, 0.2],
  [3.0, 0.15],
].map(([angle, length]) => {
  const r0 = 0.1;
  const r1 = r0 + length;
  const slope = Math.atan2(mountainHeight(r0) - mountainHeight(r1), length);
  const r = (r0 + r1) / 2;
  return { angle, length, slope, x: r, y: mountainHeight(r) + 0.012 };
});

const Y = new THREE.Vector3(0, 1, 0);
const crater = new THREE.Vector3();
const velocity = new THREE.Vector3();
const random = new THREE.Vector3();
const worldUp = new THREE.Vector3();

// Vulkan: raucht ständig ein wenig; in Abständen bricht er aus, mit Aschewolke, Glut und hellem Krater.
// Hängt an der Erde und dreht mit.
export default function Volcano({ label = "Vulkan", size = 0.013 }) {
  const frame = useRef();
  const mountain = useRef();
  const glow = useRef();
  const glowMaterial = useRef();
  const scene = useThree((state) => state.scene);
  const style = useObjectStyle();
  const geometry = useMemo(() => mountainGeometry(), []);
  const site = useMemo(() => {
    const up = latLonToVector(...SITE);
    return { up, quaternion: new THREE.Quaternion().setFromUnitVectors(Y, up) };
  }, []);
  // Rauch (hell), Asche (dunkler, beim Ausbruch) und Glut (leuchtet selbst, fällt zurück)
  const smoke = useMemo(() => new SmokePool(240, { color: "#ece7f4", fresh: "#ece7f4", opacity: 0.6, growth: 2.2 }), []);
  const ash = useMemo(
    () => new SmokePool(500, { color: "#a49bb6", fresh: "#ffb070", freshAge: 0.1, opacity: 0.75, growth: 2.4 }),
    []
  );
  const embers = useMemo(
    () => new SmokePool(300, { color: "#ff7a3a", fresh: "#ffe08a", freshAge: 0.4, opacity: 1, growth: -0.2, glow: 1 }),
    []
  );
  const glowUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ff9a4a") }, uOpacity: { value: 0 } }), []);
  const state = useRef({ time: 0 });
  const landColor = useMemo(() => new THREE.Color("#9a8bb4"), []);

  const c = useControls(
    label,
    {
      size: { value: size, min: 0.005, max: 0.08, label: "Grösse Berg" },
      effects: { value: 0.04, min: 0.01, max: 0.15, label: "Grösse Rauch" },
      interval: { value: 45, min: 10, max: 180, label: "Ausbruch alle (s)" },
      eruption: { value: 9, min: 2, max: 30, label: "Ausbruch dauert (s)" },
      smoke: { value: 1, min: 0, max: 3, label: "Rauch" },
      embers: { value: 1, min: 0, max: 3, label: "Glut" },
    },
    { collapsed: true }
  );

  useFrame(({ clock }, delta) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    const s = state.current;
    const dt = Math.min(delta, 0.05);
    s.time += dt;
    globe.updateWorldMatrix(true, false);
    frame.current.matrix.copy(globe.matrixWorld);
    const sun = globe.material.uniforms.uSunDirection.value;

    // Berg in echter Grösse (Ätna auf Sizilien); Rauch und Glut eigenständig, sonst wären sie unsichtbar klein
    const mountainScale = c.size * style.scale;
    mountain.current.scale.setScalar(mountainScale);
    crater.copy(site.up).multiplyScalar(1 + CRATER * mountainScale);
    const scale = c.effects * style.scale;
    const k = scale / 0.042;
    // Farbe wie das Land der Erde, damit der Berg zu Sizilien gehört
    landColor.copy(globe.material.uniforms.uLandDay.value);

    // Ausbruch: schnell an, langsam ab
    const cycle = s.time % c.interval;
    const erupting = cycle < c.eruption;
    const strength = erupting
      ? THREE.MathUtils.smoothstep(cycle, 0, 1.2) * (1 - THREE.MathUtils.smoothstep(cycle, c.eruption * 0.5, c.eruption))
      : 0;

    // Ständiges leichtes Rauchen
    smoke.emit(2.5 * c.smoke, dt, () => {
      velocity.copy(site.up).multiplyScalar(scale * 0.5).add(random.randomDirection().multiplyScalar(scale * 0.12));
      smoke.spawn(crater, velocity, (1.2 + Math.random()) * k, 10 + Math.random() * 6);
    });
    // Aschewolke quillt beim Ausbruch hoch
    ash.emit(28 * c.smoke * strength, dt, () => {
      velocity
        .copy(site.up)
        .multiplyScalar(scale * (2.2 + Math.random() * 1.5))
        .add(random.randomDirection().multiplyScalar(scale * 0.6));
      ash.spawn(crater, velocity, (1.6 + Math.random() * 1.6) * k, 9 + Math.random() * 6);
    });
    // Glutbrocken fliegen hoch und fallen zurück
    embers.emit(40 * c.embers * strength, dt, () => {
      velocity
        .copy(site.up)
        .multiplyScalar(scale * (2.5 + Math.random() * 2.5))
        .add(random.randomDirection().multiplyScalar(scale * 1.4));
      embers.spawn(crater, velocity, (0.35 + Math.random() * 0.35) * k, 1.6 + Math.random() * 1.4);
    });

    // Rauch steigt weiter auf (Auftrieb), Glut wird von der Schwerkraft zurückgezogen
    const lift = (i, position, v, step) => v.addScaledVector(site.up, scale * 0.15 * step);
    smoke.update(dt, sun, { drag: 0.5, accelerate: lift });
    ash.update(dt, sun, { drag: 0.9, accelerate: lift });
    embers.update(dt, sun, {
      drag: 0.2,
      accelerate: (i, position, v, step) => v.addScaledVector(site.up, -scale * 4 * step),
    });

    // Krater glüht: beim Ausbruch hell, sonst nachts schwach
    worldUp.copy(site.up).transformDirection(globe.matrixWorld);
    const night = 1 - THREE.MathUtils.smoothstep(worldUp.dot(sun), -0.15, 0.2);
    const flicker = 0.85 + 0.15 * Math.sin(clock.elapsedTime * 7.3) * Math.sin(clock.elapsedTime * 3.1);
    glow.current.position.copy(crater);
    glow.current.scale.setScalar(scale * (0.6 + 1.6 * strength) * flicker);
    glowMaterial.current.uniforms.uOpacity.value = (0.25 * night + 0.9 * strength) * flicker;
  });

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      <group ref={mountain} position={site.up.clone()} quaternion={site.quaternion}>
        <mesh geometry={geometry}>
          <Paint color={landColor} noiseScale={5} />
        </mesh>
        {/* Lavaströme leuchten nachts */}
        {LAVA.map(({ angle, length, slope, x, y }) => (
          <group key={angle} rotation={[0, angle, 0]}>
            <mesh position={[x, y, 0]} rotation={[0, 0, -slope]}>
              <boxGeometry args={[length, 0.015, 0.03]} />
              <Paint color="#c9604f" glow="#ffb04a" glowStrength={1} />
            </mesh>
          </group>
        ))}
      </group>
      <primitive object={smoke.points} />
      <primitive object={ash.points} />
      <primitive object={embers.points} />
      <Billboard ref={glow}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            ref={glowMaterial}
            vertexShader={glowVertex}
            fragmentShader={glowFragment}
            uniforms={glowUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </Billboard>
    </group>
  );
}
