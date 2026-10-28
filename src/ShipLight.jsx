import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import glowFragment from "./shaders/glow.frag?raw";

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const world = new THREE.Vector3();

// Kleines Licht (Positions-, Top- oder Hecklicht), das nur nachts weich einblendet
export default function ShipLight({ position, color = "#fff4d6", size = 0.22 }) {
  const group = useRef();
  const material = useRef();
  const scene = useThree((state) => state.scene);
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } }), [color]);

  useFrame(({ clock }) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    group.current.getWorldPosition(world);
    const sun = globe.material.uniforms.uSunDirection.value;
    // Nacht, wenn die Sonne hinter dem Horizont des Schiffs steht
    const night = 1 - THREE.MathUtils.smoothstep(world.normalize().dot(sun), -0.15, 0.2);
    const twinkle = 0.85 + 0.15 * Math.sin(clock.elapsedTime * 2.3 + position[0] * 7);
    material.current.uniforms.uOpacity.value = night * twinkle;
  });

  return (
    <Billboard ref={group} position={position}>
      <mesh scale={size}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={material}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </Billboard>
  );
}
