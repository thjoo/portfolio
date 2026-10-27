import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Kuwahara } from "@react-three/postprocessing";
import { Leva, useControls } from "leva";
import Globe from "./Globe.jsx";
import Stars from "./Stars.jsx";
import { PaperEffect } from "./PaperEffect.js";

// Kamera-Abstand so wählen, dass die Kugel auch im Hochformat ganz sichtbar bleibt
function FitCamera() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  useEffect(() => {
    const aspect = size.width / size.height;
    const fit = 1.45 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.setLength(aspect < 1 ? fit / aspect : fit);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Post() {
  const size = useThree((state) => state.size);
  const paper = useMemo(() => new PaperEffect(), []);

  const p = useControls("Nachbearbeitung", {
    kuwahara: { value: true, label: "Kuwahara an" },
    radius: { value: 4, min: 1, max: 12, step: 1, label: "Pinsel-Radius" },
    sectors: { value: 8, min: 2, max: 8, step: 1, label: "Sektoren" },
    paper: { value: true, label: "Papier an" },
    distortion: { value: 0.003, min: 0, max: 0.02, label: "Verzerrung" },
    fibers: { value: 0.12, min: 0, max: 0.4, label: "Papierfasern" },
    grain: { value: 0.06, min: 0, max: 0.3, label: "Korn" },
    vignette: { value: 0.25, min: 0, max: 1, label: "Vignette" },
  });

  useFrame(() => {
    const u = paper.uniforms;
    u.get("uDistortion").value = p.paper ? p.distortion : 0;
    u.get("uFibers").value = p.paper ? p.fibers : 0;
    u.get("uGrain").value = p.paper ? p.grain : 0;
    u.get("uVignette").value = p.paper ? p.vignette : 0;
    u.get("uAspect").value = size.width / size.height;
  });

  return (
    <EffectComposer multisampling={0}>
      {p.kuwahara && <Kuwahara radius={p.radius} sectorCount={p.sectors} />}
      <primitive object={paper} />
    </EffectComposer>
  );
}

export default function App() {
  const { background } = useControls("Raum", { background: "#4a38b0" });

  return (
    <>
      <Leva collapsed />
      <Canvas camera={{ position: [0, 0, 3.6], fov: 40 }} dpr={[1, 2]}>
      <color attach="background" args={[background]} />
      <Stars />
      <Globe />
      <OrbitControls enablePan={false} minDistance={2} maxDistance={14} />
      <FitCamera />
      <Post />
      </Canvas>
    </>
  );
}
