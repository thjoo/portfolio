import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import Paint from "./Paint.jsx";
import ShipLight from "./ShipLight.jsx";
import { orbitAxes, orbitPose } from "./orbit.js";

// Ein Solarflügel aus zwei Feldern mit Spalt, an einem Ausleger auf der z-Achse
function Wing({ side }) {
  return (
    <group>
      <mesh position={[0, 0, side * 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
        <Paint color="#c9c4dd" />
      </mesh>
      {[0.62, 1.16].map((z) => (
        <mesh key={z} position={[0, 0, side * z]}>
          <boxGeometry args={[0.55, 0.025, 0.5]} />
          <Paint color="#3d5fc4" boxEdges />
        </mesh>
      ))}
    </group>
  );
}

const up = new THREE.Vector3();
const forward = new THREE.Vector3();
const axisA = new THREE.Vector3();
const axisB = new THREE.Vector3();
const sunLocal = new THREE.Vector3();
const inverse = new THREE.Quaternion();

// Satellit auf einer schrägen Umlaufbahn;
// Antenne zeigt zur Erde, die Solarflügel drehen sich zur Sonne
export default function Satellite({ label = "Satellit", size = 0.05 }) {
  const body = useRef();
  const wings = useRef();
  const angle = useRef(2.2);
  const scene = useThree((state) => state.scene);
  const style = useObjectStyle();

  const c = useControls(
    label,
    {
      size: { value: size, min: 0.02, max: 0.2, label: "Grösse" },
      distance: { value: 1.45, min: 1.1, max: 2.5, label: "Abstand" },
      inclination: { value: 62, min: 0, max: 90, step: 1, label: "Bahnneigung (°)" },
      node: { value: 40, min: -180, max: 180, step: 1, label: "Bahn drehen (°)" },
      speed: { value: 0.015, min: 0, max: 0.2, label: "Tempo" },
    },
    { collapsed: true }
  );

  useFrame((state, delta) => {
    angle.current += delta * c.speed;
    orbitAxes(c.inclination, c.node, axisA, axisB);
    orbitPose(axisA, axisB, angle.current, up, forward, body.current.quaternion);
    body.current.position.copy(up).multiplyScalar(c.distance);
    body.current.scale.setScalar(c.size * style.scale);

    // Solarflügel um ihre Achse (lokal z) zur Sonne drehen: Flächennormale (lokal y) zeigt zur Sonne
    const globe = scene.getObjectByName("globe");
    if (globe) {
      inverse.copy(body.current.quaternion).invert();
      sunLocal.copy(globe.material.uniforms.uSunDirection.value).applyQuaternion(inverse);
      wings.current.rotation.z = Math.atan2(-sunLocal.x, sunLocal.y);
    }
  });

  return (
    <group ref={body}>
      {/* Körper mit Goldfolie */}
      <mesh>
        <boxGeometry args={[0.42, 0.5, 0.42]} />
        <Paint color="#e0b24f" boxEdges />
      </mesh>
      {/* Parabolantenne zur Erde */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.12, 8]} />
        <Paint color="#c9c4dd" />
      </mesh>
      <mesh position={[0, -0.42, 0]}>
        <cylinderGeometry args={[0.26, 0.04, 0.1, 20]} />
        <Paint color="#efeaf7" />
      </mesh>
      {/* Kleine Stabantenne oben */}
      <mesh position={[0.1, 0.4, 0.1]}>
        <cylinderGeometry args={[0.012, 0.012, 0.3, 5]} />
        <Paint color="#3b3a78" />
      </mesh>
      <group ref={wings}>
        <Wing side={-1} />
        <Wing side={1} />
      </group>
      <ShipLight position={[0.1, 0.56, 0.1]} color="#ff5a4a" size={0.3} />
    </group>
  );
}
