import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";
import Paint from "./Paint.jsx";
import trailVertex from "./shaders/trail.vert?raw";
import trailFragmentSource from "./shaders/trail.frag?raw";
import glowFragment from "./shaders/glow.frag?raw";
import flameVertexSource from "./shaders/flame.vert?raw";
import flameFragmentSource from "./shaders/flame.frag?raw";
import noise from "./shaders/noise.glsl?raw";

const trailFragment = trailFragmentSource.replace("#include ./noise.glsl", noise);
const flameVertex = flameVertexSource.replace("#include ./noise.glsl", noise);
const flameFragment = flameFragmentSource.replace("#include ./noise.glsl", noise);

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

// Funken: Partikel mit Lebensdauer, kühlen von Gelb nach Rot ab und verlöschen
const SPARKS = 160;
function sparkGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(new Float32Array(SPARKS), 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(SPARKS), 1));
  return geometry;
}

const sparkVertex = /* glsl */ `
  uniform float uPixelRatio;
  attribute float aLife;  // 1 = frisch, 0 = verloschen
  attribute float aSize;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (0.5 + 0.5 * aLife) * (10.0 / -mv.z);
  }
`;
const sparkFragment = /* glsl */ `
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.2, 1.0, d)) * smoothstep(0.0, 0.35, vLife);
    vec3 hot = vec3(1.0, 0.92, 0.6);
    vec3 cool = vec3(0.85, 0.3, 0.25);
    gl_FragColor = vec4(mix(cool, hot, vLife), alpha);
    #include <colorspace_fragment>
  }
`;

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
const randomDir = new THREE.Vector3();

