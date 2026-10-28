import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import { Envelope } from "./Balloon.jsx";
import Paint from "./Paint.jsx";
import ShipLight from "./ShipLight.jsx";

const WINDOW_GLOW = "#ffd98a";

// Zigarrenform für LatheGeometry: Achse = y, Bug oben (y = 1) rund, Heck unten (y = -1) spitz zulaufend.
// Punkte von unten nach oben, sonst zeigen die Flächen nach innen
function zeppelinProfile(radius = 0.3, segments = 60) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = -1 + (i / segments) * 2;
    const r = t >= 0 ? Math.sqrt(1 - t * t) : Math.pow(1 - Math.pow(-t, 1.8), 0.75);
    points.push(new THREE.Vector2(Math.max(r * radius, 0), t));
  }
  return points;
}

// Leitwerk-Flosse als Trapez, Fuss liegt in der Hülle; Dicke um z = 0 zentriert
function finGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(-0.98, 0);
  shape.lineTo(-1.04, 0.36);
  shape.lineTo(-0.84, 0.36);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  geometry.translate(0, 0, -0.015);
  return geometry;
}

// Motorgondel seitlich mit drehendem Propeller hinten
function Engine({ side, propeller }) {
  return (
    <group position={[-0.12, -0.24, side * 0.27]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.045, 0.16, 12]} />
        <Paint color="#8b86b8" />
      </mesh>
      <group ref={propeller} position={[-0.09, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.012, 0.16, 0.022]} />
          <Paint color="#3b3a78" />
        </mesh>
      </group>
    </group>
  );
}

const UP = new THREE.Vector3();
const forward = new THREE.Vector3();
const side = new THREE.Vector3();
const basis = new THREE.Matrix4();
const axisA = new THREE.Vector3();
const axisB = new THREE.Vector3();
const normal = new THREE.Vector3();

// Zeppelin auf einer schrägen Kreisbahn um die Erde, Bug in Flugrichtung, Bauch zur Erde
export default function Zeppelin({ label = "Zeppelin", size = 0.1 }) {
  const body = useRef();
  const propellerLeft = useRef();
  const propellerRight = useRef();
  const angle = useRef(0.6);
  const style = useObjectStyle();
  const profile = useMemo(() => zeppelinProfile(), []);
  const fin = useMemo(() => finGeometry(), []);

  const c = useControls(
    label,
    {
      stripeA: { value: "#efe4c6", label: "Hülle 1" },
      stripeB: { value: "#d9cba6", label: "Hülle 2" },
      stripes: { value: 12, min: 0, max: 24, step: 1, label: "Bahnen" },
      accent: { value: "#d9614c", label: "Leitwerk" },
      gondola: { value: "#d9614c", label: "Gondel" },
      size: { value: size, min: 0.03, max: 0.25, label: "Grösse" },
      distance: { value: 1.3, min: 1.08, max: 2, label: "Abstand" },
      inclination: { value: 28, min: 0, max: 90, step: 1, label: "Bahnneigung (°)" },
      node: { value: -30, min: -180, max: 180, step: 1, label: "Bahn drehen (°)" },
      speed: { value: 0.02, min: 0, max: 0.2, label: "Tempo" },
    },
    { collapsed: true }
  );

  useFrame((state, delta) => {
    angle.current += delta * c.speed;
    const t = state.clock.elapsedTime;

    // Bahnebene: Normale aus Neigung und Drehung, zwei Achsen in der Ebene
    const inclination = THREE.MathUtils.degToRad(c.inclination);
    const node = THREE.MathUtils.degToRad(c.node);
    normal.set(Math.sin(inclination) * Math.cos(node), Math.cos(inclination), Math.sin(inclination) * Math.sin(node));
    axisA.set(-Math.sin(node), 0, Math.cos(node));
    axisB.crossVectors(normal, axisA).normalize();

    const a = angle.current;
    const height = c.distance + Math.sin(t * 0.6) * 0.008;
    UP.copy(axisA).multiplyScalar(Math.cos(a)).addScaledVector(axisB, Math.sin(a));
    body.current.position.copy(UP).multiplyScalar(height);
    // Flugrichtung = Ableitung der Kreisbahn; rechts = vorne × oben
    forward.copy(axisA).multiplyScalar(-Math.sin(a)).addScaledVector(axisB, Math.cos(a));
    side.crossVectors(forward, UP);
    basis.makeBasis(forward, UP, side);
    body.current.quaternion.setFromRotationMatrix(basis);
    // Leichtes Nicken wie in Böen
    body.current.rotateZ(Math.sin(t * 0.45) * 0.03);
    body.current.scale.setScalar(c.size * style.scale);

    propellerLeft.current.rotation.x += delta * 14;
    propellerRight.current.rotation.x -= delta * 14;
  });

  return (
    <group ref={body}>
      {/* Hülle: Lathe-Achse (y) auf die Flugrichtung (x) drehen */}
      <Envelope
        profile={profile}
        stripeA={c.stripeA}
        stripeB={c.stripeB}
        stripes={c.stripes}
        style={style}
        rotation={[0, 0, -Math.PI / 2]}
      />
      {/* Leitwerk: vier Flossen über Kreuz */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={fin} rotation={[(i * Math.PI) / 2, 0, 0]}>
          <Paint color={c.accent} />
        </mesh>
      ))}
      {/* Gondel unter dem Bauch mit Fensterband */}
      <mesh position={[0.22, -0.31, 0]}>
        <boxGeometry args={[0.34, 0.09, 0.12]} />
        <Paint color={c.gondola} boxEdges />
      </mesh>
      <mesh position={[0.24, -0.305, 0]}>
        <boxGeometry args={[0.26, 0.03, 0.125]} />
        <Paint color="#3b3a78" glow={WINDOW_GLOW} />
      </mesh>
      <Engine side={-1} propeller={propellerLeft} />
      <Engine side={1} propeller={propellerRight} />
      {/* Positionslichter: rot links (-z), grün rechts (+z), weiss am Heck */}
      <ShipLight position={[0.22, -0.31, -0.08]} color="#ff5a4a" />
      <ShipLight position={[0.22, -0.31, 0.08]} color="#5dff9a" />
      <ShipLight position={[-1.03, 0, 0]} color="#fff6dc" size={0.2} />
    </group>
  );
}
