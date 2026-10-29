import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import { usePresence, useArrival } from "./journey.js";
import Paint from "./Paint.jsx";
import { latLonToVector } from "./route.js";
import glowFragment from "./shaders/glow.frag?raw";
import noise from "./shaders/noise.glsl?raw";
import { SmokePool } from "./smoke.js";

// Cape Canaveral
const SITE = [28.5, -80.6];

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Triebwerksflamme: Kegel nach unten, flackernd, oben weissgelb, an der Spitze orange und durchsichtig
const flameVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uPower;
  varying vec2 vUv;
  varying vec3 vPosition;
  ${noise}
  void main() {
    float along = vUv.y; // 1 an der Düse, 0 an der Spitze
    float flicker = snoise(vPosition * 9.0 + vec3(0.0, uTime * 9.0, 0.0)) * 0.25;
    vec3 color = mix(vec3(0.94, 0.42, 0.2), vec3(1.0, 0.95, 0.72), smoothstep(0.35, 0.9, along + flicker));
    float alpha = smoothstep(0.0, 0.55, along + flicker) * uPower;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

// Untere Stufe: weisser Rumpf, rotes Band, drei Flossen, Düse
function Booster() {
  return (
    <>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.09, 0.095, 0.56, 20]} />
        <Paint color="#efeaf7" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.092, 0.092, 0.06, 20]} />
        <Paint color="#d9614c" />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.12, 0.1, Math.sin(a) * 0.12]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.1, 0.18, 0.02]} />
            <Paint color="#d9614c" boxEdges />
          </mesh>
        );
      })}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.05, 0.075, 0.06, 16]} />
        <Paint color="#5a5590" />
      </mesh>
    </>
  );
}

// Obere Stufe mit roter Spitze und Bullauge
function UpperStage() {
  return (
    <>
      <mesh position={[0, 0.73, 0]}>
        <cylinderGeometry args={[0.075, 0.085, 0.3, 20]} />
        <Paint color="#efeaf7" />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <coneGeometry args={[0.075, 0.2, 20]} />
        <Paint color="#d9614c" />
      </mesh>
      <mesh position={[0, 0.78, 0.074]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.01, 12]} />
        <Paint color="#5b7fe2" />
      </mesh>
    </>
  );
}

const Y = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const next = new THREE.Vector3();
const dir = new THREE.Vector3();
const nozzle = new THREE.Vector3();
const drift = new THREE.Vector3();

