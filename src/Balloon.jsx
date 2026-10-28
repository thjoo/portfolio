import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useControls } from "leva";
import { useObjectStyle } from "./objectStyle.js";
import * as THREE from "three";
import vertexSource from "./shaders/balloon.vert?raw";
import fragmentSource from "./shaders/balloon.frag?raw";
import noise from "./shaders/noise.glsl?raw";
import sunlight from "./shaders/sunlight.glsl?raw";
import Paint from "./Paint.jsx";

const vertexShader = vertexSource.replace("#include ./noise.glsl", noise);
const fragmentShader = fragmentSource
  .replace("#include ./noise.glsl", noise)
  .replace("#include ./sunlight.glsl", sunlight);

// Formen der Hülle für LatheGeometry
// height: Höhe der Hülle, base: Breite unten (0 spitz, 1 kugelig), power: wie schnell sie unten schmal wird,
// end: wie weit das Profil nach unten geht (Anteil von π), neck: Radius der Öffnung unten
export const SHAPES = {
  classic: { height: 1.15, base: 0.42, power: 0.55, end: 0.93, neck: 0.14 },
  onion: { height: 1.0, base: 0.58, power: 0.35, end: 0.9, neck: 0.16 },
  slim: { height: 1.4, base: 0.3, power: 0.8, end: 0.94, neck: 0.12 },
  weather: { height: 1.05, base: 0.92, power: 1.0, end: 0.97, neck: 0.06 },
};

function balloonProfile(shape, segments = 48) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * shape.end; // 0 = oben
    const top = (1 + Math.cos(theta)) / 2; // 1 oben, 0 unten
    const radius = Math.sin(theta) * (shape.base + (1 - shape.base) * Math.pow(top, shape.power));
    points.push(new THREE.Vector2(Math.max(radius, 0), Math.cos(theta) * shape.height));
  }
  // Kleine Öffnung (Hals) unten
  const last = points[points.length - 1];
  points.push(new THREE.Vector2(Math.max(last.x, shape.neck), last.y - 0.05));
  // LatheGeometry erwartet die Punkte von unten nach oben, sonst zeigen die Flächen nach innen
  return points.reverse();
}

const DOWN = new THREE.Vector3(0, -1, 0);
const toEarth = new THREE.Vector3();

// Eine Hülle mit eigenem Material; Farben aus den Reglern, Malstil gemeinsam
function Envelope({ form, stripeA, stripeB, stripes, style, position = [0, 0, 0], tilt = 0 }) {
  const mesh = useRef();
  const scene = useThree((state) => state.scene);
  const geometry = useMemo(() => new THREE.LatheGeometry(balloonProfile(form), 64), [form]);
  const uniforms = useMemo(
    () => ({
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uStripeA: { value: new THREE.Color() },
      uStripeB: { value: new THREE.Color() },
      uStripes: { value: 8 },
      uShade: { value: 0.4 },
      uPigment: { value: 0.2 },
      uEdge: { value: 0.4 },
      uBleed: { value: 0.2 },
      uGranulation: { value: 0.06 },
      uOutlineWobble: { value: 0.02 },
    }),
    []
  );

  useFrame(() => {
    // R3F kopiert das uniforms-Objekt -> Uniforms des Materials beschreiben
    const u = mesh.current.material.uniforms;
    const globe = scene.getObjectByName("globe");
    if (globe) u.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
    u.uStripeA.value.set(stripeA);
    u.uStripeB.value.set(stripeB);
    u.uStripes.value = stripes;
    u.uShade.value = style.shade;
    u.uPigment.value = style.pigment;
    u.uEdge.value = style.edge;
    u.uBleed.value = style.bleed;
    u.uGranulation.value = style.granulation;
    u.uOutlineWobble.value = style.outlineWobble;
  });

  return (
    <mesh ref={mesh} geometry={geometry} position={position} rotation={[0, 0, tilt]}>
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
    </mesh>
  );
}

