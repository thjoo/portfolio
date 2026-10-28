import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useControls, folder } from "leva";
import * as THREE from "three";
import vertexShader from "./shaders/balloon.vert?raw";
import fragmentSource from "./shaders/balloon.frag?raw";
import noise from "./shaders/noise.glsl?raw";

const fragmentShader = fragmentSource.replace("#include ./noise.glsl", noise);

// Tropfenprofil für LatheGeometry: oben breit und rund, unten spitz zur Öffnung
function balloonProfile(segments = 48) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 0.93; // 0 = oben, bis kurz vor unten
    const top = (1 + Math.cos(theta)) / 2; // 1 oben, 0 unten
    const radius = Math.sin(theta) * (0.42 + 0.58 * Math.pow(top, 0.55));
    const y = Math.cos(theta) * 1.15;
    points.push(new THREE.Vector2(Math.max(radius, 0.0), y));
  }
  // Kleine Öffnung (Hals) unten
  const last = points[points.length - 1];
  points.push(new THREE.Vector2(Math.max(last.x, 0.14), last.y - 0.05));
  return points;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const toEarth = new THREE.Vector3();
const swing = new THREE.Quaternion();
const euler = new THREE.Euler();

export default function Balloon() {
  const orbit = useRef();
  const body = useRef();
  const envelope = useRef();
  const scene = useThree((state) => state.scene);

  const geometry = useMemo(() => new THREE.LatheGeometry(balloonProfile(), 64), []);
  const uniforms = useMemo(
    () => ({
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uStripeA: { value: new THREE.Color() },
      uStripeB: { value: new THREE.Color() },
      uStripes: { value: 8 },
      uShade: { value: 0.4 },
      uPigment: { value: 0.2 },
      uEdge: { value: 0.4 },
    }),
    []
  );

  const c = useControls("Objekte", {
    Ballon: folder({
      stripeA: { value: "#5b7fe2", label: "Streifen 1" },
      stripeB: { value: "#e8dfb4", label: "Streifen 2" },
      stripes: { value: 8, min: 2, max: 16, step: 1, label: "Streifen" },
      shade: { value: 0.4, min: 0, max: 0.8, label: "Schattierung" },
      pigment: { value: 0.2, min: 0, max: 0.6, label: "Pigment-Wolken" },
      edge: { value: 0.4, min: 0, max: 1, label: "Pigmentrand" },
      size: { value: 0.08, min: 0.02, max: 0.2, label: "Grösse" },
      tilt: { value: 0, min: -45, max: 45, step: 1, label: "Neigung zusätzlich (°)" },
      angle: { value: -62, min: -180, max: 180, step: 1, label: "Position (°)" },
      height: { value: -0.45, min: -1.2, max: 1.2, label: "Höhe" },
      distance: { value: 1.35, min: 1.05, max: 2, label: "Abstand" },
      orbitSpeed: { value: 0.01, min: 0, max: 0.2, label: "Umkreisen" },
    }),
  });

  useFrame((state, delta) => {
    const u = envelope.current.material.uniforms;
    const globe = scene.getObjectByName("globe");
    if (globe) u.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
    u.uStripeA.value.set(c.stripeA);
    u.uStripeB.value.set(c.stripeB);
    u.uStripes.value = c.stripes;
    u.uShade.value = c.shade;
    u.uPigment.value = c.pigment;
    u.uEdge.value = c.edge;

    // Langsam um die Erde, dazu leichtes Wippen und Pendeln
    orbit.current.rotation.y += delta * c.orbitSpeed;
    const t = state.clock.elapsedTime;
    const a = THREE.MathUtils.degToRad(c.angle);
    const horizontal = Math.sqrt(Math.max(c.distance * c.distance - c.height * c.height, 0.01));
    body.current.position.set(
      Math.sin(a) * horizontal,
      c.height + Math.sin(t * 0.8) * 0.012,
      Math.cos(a) * horizontal
    );
    // Korb zeigt zur Erde: die -Y-Achse des Ballons auf den Erdmittelpunkt ausrichten,
    // dazu etwas zusätzliche Neigung und leichtes Pendeln
    toEarth.copy(body.current.position).negate().normalize();
    body.current.quaternion.setFromUnitVectors(DOWN, toEarth);
    swing.setFromEuler(
      euler.set(Math.sin(t * 0.45) * 0.04, 0, THREE.MathUtils.degToRad(c.tilt) + Math.sin(t * 0.6) * 0.05)
    );
    body.current.quaternion.multiply(swing);
    body.current.scale.setScalar(c.size);
  });

  // Seile vom Hals zum Korb
  const ropes = useMemo(() => {
    const neckY = -1.15 * Math.cos(Math.PI * 0.07) - 0.05;
    return [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      return [
        [Math.cos(a) * 0.14, neckY, Math.sin(a) * 0.14],
        [Math.cos(a) * 0.1, neckY - 0.26, Math.sin(a) * 0.1],
      ];
    });
  }, []);

  return (
    <group ref={orbit}>
      <group ref={body}>
        <mesh ref={envelope} geometry={geometry}>
          <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
        </mesh>
        {ropes.map((points, i) => (
          <Line key={i} points={points} color="#2e2860" lineWidth={1.6} />
        ))}
        <mesh position={[0, -1.53, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.22]} />
          <meshBasicMaterial color="#c9a25c" />
        </mesh>
      </group>
    </group>
  );
}
