import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import { usePresence } from "./journey.js";
import Paint from "./Paint.jsx";
import ShipLight from "./ShipLight.jsx";
import { createRoute } from "./route.js";
import noise from "./shaders/noise.glsl?raw";
import sunlight from "./shaders/sunlight.glsl?raw";

const WINDOW_GLOW = "#ffd98a";

// Kondensstreifen: Band hinter dem Flugzeug. Vorne zwei dünne Streifen (je Triebwerk),
// nach hinten wachsen sie zusammen, werden breiter, fransen aus und verblassen
const TRAIL_POINTS = 40;
function trailGeometry() {
  const geometry = new THREE.BufferGeometry();
  const uvs = new Float32Array(TRAIL_POINTS * 2 * 2);
  const indices = [];
  for (let i = 0; i < TRAIL_POINTS; i++) {
    const f = i / (TRAIL_POINTS - 1);
    uvs.set([f, 0, f, 1], i * 4);
    if (i < TRAIL_POINTS - 1) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 2 * 3), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
const trailVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const trailFragment = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform float uOpacity;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noise}
  ${sunlight}
  void main() {
    float along = vUv.x;            // 0 am Flugzeug, 1 am Ende
    float across = vUv.y * 2.0 - 1.0;
    // Zwei Streifen, die nach hinten zusammenlaufen und breiter werden
    float spread = mix(0.42, 0.0, smoothstep(0.05, 0.5, along));
    float width = mix(0.16, 0.75, smoothstep(0.0, 1.0, along));
    float fray = snoise(vec3(along * 18.0, across * 3.0, uSeed)) * 0.18 * along;
    float a = 1.0 - smoothstep(width * 0.5, width, abs(across - spread) + fray);
    float b = 1.0 - smoothstep(width * 0.5, width, abs(across + spread) + fray);
    float body = max(a, b);
    float alpha = body * smoothstep(0.0, 0.04, along) * pow(1.0 - along, 1.3) * uOpacity;
    if (alpha < 0.01) discard;
    vec3 color = applySunlight(vec3(0.96, 0.95, 1.0), earthShadow(vWorld, uSunDirection), 0.4);
    gl_FragColor = vec4(color, alpha * 0.8);
    #include <colorspace_fragment>
  }