// Ein Ballon: kind "hot" (Heissluft mit Korb) oder "weather" (Wetterballon mit Schnur und Messgerät)
export default function Balloon({
  label,
  kind = "hot",
  shape = "classic",
  stripeA = "#5b7fe2",
  stripeB = "#e8dfb4",
  stripes = 8,
  size = 0.08,
  angle = -62,
  height = -0.45,
  distance = 1.35,
  phase = 0,
  payloadColor = "#c9a25c",
}) {
  const orbit = useRef();
  const body = useRef();
  const pendulumRef = useRef();
  const form = SHAPES[shape];

  const style = useObjectStyle();
  const c = useControls(
    label,
    {
      stripeA: { value: stripeA, label: "Farbe 1" },
      stripeB: { value: stripeB, label: "Farbe 2" },
      stripes: { value: stripes, min: 0, max: 16, step: 1, label: "Streifen" },
      size: { value: size, min: 0.02, max: 0.2, label: "Grösse" },
      angle: { value: angle, min: -180, max: 180, step: 1, label: "Position (°)" },
      height: { value: height, min: -1.4, max: 1.4, label: "Höhe" },
      distance: { value: distance, min: 1.05, max: 2.2, label: "Abstand" },
    },
    { collapsed: true }
  );

  // Hals unten und Drehpunkt oben (für Seile und Pendel)
  const neckY = -form.height * Math.cos(Math.PI * (1 - form.end)) - 0.05;
  const topY = form.height;

  const ropes = useMemo(() => {
    if (kind === "weather") return [[[0, neckY, 0], [0, neckY - 1.6, 0]]];
    return [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      return [
        [Math.cos(a) * form.neck, neckY, Math.sin(a) * form.neck],
        [Math.cos(a) * 0.1, neckY - 0.26, Math.sin(a) * 0.1],
      ];
    });
  }, [kind, neckY, form.neck]);
  const payloadY = kind === "weather" ? neckY - 1.68 : neckY - 0.35;
  const payloadSize = kind === "weather" ? [0.16, 0.13, 0.16] : [0.22, 0.18, 0.22];

  useFrame((state, delta) => {
    // Langsam um die Erde, dazu leichtes Wippen
    orbit.current.rotation.y += delta * style.orbitSpeed;
    const t = state.clock.elapsedTime + phase;
    const a = THREE.MathUtils.degToRad(c.angle);
    const horizontal = Math.sqrt(Math.max(c.distance * c.distance - c.height * c.height, 0.01));
    body.current.position.set(
      Math.sin(a) * horizontal,
      c.height + Math.sin(t * 0.8) * 0.012,
      Math.cos(a) * horizontal
    );

    // Korb/Schnur zeigt zur Erde: die -Y-Achse auf den Erdmittelpunkt ausrichten (keine Neigung)
    toEarth.copy(body.current.position).negate().normalize();
    body.current.quaternion.setFromUnitVectors(DOWN, toEarth);

    // Pendeln um den Drehpunkt oben an der Hülle: zwei Schwingungen mit verschiedenem Takt
    const w = t * style.swingSpeed;
    const amplitude = THREE.MathUtils.degToRad(style.swingAmount) * (kind === "weather" ? 0.6 : 1);
    pendulumRef.current.rotation.set(
      Math.sin(w * 1.3) * amplitude * 0.6 + Math.sin(w * 0.47) * amplitude * 0.25,
      0,
      Math.sin(w * 0.9 + 1.1) * amplitude
    );
    body.current.scale.setScalar(c.size);
  });

  return (
    <group ref={orbit}>
      <group ref={body}>
        {/* Drehpunkt oben an der Hülle, alles darunter pendelt */}
        <group position={[0, topY, 0]}>
          <group ref={pendulumRef}>
            <group position={[0, -topY, 0]}>
              <Envelope form={form} stripeA={c.stripeA} stripeB={c.stripeB} stripes={c.stripes} style={style} />
              {ropes.map((points, i) => (
                <Line key={i} points={points} color="#2e2860" lineWidth={kind === "weather" ? 1.2 : 1.6} />
              ))}
              <mesh position={[0, payloadY, 0]}>
                <boxGeometry args={payloadSize} />
                <Paint color={payloadColor} boxEdges />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