// Ein Meteorit fliegt ganz langsam auf die sichtbare Erdseite zu. Draussen kalt, beim Eintritt glüht
// er auf, schmilzt im Weiterfliegen ab, leuchtet am Ende hell auf und sprüht Funken; die Leuchtspur
// bleibt danach stehen und verblasst.
export default function Meteor() {
  const rock = useRef();
  const flame = useRef();
  const head = useRef();
  const headMaterial = useRef();
  const trail = useRef();
  const sparks = useRef();
  const state = useRef({
    phase: "wait",
    time: 8,
    afterglow: 0,
    sparkVelocity: Array.from({ length: SPARKS }, () => new THREE.Vector3()),
    sparkLife: new Float32Array(SPARKS),
    nextSpark: 0,
    spawnDebt: 0,
  });

  const rockGeo = useMemo(() => rockGeometry(), []);
  const trailGeo = useMemo(() => trailGeometry(), []);
  const sparkGeo = useMemo(() => sparkGeometry(), []);
  const trailUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uHot: { value: new THREE.Color("#fff1b8") },
      uWarm: { value: new THREE.Color("#f2994a") },
      uCool: { value: new THREE.Color("#b867c8") },
    }),
    []
  );
  const flameUniforms = useMemo(
    () => ({
      uDirection: { value: new THREE.Vector3(0, 0, 1) },
      uStretch: { value: 1.6 },
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uHot: { value: new THREE.Color("#ffe08a") },
      uWarm: { value: new THREE.Color("#ef7330") },
    }),
    []
  );
  const headUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ffd27a") }, uOpacity: { value: 0 } }), []);
  const sparkUniforms = useMemo(() => ({ uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } }), []);

  const c = useControls(
    "Meteorit",
    {
      size: { value: 0.035, min: 0.01, max: 0.1, label: "Grösse" },
      duration: { value: 75, min: 5, max: 180, label: "Flugdauer (s)" },
      pause: { value: 12, min: 0, max: 60, label: "Pause (s)" },
      glowStart: { value: 2.3, min: 1.4, max: 4, label: "Glüht ab Abstand" },
      burnStart: { value: 1.75, min: 1.1, max: 3, label: "Schmilzt ab Abstand" },
      burnEnd: { value: 1.28, min: 1.02, max: 2, label: "Verglüht bei Abstand" },
      flameSize: { value: 1.6, min: 1, max: 3, label: "Flammenhülle (× Stein)" },
      flameStretch: { value: 1.8, min: 0, max: 4, label: "Flammen nach hinten" },
      trailLength: { value: 0.6, min: 0.1, max: 1.5, label: "Schweif-Länge" },
      trailWidth: { value: 1.3, min: 0.3, max: 4, label: "Schweif-Breite (× Stein)" },
      sparks: { value: 1, min: 0, max: 3, label: "Funken" },
      afterglow: { value: 5, min: 0.5, max: 15, label: "Nachleuchten (s)" },
    },
    { collapsed: true }
  );

  // Neuer Anflug: Ziel auf der sichtbaren Erdseite, Start schräg weit draussen.
  // Das Ziel liegt auf der Oberfläche, wird aber nie erreicht: er verglüht vorher.
  const launch = (camera) => {
    const s = state.current;
    toCamera.copy(camera.position).normalize();
    // Ziel nahe der Bildmitte und Anflug etwas von vorne: die Zone, in der er verglüht, liegt im Bild
    target.copy(toCamera).add(randomDir.randomDirection().multiplyScalar(0.45)).normalize();
    tangent.copy(randomDir.randomDirection()).cross(target).normalize();
    start.copy(target).addScaledVector(tangent, 1.8).addScaledVector(toCamera, 0.9).setLength(5.0);
    s.start = start.clone();
    s.target = target.clone();
    s.speed = s.start.distanceTo(s.target) / c.duration;
    s.position = s.start.clone();
    s.phase = "fly";
    s.time = 0;
  };

  const spawnSpark = (s, from, velocity, size) => {
    const i = s.nextSpark;
    s.nextSpark = (s.nextSpark + 1) % SPARKS;
    sparkGeo.attributes.position.setXYZ(i, from.x, from.y, from.z);
    sparkGeo.attributes.aSize.setX(i, size);
    s.sparkLife[i] = 1;
    s.sparkVelocity[i].copy(velocity);
  };

  useFrame(({ camera, clock }, delta) => {
    const s = state.current;
    const dt = Math.min(delta, 0.05);
    s.time += dt;
    trail.current.material.uniforms.uTime.value = clock.elapsedTime;

    // Funken bewegen sich weiter, werden langsamer und kühlen ab (auch nach dem Verglühen)
    const sparkPos = sparkGeo.attributes.position;
    for (let i = 0; i < SPARKS; i++) {
      if (s.sparkLife[i] <= 0) continue;
      s.sparkLife[i] = Math.max(0, s.sparkLife[i] - dt / 2.2);
      s.sparkVelocity[i].multiplyScalar(1 - dt * 0.6);
      sparkPos.setXYZ(
        i,
        sparkPos.getX(i) + s.sparkVelocity[i].x * dt,
        sparkPos.getY(i) + s.sparkVelocity[i].y * dt,
        sparkPos.getZ(i) + s.sparkVelocity[i].z * dt
      );
      sparkGeo.attributes.aLife.setX(i, s.sparkLife[i]);
    }
    sparkPos.needsUpdate = true;
    sparkGeo.attributes.aLife.needsUpdate = true;

    if (s.phase === "wait") {
      rock.current.visible = false;
      flame.current.visible = false;
      trail.current.visible = false;
      headMaterial.current.uniforms.uOpacity.value = 0;
      if (s.time > c.pause) launch(camera);
      return;
    }

    if (s.phase === "afterglow") {
      // Der Stein ist weg; die Leuchtspur bleibt am Himmel stehen und verblasst langsam
      const f = s.time / c.afterglow;
      trail.current.material.uniforms.uOpacity.value = 0.9 * s.lastHeat * Math.pow(Math.max(0, 1 - f), 1.5);
      headMaterial.current.uniforms.uOpacity.value = Math.max(0, 1 - s.time / 0.6) * 0.6;
      if (f >= 1) {
        s.phase = "wait";
        s.time = 0;
        trail.current.visible = false;
      }
      return;
    }

    // Flug: gleichmässig weiter, er hält nie an
    s.position.addScaledVector(direction.copy(s.target).sub(s.start).normalize(), s.speed * dt);
    position.copy(s.position);
    const distance = position.length();

    // Draussen kalt; ab glowStart glüht er auf, ab burnStart schmilzt er im Weiterfliegen ab
    const heat = 1 - THREE.MathUtils.smoothstep(distance, c.burnStart, c.glowStart);
    const remaining = THREE.MathUtils.smoothstep(distance, c.burnEnd, c.burnStart); // 1 ganz, 0 weg
    // Kurz vor dem Ende leuchtet er noch einmal hell auf (Bolid)
    const flare = Math.sin(THREE.MathUtils.clamp(1 - remaining, 0, 1) * Math.PI) * (1 - remaining);
    s.lastHeat = heat;

    const rockSize = c.size * Math.pow(remaining, 0.7);
    rock.current.visible = rockSize > c.size * 0.02;
    rock.current.position.copy(position);
    rock.current.scale.setScalar(Math.max(rockSize, 1e-4));
    rock.current.rotation.x += dt * 0.25;
    rock.current.rotation.y += dt * 0.18;

    // Flammenhülle umschliesst den Stein und wird nach hinten gezogen
    flame.current.visible = heat > 0.01 && rock.current.visible;
    flame.current.position.copy(position);
    flame.current.scale.setScalar(Math.max(rockSize, 1e-4) * c.flameSize);
    const fu = flame.current.material.uniforms;
    fu.uDirection.value.copy(direction);
    fu.uStretch.value = c.flameStretch * heat;
    fu.uTime.value = clock.elapsedTime;
    fu.uHeat.value = heat;

    // Schein: wächst mit der Hitze, beim Aufleuchten deutlich heller, sonst an die Steingrösse gebunden
    head.current.position.copy(position);
    head.current.scale.setScalar(c.size * (Math.pow(remaining, 0.7) * (2.2 + 1.6 * heat) + flare * 5));
    headMaterial.current.uniforms.uOpacity.value = 0.45 * heat + flare * 0.6;

    // Schweif als Band hinter dem Kopf, immer zur Kamera gedreht
    trail.current.visible = heat > 0.01;
    trail.current.material.uniforms.uOpacity.value = 0.9 * heat;
    toCamera.copy(camera.position).sub(position).normalize();
    side.crossVectors(direction, toCamera).normalize();
    const positions = trail.current.geometry.attributes.position;
    const width = c.size * (0.35 + 0.65 * Math.pow(remaining, 0.5));
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = i / (TRAIL_POINTS - 1);
      // Beginnt etwas vor der Steinmitte (im Schein), damit vorne keine Kante sichtbar ist
      const back = -width * 0.8 + f * (c.trailLength * heat + width * 0.8);
      const halfWidth = width * c.trailWidth * (1 - f * 0.6) * (0.4 + 0.6 * heat);
      for (let k = 0; k < 2; k++) {
        corner.copy(position).addScaledVector(direction, -back).addScaledVector(side, k === 0 ? -halfWidth : halfWidth);
        positions.setXYZ(i * 2 + k, corner.x, corner.y, corner.z);
      }
    }
    positions.needsUpdate = true;

    // Funken lösen sich beim Abschmelzen und fliegen mit, etwas zur Seite gestreut
    const melting = remaining < 1 ? 1 - remaining : 0;
    s.spawnDebt += dt * c.sparks * (6 + 60 * melting) * heat;
    while (s.spawnDebt >= 1) {
      s.spawnDebt -= 1;
      const v = randomDir.randomDirection().multiplyScalar(s.speed * 0.6).addScaledVector(direction, s.speed * 0.9);
      spawnSpark(s, position, v, 3 + Math.random() * 4);
    }

    // Ganz verglüht: Nachleuchten der Spur, ein letzter Funkenregen
    if (remaining <= 0.001) {
      for (let i = 0; i < 24 * c.sparks; i++) {
        const v = randomDir.randomDirection().multiplyScalar(s.speed * 1.4).addScaledVector(direction, s.speed);
        spawnSpark(s, position, v, 3 + Math.random() * 5);
      }
      rock.current.visible = false;
      flame.current.visible = false;
      s.phase = "afterglow";
      s.time = 0;
    }
  });

  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  return (
    <group>
      <mesh ref={rock} geometry={rockGeo} visible={false}>
        <Paint color="#7a6670" noiseScale={4} />
      </mesh>
      <mesh ref={flame} visible={false} renderOrder={2}>
        <sphereGeometry args={[1, 48, 32]} />
        <shaderMaterial
          vertexShader={flameVertex}
          fragmentShader={flameFragment}
          uniforms={flameUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
      <Billboard ref={head}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            ref={headMaterial}
            vertexShader={glowVertex}
            fragmentShader={glowFragment}
            uniforms={headUniforms}
            {...additive}
          />
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
      <points ref={sparks} geometry={sparkGeo} frustumCulled={false}>
        <shaderMaterial
          vertexShader={sparkVertex}
          fragmentShader={sparkFragment}
          uniforms={sparkUniforms}
          {...additive}
        />
      </points>
    </group>
  );
}