// Rakete startet in Cape Canaveral: steht auf der Rampe, zündet in einer Rauchwolke, steigt erst senkrecht
// und neigt sich dann nach Osten (Gravity Turn), wirft die untere Stufe ab und schwenkt in die Umlaufbahn.
// Alles hängt an der Erde und dreht mit.
export default function Rocket({ label = "Rakete", size = 0.06 }) {
  const frame = useRef();
  const booster = useRef();
  const upper = useRef();
  const flame = useRef();
  const flameMaterial = useRef();
  const glow = useRef();
  const glowMaterial = useRef();
  const scene = useThree((state) => state.scene);
  const style = useObjectStyle();
  // Sichtbarkeit und Grösse je Stadium der Reise
  const presence = usePresence();
  // Beim Ankommen im Frühling (Stadium 1) sofort zünden
  const arrived = useArrival(1);

  // Rauchwolken in Erd-Koordinaten (Kind des Rahmens, dreht mit)
  const smoke = useMemo(() => new SmokePool(900), []);
  const flameGeo = useMemo(() => {
    // Kegel mit Spitze nach unten, Düse bei y = 0
    const geometry = new THREE.ConeGeometry(0.07, 0.45, 16, 1, true);
    geometry.rotateX(Math.PI);
    geometry.translate(0, -0.225, 0);
    return geometry;
  }, []);
  const site = useMemo(() => {
    const up = latLonToVector(...SITE);
    const east = new THREE.Vector3().crossVectors(Y, up).normalize();
    const pad = new THREE.Quaternion().setFromUnitVectors(Y, up);
    return { up, east, pad };
  }, []);
  const flameUniforms = useMemo(() => ({ uTime: { value: 0 }, uPower: { value: 0 } }), []);
  const glowUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ffc66e") }, uOpacity: { value: 0 } }), []);
  const state = useRef({
    phase: "pad",
    time: 0,
    separated: false,
    boosterTime: 0,
    boosterVelocity: new THREE.Vector3(),
    lastPos: new THREE.Vector3(),
    boosterSpin: new THREE.Vector3(),
    smokeDebt: 0,
  });

  const c = useControls(
    label,
    {
      size: { value: size, min: 0.02, max: 0.2, label: "Grösse" },
      pause: { value: 25, min: 3, max: 120, label: "Auf der Rampe (s)" },
      duration: { value: 60, min: 10, max: 180, label: "Aufstieg (s)" },
      altitude: { value: 0.42, min: 0.1, max: 1, label: "Bahnhöhe" },
      downrange: { value: 0.55, min: 0.1, max: 1.5, label: "Strecke nach Osten" },
      smoke: { value: 1, min: 0, max: 3, label: "Rauch" },
    },
    { collapsed: true }
  );

  // Bahn: u = 0 Rampe … 1 Umlaufbahn. Höhe steigt sofort, Strecke nach Osten erst später -> erst senkrecht
  const trajectory = (u, target) => {
    const theta = c.downrange * Math.pow(u, 1.8);
    const height = c.altitude * (1 - Math.pow(1 - Math.min(u, 1), 1.5));
    return target
      .copy(site.up)
      .multiplyScalar(Math.cos(theta))
      .addScaledVector(site.east, Math.sin(theta))
      .multiplyScalar(1.002 + height);
  };

  // Rauch wächst mit der Raketengrösse mit (Werte gelten für die Standardgrösse)
  const spawnSmoke = (s, from, velocity, size, life) => {
    smoke.spawn(from, velocity, (size * (c.size * style.scale)) / 0.042, life);
  };

  const place = (group, position, direction, scale) => {
    group.position.copy(position);
    group.quaternion.setFromUnitVectors(Y, direction);
    group.scale.setScalar(scale);
  };

  useFrame(({ clock }, delta) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    const s = state.current;
    const dt = Math.min(delta, 0.05);
    s.time += dt;
    const weight = presence();
    frame.current.visible = weight > 0.005;
    const scale = c.size * style.scale * Math.max(weight, 1e-3);

    // Rahmen folgt der Erde (erst deren aktuelle Rotation übernehmen, sonst hinkt die Rakete nach)
    globe.updateWorldMatrix(true, false);
    frame.current.matrix.copy(globe.matrixWorld);
    // Rauch: treibt langsam auseinander, wird grösser und verblasst
    smoke.update(dt, globe.material.uniforms.uSunDirection.value);

    let power = 0;
    let flameAt = 0;

    if (arrived() && s.phase === "pad") s.time = Math.max(s.time, c.pause - 3.5);
    if (s.phase === "pad") {
      // Auf der Rampe; die letzten Sekunden zündet das Triebwerk in einer wachsenden Rauchwolke
      trajectory(0, pos);
      place(booster.current, pos, site.up, scale);
      place(upper.current, pos, site.up, scale);
      booster.current.visible = upper.current.visible = true;
      const ignition = THREE.MathUtils.smoothstep(s.time, c.pause - 3, c.pause);
      power = ignition * 0.8;
      if (ignition > 0) {
        s.smokeDebt += dt * 25 * c.smoke * ignition;
        while (s.smokeDebt >= 1) {
          s.smokeDebt -= 1;
          // Wolke quillt am Boden seitlich heraus
          drift.randomDirection().addScaledVector(site.up, -drift.dot(site.up) * 0.8).multiplyScalar(scale * 1.6);
          spawnSmoke(s, pos, drift, 3 + Math.random() * 3, 8 + Math.random() * 5);
        }
      }
      if (s.time >= c.pause) {
        s.phase = "ascent";
        s.time = 0;
        s.separated = false;
      }
    }

    if (s.phase === "ascent" || s.phase === "orbit") {
      const ascent = s.phase === "ascent";
      // Langsam anfahren, dann schneller
      const u = ascent ? Math.pow(Math.min(s.time / c.duration, 1), 1.6) : 1 + s.time / c.duration;
      trajectory(u, pos);
      trajectory(u + 0.002, next);
      dir.copy(next).sub(pos).normalize();
      place(upper.current, pos, dir, scale);

      // Stufentrennung auf halbem Weg: die untere Stufe fällt zurück, taumelt und wird kleiner
      if (!s.separated && u > 0.5) {
        s.separated = true;
        s.boosterTime = 0;
        // Fliegt mit halbem Tempo weiter und bleibt dann zurück
        s.boosterVelocity.copy(pos).sub(s.lastPos).multiplyScalar(0.5 / dt);
        s.boosterSpin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2);
        for (let i = 0; i < 14 * c.smoke; i++) {
          drift.randomDirection().multiplyScalar(scale * 0.8);
          spawnSmoke(s, pos, drift, 2 + Math.random() * 2, 5 + Math.random() * 3);
        }
      }
      if (!s.separated) place(booster.current, pos, dir, scale);
      s.lastPos.copy(pos);

      if (ascent) {
        power = s.separated ? 0.7 : 1;
        flameAt = s.separated ? 0.58 : 0;
        // Rauchspur aus der Düse, dünner mit der Höhe
        nozzle.set(0, flameAt - 0.05, 0).applyQuaternion(upper.current.quaternion).multiplyScalar(scale).add(pos);
        const thin = 1 - 0.7 * u;
        s.smokeDebt += dt * c.smoke * (18 + 30 * (1 - u)) * (s.separated ? 0.6 : 1);
        while (s.smokeDebt >= 1) {
          s.smokeDebt -= 1;
          drift.randomDirection().multiplyScalar(scale * 0.15).addScaledVector(dir, -scale * 0.3);
          spawnSmoke(s, nozzle, drift, (1.2 + Math.random() * 1.2) * thin + 0.6, 12 + Math.random() * 6);
        }
        if (s.time >= c.duration) {
          s.phase = "orbit";
          s.time = 0;
        }
      } else {
        // In der Umlaufbahn: Triebwerk aus, gleitet weiter und wird klein, bis sie verschwindet
        const fade = Math.max(0, 1 - s.time / 8);
        upper.current.scale.setScalar(scale * fade);
        upper.current.visible = fade > 0.01;
        if (fade <= 0) {
          s.phase = "pad";
          s.time = 0;
        }
      }
    }

    // Abgeworfene untere Stufe
    if (s.separated) {
      s.boosterTime += dt;
      const b = booster.current;
      // Schwerkraft zieht sie zurück zur Erde
      s.boosterVelocity.addScaledVector(b.position, -dt * 0.002 / b.position.lengthSq());
      b.position.addScaledVector(s.boosterVelocity, dt);
      b.rotation.x += s.boosterSpin.x * dt;
      b.rotation.y += s.boosterSpin.y * dt;
      b.rotation.z += s.boosterSpin.z * dt;
      const fade = Math.max(0, 1 - s.boosterTime / 10);
      b.scale.setScalar(scale * fade);
      b.visible = fade > 0.01 && b.position.length() > 1.002;
    }

    // Flamme und Schein an der Düse der aktiven Stufe
    flame.current.visible = power > 0.01;
    flame.current.position.set(0, flameAt, 0);
    flame.current.scale.set(1, 0.75 + 0.25 * Math.sin(clock.elapsedTime * 31) * Math.sin(clock.elapsedTime * 17), 1).multiplyScalar(0.6 + 0.4 * power);
    flameMaterial.current.uniforms.uPower.value = power;
    nozzle.set(0, flameAt - 0.08, 0).applyQuaternion(upper.current.quaternion).multiplyScalar(scale).add(upper.current.position);
    glow.current.position.copy(nozzle);
    glow.current.scale.setScalar(scale * (0.6 + 0.3 * Math.sin(clock.elapsedTime * 23)) * power * 1.4);
    glowMaterial.current.uniforms.uOpacity.value = power * 0.8;
  });

  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      {/* Startturm neben der Rampe */}
      <group quaternion={site.pad} position={site.up.clone().multiplyScalar(1.001)} scale={c.size * style.scale}>
        <mesh position={[0.2, 0.42, 0]}>
          <boxGeometry args={[0.08, 0.84, 0.08]} />
          <Paint color="#8b86b8" boxEdges />
        </mesh>
        <mesh position={[0.13, 0.62, 0]}>
          <boxGeometry args={[0.1, 0.025, 0.04]} />
          <Paint color="#8b86b8" />
        </mesh>
      </group>
      <group ref={booster}>
        <Booster />
      </group>
      <group ref={upper}>
        <UpperStage />
        <mesh ref={flame} geometry={flameGeo} renderOrder={2}>
          <shaderMaterial
            ref={flameMaterial}
            vertexShader={flameVertex}
            fragmentShader={flameFragment}
            uniforms={flameUniforms}
            {...additive}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <Billboard ref={glow}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            ref={glowMaterial}
            vertexShader={glowVertex}
            fragmentShader={glowFragment}
            uniforms={glowUniforms}
            {...additive}
          />
        </mesh>
      </Billboard>
      <primitive object={smoke.points} />
    </group>
  );
}