`;

// Verkehrsflugzeug: lokal x = vorne, y = oben, z = rechts
function PlaneModel({ livery }) {
  return (
    <>
      {/* Rumpf */}
      <mesh rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.05, 0.9, 14]} />
        <Paint color="#f3f0fa" />
      </mesh>
      <mesh position={[0.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.06, 0.12, 14]} />
        <Paint color="#f3f0fa" />
      </mesh>
      {/* Fensterband */}
      <mesh position={[0.08, 0.02, 0]}>
        <boxGeometry args={[0.6, 0.02, 0.122]} />
        <Paint color="#3b3a78" glow={WINDOW_GLOW} glowStrength={0.8} />
      </mesh>
      {/* Tragflächen, leicht nach hinten gepfeilt */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[0.0, -0.02, side * 0.27]} rotation={[0, -side * 0.45, 0]}>
            <boxGeometry args={[0.18, 0.02, 0.46]} />
            <Paint color="#e4e0ef" boxEdges />
          </mesh>
          <mesh position={[0.08, -0.06, side * 0.2]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, 0.12, 10]} />
            <Paint color="#8b86b8" />
          </mesh>
          <mesh position={[-0.42, 0.02, side * 0.1]} rotation={[0, -side * 0.4, 0]}>
            <boxGeometry args={[0.09, 0.015, 0.18]} />
            <Paint color="#e4e0ef" />
          </mesh>
        </group>
      ))}
      {/* Seitenleitwerk in den Farben der Fluglinie */}
      <mesh position={[-0.4, 0.12, 0]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.16, 0.2, 0.02]} />
        <Paint color={livery} boxEdges />
      </mesh>
      {/* Positionslichter an den Flügelspitzen, Blitzlicht am Heck */}
      <ShipLight position={[-0.1, -0.02, -0.5]} color="#ff5a4a" />
      <ShipLight position={[-0.1, -0.02, 0.5]} color="#5dff9a" />
      <ShipLight position={[-0.48, 0.05, 0]} color="#fff6dc" size={0.18} />
    </>
  );
}

const up = new THREE.Vector3();
const ahead = new THREE.Vector3();
const forward = new THREE.Vector3();
const side = new THREE.Vector3();
const basis = new THREE.Matrix4();
const point = new THREE.Vector3();
const pointAhead = new THREE.Vector3();
const trailSide = new THREE.Vector3();
const corner = new THREE.Vector3();

// Flugzeug auf einem Grosskreis von A nach B: steigt nach dem Start auf, zieht einen Kondensstreifen,
// sinkt vor der Landung und beginnt nach einer Pause von vorn. Hängt an der Erde und dreht mit.
export default function Airplane({ label, from, to, livery = "#d9614c", duration = 120, start = 0, size = 0.05 }) {
  const frame = useRef();
  const plane = useRef();
  const trail = useRef();
  const scene = useThree((state) => state.scene);
  const style = useObjectStyle();
  // Sichtbarkeit und Grösse je Stadium der Reise
  const presence = usePresence();
  const route = useMemo(() => createRoute([from, to]), [from, to]);
  const progress = useRef(start);
  const trailGeo = useMemo(() => trailGeometry(), []);
  const trailUniforms = useMemo(
    () => ({
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uOpacity: { value: 1 },
      uSeed: { value: Math.random() * 10 },
    }),
    []
  );

  const c = useControls(
    label,
    {
      size: { value: size, min: 0.02, max: 0.15, label: "Grösse" },
      duration: { value: duration, min: 20, max: 400, label: "Flugdauer (s)" },
      altitude: { value: 0.035, min: 0.005, max: 0.2, label: "Flughöhe" },
      trail: { value: 0.22, min: 0, max: 0.8, label: "Kondensstreifen (Länge)" },
      trailWidth: { value: 1, min: 0.2, max: 3, label: "Kondensstreifen (Breite)" },
    },
    { collapsed: true }
  );

  // Höhe über dem Boden entlang der Route: Steigflug, Reiseflug, Sinkflug
  const heightAt = (t) => {
    const climb = THREE.MathUtils.smoothstep(t, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(t, 0.88, 1));
    return 1.002 + c.altitude * climb;
  };

  useFrame((state, delta) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    globe.updateWorldMatrix(true, false);
    frame.current.matrix.copy(globe.matrixWorld);

    // Nach der Landung eine kurze Pause (t > 1), dann neuer Start
    const pause = 0.08;
    progress.current += Math.min(delta, 0.05) / c.duration;
    if (progress.current > 1 + pause) progress.current = 0;
    const t = Math.min(progress.current, 1);
    const flying = progress.current <= 1;

    route.sample(t, up);
    route.sample(t + 0.002, ahead);
    const height = heightAt(t);
    forward.copy(ahead).multiplyScalar(heightAt(t + 0.002)).sub(point.copy(up).multiplyScalar(height)).normalize();
    side.crossVectors(forward, up).normalize();
    // Vorne und oben wieder senkrecht machen; leichtes Anstellen beim Steigen bleibt erhalten
    const fixedUp = point.crossVectors(side, forward).normalize();
    basis.makeBasis(forward, fixedUp, side);
    plane.current.position.copy(up).multiplyScalar(height);
    plane.current.quaternion.setFromRotationMatrix(basis);
    // Am Boden klein ein- und ausblenden, damit es nicht plötzlich auftaucht
    const appear = THREE.MathUtils.smoothstep(t, 0, 0.03) * (1 - THREE.MathUtils.smoothstep(t, 0.97, 1));
    const weight = presence();
    frame.current.visible = weight > 0.005;
    const scale = c.size * style.scale * Math.max(weight, 1e-3);
    plane.current.scale.setScalar(scale * appear);
    plane.current.visible = flying && appear > 0.01;

    // Kondensstreifen entlang der zurückgelegten Route, nur in Reiseflughöhe
    const back = c.trail / Math.max(route.length, 0.01);
    const positions = trail.current.geometry.attributes.position;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = i / (TRAIL_POINTS - 1);
      const ti = Math.max(t - f * back, 0);
      route.sample(ti, point);
      route.sample(ti + 0.002, pointAhead);
      trailSide.crossVectors(pointAhead.sub(point), point).normalize();
      // Hinter dem Heck beginnen, nach hinten breiter
      const halfWidth = scale * c.trailWidth * (0.35 + 1.4 * f);
      point.multiplyScalar(heightAt(ti) - 0.0005);
      if (i === 0) point.addScaledVector(forward, -scale * 0.45);
      for (let k = 0; k < 2; k++) {
        corner.copy(point).addScaledVector(trailSide, k === 0 ? -halfWidth : halfWidth);
        positions.setXYZ(i * 2 + k, corner.x, corner.y, corner.z);
      }
    }
    positions.needsUpdate = true;
    const u = trail.current.material.uniforms;
    u.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
    // Streifen erst in der Höhe; nach der Landung verblasst der Rest
    const cruise = THREE.MathUtils.smoothstep(t, 0.06, 0.14);
    u.uOpacity.value = flying ? cruise : Math.max(0, 1 - (progress.current - 1) / pause);
  });

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      <group ref={plane}>
        <PlaneModel livery={livery} />
      </group>
      <mesh ref={trail} geometry={trailGeo} frustumCulled={false}>
        <shaderMaterial
          vertexShader={trailVertex}
          fragmentShader={trailFragment}
          uniforms={trailUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
