import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import vertexSource from "./shaders/paint.vert?raw";
import fragmentSource from "./shaders/paint.frag?raw";
import noise from "./shaders/noise.glsl?raw";
import sunlight from "./shaders/sunlight.glsl?raw";

const fragmentShader = fragmentSource
  .replace("#include ./noise.glsl", noise)
  .replace("#include ./sunlight.glsl", sunlight);

// Malmaterial als Kind eines Mesh: <mesh><Paint color="#…" /></mesh>
// boxEdges: Kanten von Boxen mit einer dunkleren Pigmentlinie betonen
// glow: Farbe, in der die Fläche nachts leuchtet (z. B. Fenster); glowAlways: auch am Tag
// nightColor: färbt sich wie das Land der Erde (color am Tag, nightColor in der Nacht)
export default function Paint({ color = "#ffffff", noiseScale = 3, boxEdges = false, glow = null, glowStrength = 0.9, glowAlways = false, nightColor = null }) {
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
      uBoxEdges: { value: 0 },
      uGlow: { value: new THREE.Color() },
      uGlowStrength: { value: 0 },
      uGlowAlways: { value: 0 },
      uLandLike: { value: 0 },
      uNightColor: { value: new THREE.Color() },
      uTerminator: { value: 0.15 },
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
    u.uBoxEdges.value = boxEdges ? style.boxEdges : 0;
    if (glow) u.uGlow.value.set(glow);
    u.uGlowStrength.value = glow ? glowStrength : 0;
    u.uGlowAlways.value = glowAlways ? 1 : 0;
    u.uLandLike.value = nightColor ? 1 : 0;
    if (nightColor) u.uNightColor.value.set(nightColor);
    const terminator = globe?.material.uniforms.uTerminatorSoftness;
    if (terminator) u.uTerminator.value = terminator.value;
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
