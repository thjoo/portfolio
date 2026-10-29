import { useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Kuwahara } from "@react-three/postprocessing";
import { Leva, useControls } from "leva";
import Globe from "./Globe.jsx";
import Stars from "./Stars.jsx";
import Balloon from "./Balloon.jsx";
import Ship from "./Ship.jsx";
import Meteor from "./Meteor.jsx";
import Zeppelin from "./Zeppelin.jsx";
import Satellite from "./Satellite.jsx";
import Rocket from "./Rocket.jsx";
import Airplane from "./Airplane.jsx";
import Volcano from "./Volcano.jsx";
import Clouds from "./Clouds.jsx";

// New York -> Ärmelkanal (über den Nordatlantik)
const ATLANTIC_ROUTE = [
  [40.3, -71.0],
  [41.5, -55.0],
  [45.0, -35.0],
  [48.0, -15.0],
  [49.6, -4.0],
];

// Südatlantik: Falklandinseln -> an Südgeorgien vorbei -> Richtung Weddellmeer (Forschungsschiff).
// Geprüft gegen die Landmaske (auch 0.3°/0.5° daneben frei)
const SOUTHERN_OCEAN_ROUTE = [
  [-50.2, -55.5],
  [-52.2, -45.0],
  [-53.0, -34.0],
  [-57.0, -28.0],
  [-61.0, -22.0],
];

// Pazifik: Hawaii -> Tahiti (Kreuzfahrt). Geprüft gegen die Landmaske, auch 0.25° daneben frei
const PACIFIC_ROUTE = [
  [20.4, -157.4],
  [12.0, -154.0],
  [2.0, -151.5],
  [-8.0, -150.5],
  [-16.9, -149.9],
];

// Indik: Nordspitze Sumatras -> südlich an Sri Lanka vorbei -> Arabisches Meer. Geprüft wie oben
const INDIAN_ROUTE = [
  [6.2, 94.6],
  [5.6, 88.0],
  [5.4, 80.6],
  [8.0, 70.0],
  [11.5, 62.0],
  [13.5, 57.5],
];
import Background from "./Background.jsx";
import Journey from "./Journey.jsx";
import Sections from "./Sections.jsx";
import { Presence } from "./journey.js";
import { PaperEffect } from "./PaperEffect.js";
import { CopyPass } from "postprocessing";

function Post() {
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const paper = useMemo(() => new PaperEffect(), []);
  // Bild vor Kuwahara merken: Objekte (Schiffe, Ballone) werden daraus wieder scharf
  const sharp = useMemo(
    () => new CopyPass(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })),
    []
  );

  const p = useControls("Nachbearbeitung", {
    kuwahara: { value: true, label: "Kuwahara an" },
    radius: { value: 4, min: 1, max: 12, step: 1, label: "Pinsel-Radius" },
    sectors: { value: 8, min: 2, max: 8, step: 1, label: "Sektoren" },
    distortion: { value: 0.003, min: 0, max: 0.02, label: "Verzerrung" },
    objectSharp: { value: 0.85, min: 0, max: 1, label: "Objekte scharf" },
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
    u.get("uSharp").value = sharp.texture;
    u.get("uObjectSharp").value = p.objectSharp;
    u.get("uAspect").value = size.width / size.height;
    u.get("uEarthScale").value = earth.scale;
    u.get("uEarthFibers").value = earth.fibers;
    u.get("uEarthTooth").value = earth.tooth;
    u.get("uEarthGrain").value = earth.grain;
    u.get("uEarthPooling").value = earth.pooling;
    u.get("uEarthFollow").value = earth.follow ? 1 : 0;
    // Matrizen für dieses Bild aktualisieren: Kamera (Reise) und Erde (Drehung) haben sich
    // in useFrame bewegt, three.js rechnet matrixWorld sonst erst beim Rendern nach -> Eis hinkt nach
    camera.updateMatrixWorld();
    scene.getObjectByName("globe")?.updateWorldMatrix(true, false);
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
      <primitive object={sharp} />
      {p.kuwahara && <Kuwahara radius={p.radius} sectorCount={p.sectors} />}
      <primitive object={paper} />
    </EffectComposer>
  );
}

