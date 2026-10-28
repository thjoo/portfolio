import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Kuwahara } from "@react-three/postprocessing";
import { Leva, useControls } from "leva";
import Globe from "./Globe.jsx";
import Stars from "./Stars.jsx";
import Background from "./Background.jsx";
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
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const paper = useMemo(() => new PaperEffect(), []);

  const p = useControls("Nachbearbeitung", {
    kuwahara: { value: true, label: "Kuwahara an" },
    radius: { value: 4, min: 1, max: 12, step: 1, label: "Pinsel-Radius" },
    sectors: { value: 8, min: 2, max: 8, step: 1, label: "Sektoren" },
    distortion: { value: 0.003, min: 0, max: 0.02, label: "Verzerrung" },
  });

  const bg = useControls("Papier Hintergrund", {
    scale: { value: 1, min: 0.3, max: 4, label: "Grösse" },
    fibers: { value: 0.14, min: 0, max: 0.5, label: "Fasern" },
    tooth: { value: 0.08, min: 0, max: 0.5, label: "Zahn" },
    grain: { value: 0.05, min: 0, max: 0.3, label: "Korn" },
  });

  const earth = useControls("Papier Erde", {
    follow: { value: true, label: "dreht mit" },
    scale: { value: 1.6, min: 0.3, max: 4, label: "Grösse" },
    fibers: { value: 0.08, min: 0, max: 0.5, label: "Fasern" },
    tooth: { value: 0.2, min: 0, max: 0.5, label: "Zahn" },
    grain: { value: 0.04, min: 0, max: 0.3, label: "Korn" },
    pooling: { value: 1.5, min: 1, max: 2, label: "Pigment in Tälern" },
  });

  useFrame((state) => {
    const u = paper.uniforms;
    u.get("uDistortion").value = p.distortion;
    u.get("uAspect").value = size.width / size.height;
    u.get("uBgScale").value = bg.scale;
    u.get("uBgFibers").value = bg.fibers;
    u.get("uBgTooth").value = bg.tooth;
    u.get("uBgGrain").value = bg.grain;
    u.get("uEarthScale").value = earth.scale;
    u.get("uEarthFibers").value = earth.fibers;
    u.get("uEarthTooth").value = earth.tooth;
    u.get("uEarthGrain").value = earth.grain;
    u.get("uEarthPooling").value = earth.pooling;
    u.get("uEarthFollow").value = earth.follow ? 1 : 0;
    u.get("uInverseProjection").value.copy(camera.projectionMatrixInverse);
    u.get("uCameraWorld").value.copy(camera.matrixWorld);
    u.get("uViewMatrix").value.copy(camera.matrixWorldInverse);
    const globe = scene.getObjectByName("globe");
    if (globe) {
      u.get("uGlobeInverse").value.copy(globe.matrixWorld).invert();
      // Eis-Einstellungen der Erde übernehmen, damit Grundfläche und Gekritzel zusammenpassen
      const g = globe.material.uniforms;
      u.get("uLand").value = g.uLand.value;
      u.get("uIceNorth").value = g.uIceNorth.value;
      u.get("uIceSouth").value = g.uIceSouth.value;
      u.get("uIceIrregular").value = g.uIceIrregular.value;
      u.get("uScribble").value = g.uScribble.value;
      u.get("uScribbleDensity").value = g.uScribbleDensity.value;
      u.get("uIceCoast").value = g.uIceCoast.value;
      u.get("uScribbleWidth").value = g.uScribbleWidth.value * state.gl.getPixelRatio();
      u.get("uIceThickness").value = g.uIceThickness.value * state.gl.getPixelRatio();
      u.get("uIceColor").value.copy(g.uIce.value);
      u.get("uSunDirection").value.copy(g.uSunDirection.value);
    }
  });

  return (
    <EffectComposer multisampling={0}>
      {p.kuwahara && <Kuwahara radius={p.radius} sectorCount={p.sectors} />}
      <primitive object={paper} />
    </EffectComposer>
  );
}

export default function App() {
  return (
    <>
      <Leva collapsed />
      <Canvas camera={{ position: [0, 0, 3.6], fov: 40 }} dpr={[1, 2]}>
        <Background />
        <Stars />
        <Globe />
        <OrbitControls enablePan={false} minDistance={2} maxDistance={14} />
        <FitCamera />
        <Post />
      </Canvas>
    </>
  );
}
