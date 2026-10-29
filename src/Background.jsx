import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import fragmentSource from "./shaders/background.frag?raw";
import paper from "./shaders/paper.glsl?raw";
import { blendColor } from "./journey.js";

const fragmentShader = fragmentSource.replace("#include ./paper.glsl", paper);

// Bildschirmfüllende Fläche ganz hinten: Lila Lasur mit Vignette und Papierstruktur.
// Läuft in einer eigenen Ebene hinter dem Titel (die Erde und die Objekte liegen davor)
const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

export default function Background() {
  const mesh = useRef();
  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color() },
      uWashColor: { value: new THREE.Color() },
      uWash: { value: 0 },
      uVignette: { value: 0 },
      uPaperScale: { value: 1 },
      uPaperFibers: { value: 0.14 },
      uPaperTooth: { value: 0.08 },
      uPaperGrain: { value: 0.05 },
    }),
    []
  );

  const c = useControls("Hintergrund", {
    color: { value: "#4a38b0", label: "Farbe" },
    washColor: { value: "#5d4cc4", label: "Lasur-Farbe" },
    wash: { value: 0.6, min: 0, max: 1, label: "Lasur" },
    vignette: { value: 0.3, min: 0, max: 1, label: "Vignette" },
  });
  const paper = useControls("Papier Hintergrund", {
    scale: { value: 1, min: 0.3, max: 4, label: "Grösse" },
    fibers: { value: 0.14, min: 0, max: 0.5, label: "Fasern" },
    tooth: { value: 0.08, min: 0, max: 0.5, label: "Zahn" },
    grain: { value: 0.05, min: 0, max: 0.3, label: "Korn" },
  });

  useFrame((state) => {
    // R3F kopiert das uniforms-Objekt -> Uniforms des Materials beschreiben
    const u = mesh.current.material.uniforms;
    state.gl.getDrawingBufferSize(u.uResolution.value);
    // Hintergrund je Jahreszeit der Reise
    blendColor(u.uColor.value, "background", c.color);
    blendColor(u.uWashColor.value, "wash", c.washColor);
    u.uWash.value = c.wash;
    u.uVignette.value = c.vignette;
    u.uPaperScale.value = paper.scale;
    u.uPaperFibers.value = paper.fibers;
    u.uPaperTooth.value = paper.tooth;
    u.uPaperGrain.value = paper.grain;
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
