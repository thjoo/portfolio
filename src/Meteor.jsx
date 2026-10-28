import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";
import Paint from "./Paint.jsx";
import trailVertex from "./shaders/trail.vert?raw";
import trailFragmentSource from "./shaders/trail.frag?raw";
import glowFragment from "./shaders/glow.frag?raw";
import noise from "./shaders/noise.glsl?raw";

const trailFragment = trailFragmentSource.replace("#include ./noise.glsl", noise);

// Verbeulter Gesteinsbrocken: Ikosaeder, Ecken zufällig nach innen und aussen verschoben
function rockGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const bump = 1 + 0.18 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3 - v.x) + 0.08 * Math.sin(v.y * 7.0);
    v.multiplyScalar(bump);
    position.setXYZ(i, v.x, v.y * 0.85, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const TRAIL_POINTS = 28;
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

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const start = new THREE.Vector3();
const target = new THREE.Vector3();
const position = new THREE.Vector3();
const direction = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const side = new THREE.Vector3();
const corner = new THREE.Vector3();
const tangent = new THREE.Vector3();

// Ein Meteorit fliegt in Abständen auf die sichtbare Erdseite zu und verglüht kurz vor der Oberfläche
export default function Meteor() {
  const rock = useRef();
  const head = useRef();
  const flash = useRef();
  const headMaterial = useRef();
  const flashMaterial = useRef();
  const trail = useRef();
  const state = useRef({ phase: "wait", time: 8, heat: 0, burnPoint: new THREE.Vector3() });

  const rockGeo = useMemo(() => rockGeometry(), []);
  const trailGeo = useMemo(() => trailGeometry(), []);
  const trailUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },
      uHot: { value: new THREE.Color("#fff1b8") },
      uWarm: { value: new THREE.Color("#f2994a") },
      uCool: { value: new THREE.Color("#b867c8") },
    }),
    []
  );
  const headUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ffc56b") }, uOpacity: { value: 0 } }), []);
  const flashUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#fff3d1") }, uOpacity: { value: 0 } }), []);

  const c = useControls(
    "Meteorit",
    {
      size: { value: 0.035, min: 0.01, max: 0.1, label: "Grösse" },
      duration: { value: 40, min: 5, max: 120, label: "Flugdauer (s)" },
      pause: { value: 12, min: 0, max: 60, label: "Pause (s)" },
      glowStart: { value: 2.3, min: 1.4, max: 4, label: "Glüht ab Abstand" },
      burnOut: { value: 1.38, min: 1.05, max: 2, label: "Verglüht bei Abstand" },
      trailLength: { value: 0.6, min: 0.1, max: 1.5, label: "Schweif-Länge" },
      trailWidth: { value: 0.05, min: 0.01, max: 0.15, label: "Schweif-Breite" },
    },
    { collapsed: true }
  );

  // Neuer Anflug: Ziel auf der sichtbaren Erdseite, Start schräg weit draussen
  const launch = (camera) => {
    const s = state.current;
    toCamera.copy(camera.position).normalize();
    target
      .copy(toCamera)
      .add(new THREE.Vector3().randomDirection().multiplyScalar(0.7))
      .normalize();
    tangent.copy(new THREE.Vector3().randomDirection()).cross(target).normalize();
    start.copy(target).multiplyScalar(1.0).addScaledVector(tangent, 2.2).addScaledVector(toCamera, 0.2).setLength(5.0);
    s.start = start.clone();
    s.target = target.clone();
    s.phase = "fly";
    s.time = 0;
  };

  useFrame(({ camera, clock }, delta) => {
    const s = state.current;
    s.time += delta;
    trail.current.material.uniforms.uTime.value = clock.elapsedTime;

    if (s.phase === "wait") {
      rock.current.visible = false;
      trail.current.visible = false;
      headMaterial.current.uniforms.uOpacity.value = 0;
      if (s.time > c.pause) launch(camera);
      return;
    }

    if (s.phase === "burn") {
      // Aufblitzen und verglühen
      // Langsames, weiches Aufblitzen
      const f = s.time / 3.5;
      flash.current.position.copy(s.burnPoint);
      flash.current.scale.setScalar(c.size * (3 + f * 5));
      flashMaterial.current.uniforms.uOpacity.value = Math.sin(Math.min(f, 1) * Math.PI) * 0.7;
      trail.current.material.uniforms.uOpacity.value = Math.max(0, 0.9 - f * 1.2) * s.heat;
      if (f >= 1) {
        s.phase = "wait";
        s.time = 0;
        flashMaterial.current.uniforms.uOpacity.value = 0;
      }
      return;
    }

    // Flug: langsam beschleunigend auf das Ziel zu
    const t = Math.min(s.time / c.duration, 1);
    // Fast gleichmässig, nur leicht schneller werdend
    const eased = t * (0.8 + 0.2 * t);
    position.lerpVectors(s.start, s.target, eased);
    direction.copy(s.target).sub(s.start).normalize();

    // Draussen kalt; erst beim Eintritt glüht er auf und wird beim Verglühen kleiner
    const distance = position.length();
    const heat = 1 - THREE.MathUtils.smoothstep(distance, c.burnOut + 0.1, c.glowStart);
    const ablation = THREE.MathUtils.smoothstep(distance, c.burnOut, c.burnOut + 0.35);
    s.heat = heat;

    rock.current.visible = true;
    rock.current.position.copy(position);
    rock.current.scale.setScalar(c.size * (0.35 + 0.65 * ablation));
    rock.current.rotation.x += delta * 0.25;
    rock.current.rotation.y += delta * 0.18;
    head.current.position.copy(position);
    head.current.scale.setScalar(c.size * (2 + 3 * heat));
    headMaterial.current.uniforms.uOpacity.value = 0.8 * heat;

    // Schweif als Band hinter dem Kopf, immer zur Kamera gedreht
    trail.current.visible = heat > 0.01;
    trail.current.material.uniforms.uOpacity.value = 0.9 * heat;
    toCamera.copy(camera.position).sub(position).normalize();
    side.crossVectors(direction, toCamera).normalize();
    const positions = trail.current.geometry.attributes.position;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = i / (TRAIL_POINTS - 1);
      const back = f * c.trailLength * heat;
      const halfWidth = c.trailWidth * (1 - f * 0.6) * (0.4 + 0.6 * heat);
      for (let k = 0; k < 2; k++) {
        corner.copy(position).addScaledVector(direction, -back).addScaledVector(side, k === 0 ? -halfWidth : halfWidth);
        positions.setXYZ(i * 2 + k, corner.x, corner.y, corner.z);
      }
    }
    positions.needsUpdate = true;

    // Kurz vor der Oberfläche verglüht er
    if (distance < c.burnOut || t >= 1) {
      s.phase = "burn";
      s.time = 0;
      s.burnPoint.copy(position);
      rock.current.visible = false;
      headMaterial.current.uniforms.uOpacity.value = 0;
    }
  });

  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  return (
    <group>
      <mesh ref={rock} geometry={rockGeo} visible={false}>
        <Paint color="#7a6670" noiseScale={4} />
      </mesh>
      <Billboard ref={head}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial ref={headMaterial} vertexShader={glowVertex} fragmentShader={glowFragment} uniforms={headUniforms} {...additive} />
        </mesh>
      </Billboard>
      <Billboard ref={flash}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial ref={flashMaterial} vertexShader={glowVertex} fragmentShader={glowFragment} uniforms={flashUniforms} {...additive} />
        </mesh>
      </Billboard>
      <mesh ref={trail} geometry={trailGeo} frustumCulled={false} visible={false}>
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