export default function App() {
  // Auflösung: höchstens 1.5-fach (Retina mit 2× kostet fast doppelt so viele Pixel, sieht im Aquarell
  // kaum schärfer aus). Wird es ruckelig, automatisch auf 1× herunter, bei Luft wieder hoch.
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 1.5));
  return (
    <>
      <Leva collapsed />
      {/* Drei Ebenen: hinten Hintergrund und Sterne, dazwischen der Titel (in Sections), vorne die Erde mit
          allen Objekten auf durchsichtigem Grund. So liegt der Titel hinter Erde, Wolken und Ballonen */}
      <div className="backdrop">
        <Canvas dpr={1} camera={{ position: [0, 0, 3.6], fov: 40 }}>
          <Background />
          <Stars />
        </Canvas>
      </div>
      <div className="stage">
        <Canvas camera={{ position: [0, 0, 3.6], fov: 40 }} dpr={dpr}>
          <PerformanceMonitor
            onDecline={() => setDpr(1)}
            onIncline={() => setDpr(Math.min(window.devicePixelRatio, 1.5))}
            flipflops={3}
            onFallback={() => setDpr(1)}
          />
          <Journey />
          <Globe />
          <Presence value="clouds">
            <Clouds />
          </Presence>
          <Presence value="meteor">
            <Meteor />
          </Presence>
          {/* Grössen nach echter Länge gestaffelt (gestaucht, damit alle erkennbar bleiben):
              Containerschiff ~400 m, Kreuzfahrtschiff ~300 m, Frachter ~190 m, Forschungsschiff ~120 m */}
          <Presence value="shipContainer">
            <Ship label="Containerschiff" model="container" waypoints={ATLANTIC_ROUTE} start={0.35} />
          </Presence>
          <Presence value="shipCruise">
            <Ship label="Kreuzfahrtschiff" model="cruise" waypoints={PACIFIC_ROUTE} start={0.2} size={0.055} />
          </Presence>
          <Presence value="shipResearch">
            <Ship
              label="Forschungsschiff"
              model="research"
              waypoints={SOUTHERN_OCEAN_ROUTE}
              start={0.4}
              size={0.042}
              speed={0.0025}
            />
          </Presence>
          <Presence value="shipFreighter">
            <Ship label="Frachter" model="freighter" waypoints={INDIAN_ROUTE} start={0.6} size={0.048} speed={0.003} />
          </Presence>
          <Presence value="balloonClassic">
            <Balloon label="Ballon Klassik" shape="classic" stripeA="#5b7fe2" stripeB="#e8dfb4" angle={-62} height={-0.45} />
          </Presence>
          <Presence value="balloonOnion">
            <Balloon
              label="Ballon Zwiebel"
              shape="onion"
              stripeA="#d9614c"
              stripeB="#f2c46b"
              stripes={10}
              size={0.07}
              angle={68}
              height={0.5}
              distance={1.38}
              phase={2.1}
            />
          </Presence>
          <Presence value="weatherBalloon">
            <Balloon
              label="Wetterballon"
              kind="weather"
              shape="weather"
              stripeA="#e9ecf8"
              stripeB="#e9ecf8"
              stripes={0}
              size={0.065}
              angle={40}
              height={-0.85}
              distance={1.45}
              phase={1.3}
              payloadColor="#e9874a"
            />
          </Presence>
          <Presence value="zeppelin">
            <Zeppelin />
          </Presence>
          <Presence value="satellite">
            <Satellite />
          </Presence>
          <Presence value="rocket">
            <Rocket />
          </Presence>
          <Presence value="volcano">
            <Volcano />
          </Presence>
          {/* Flugzeuge auf Grosskreisen: Zürich -> New York, London -> Kapstadt */}
          <Presence value="planeZurich">
            <Airplane label="Flugzeug Zürich–New York" from={[47.46, 8.56]} to={[40.64, -73.78]} livery="#d9614c" start={0.3} />
          </Presence>
          <Presence value="planeLondon">
            <Airplane
              label="Flugzeug London–Kapstadt"
              from={[51.47, -0.45]}
              to={[-33.97, 18.6]}
              livery="#5b7fe2"
              duration={140}
              start={0.6}
            />
          </Presence>
          <Post />
        </Canvas>
      </div>
      <Sections />
    </>
  );
}
