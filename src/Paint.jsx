import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import vertexSource from "./shaders/paint.vert?raw";
import fragmentSource from "./shaders/paint.frag?raw";
import noise from "./shaders/noise.glsl?raw";

const fragmentShader = fragmentSource.replace("#include ./noise.glsl", noise);

// Malmaterial als Kind eines Mesh: <mesh><Paint color="#…" /></mesh>
export default function Paint({ color = "#ffffff", noiseScale = 3 }) {
  const material = useRef();
  const scene = useThree((state) => state.scene);
  const style = useObjectStyle();
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color() },
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uShade: { value: 0.4 },
      uPigment: { value: 0.2 },
      uEdge: { value: 0.4 },
      uGranulation: { value: 0.06 },
      uNoiseScale: { value: 3 },
    }),
    []
  );

  useFrame(() => {
    // R3F kopiert das uniforms-Objekt -> Uniforms des Materials beschreiben
    const u = material.current.uniforms;
    const globe = scene.getObjectByName("globe");
    if (globe) u.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
    u.uColor.value.set(color);
    u.uShade.value = style.shade;
    u.uPigment.value = style.pigment;
    u.uEdge.value = style.edge;
    u.uGranulation.value = style.granulation;
    u.uNoiseScale.value = noiseScale;
  });

  return (
    <shaderMaterial
      ref={material}
      vertexShader={vertexSource}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
    />
  );
}
