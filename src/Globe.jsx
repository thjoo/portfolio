import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import * as THREE from "three";
import { createLandTexture } from "./landTexture.js";
import { blend, blendColor } from "./journey.js";
import IceCaps from "./IceCaps.jsx";
import vertexShader from "./shaders/globe.vert?raw";
import fragmentSource from "./shaders/globe.frag?raw";
import noise from "./shaders/noise.glsl?raw";

const fragmentShader = fragmentSource.replace("#include ./noise.glsl", noise);

export default function Globe() {
  const mesh = useRef();
  const landTexture = useMemo(() => createLandTexture(), []);

  const uniforms = useMemo(
    () => ({
      uLand: { value: landTexture },
      uSunDirection: { value: new THREE.Vector3() },
      uOceanDay: { value: new THREE.Color() },
      uOceanNight: { value: new THREE.Color() },
      uLandDay: { value: new THREE.Color() },
      uLandNight: { value: new THREE.Color() },
      uIce: { value: new THREE.Color() },
      uSeaIce: { value: new THREE.Color() },
      uCityLights: { value: new THREE.Color() },
      uHighlight: { value: new THREE.Color() },
      uTerminatorSoftness: { value: 0 },
      uTerminatorWobble: { value: 0 },
      uCoastWobble: { value: 0 },
      uPigment: { value: 0 },
      uEdgeDarkening: { value: 0 },
      uGranulation: { value: 0 },
      uIceNorth: { value: 0 },
      uIceSouth: { value: 0 },
      uIceIrregular: { value: 0 },
      uIceCoast: { value: 0 },
      uIceSoftness: { value: 0 },
      uSnowStart: { value: 58 },
      uSnowEnd: { value: 74 },
      uScribble: { value: 0 },
      uScribbleDensity: { value: 1 },
      uScribbleWidth: { value: 1.6 },
      uIceThickness: { value: 4 },
      uCityDensity: { value: 0 },
      uSpecular: { value: 0 },
      uFresnel: { value: 0 },
    }),
    [landTexture]
  );

  const c = useControls("Erde", {
    Farben: folder({
      oceanDay: "#5a55d6",
      oceanNight: "#36318a",
      landDay: "#6584f2",
      landNight: "#1c1838",
      ice: "#d6e0ff",
      seaIce: "#9fb4f4",
      cityLights: "#fbf6ea",
      highlight: "#8f98ff",
    }),
    Licht: folder({
      terminatorSoftness: { value: 0.22, min: 0.001, max: 0.5, label: "Tag/Nacht weich" },
      terminatorWobble: { value: 0.16, min: 0, max: 0.4, label: "Tag/Nacht gemalt" },
      specular: { value: 0.55, min: 0, max: 1, label: "Glanzfleck" },
      fresnel: { value: 0.25, min: 0, max: 1, label: "Rand" },
    }),
    Aquarell: folder({
      coastWobble: { value: 0.07, min: 0, max: 0.4, label: "Küste wackelig" },
      pigment: { value: 0.3, min: 0, max: 0.6, label: "Pigment-Wolken" },
      edgeDarkening: { value: 0.55, min: 0, max: 1, label: "Pigmentrand" },
      granulation: { value: 0.09, min: 0, max: 0.25, label: "Körnung" },
    }),
    Details: folder({
      iceIrregular: { value: 1, min: 0, max: 2, label: "Knäuel unordentlich" },
      iceCoast: { value: 0.35, min: 0, max: 1, label: "Küste im Eis" },
      iceSoftness: { value: 0.14, min: 0.005, max: 0.3, label: "Eis-Übergang weich" },
      snowStart: { value: 58, min: 30, max: 85, step: 1, label: "Schnee ab Breite (°)" },
      snowEnd: { value: 74, min: 35, max: 90, step: 1, label: "Schnee deckend ab (°)" },
      scribble: { value: 1, min: 0, max: 1, label: "Gekritzel" },
      scribbleDensity: { value: 1, min: 0.2, max: 1.8, label: "Schlaufen (Anzahl)" },
      scribbleWidth: { value: 3.2, min: 0.5, max: 8, label: "Strichbreite (px)" },
      iceThickness: { value: 6, min: 0, max: 16, label: "Eis-Dicke (px)" },
      cityDensity: { value: 1, min: 0, max: 1.5, label: "Stadtlichter" },
    }),
  });

  useFrame(() => {
    // R3F kopiert das uniforms-Objekt beim Erzeugen -> immer die Uniforms des Materials beschreiben
    const u = mesh.current.material.uniforms;
    // Farben je Jahreszeit (Stadium der Reise); im ersten und letzten Stadium die Grundfarben der Regler
    blendColor(u.uOceanDay.value, "oceanDay", c.oceanDay);
    blendColor(u.uOceanNight.value, "oceanNight", c.oceanNight);
    blendColor(u.uLandDay.value, "landDay", c.landDay);
    blendColor(u.uLandNight.value, "landNight", c.landNight);
    blendColor(u.uIce.value, "ice", c.ice);
    blendColor(u.uSeaIce.value, "seaIce", c.seaIce);
    blendColor(u.uHighlight.value, "highlight", c.highlight);
    u.uCityLights.value.set(c.cityLights);

    // Sonne in Weltkoordinaten und Eis je Jahreszeit: Winkel um die Erde und Höhe (im Sommer steht sie
    // über dem Norden, im Winter über dem Süden)
    const [from, to, f] = blend();
    const angle = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(from.sun[0], to.sun[0], f));
    const height = THREE.MathUtils.lerp(from.sun[1], to.sun[1], f);
    u.uSunDirection.value.set(Math.sin(angle), height, Math.cos(angle)).normalize();

    u.uTerminatorSoftness.value = c.terminatorSoftness;
    u.uTerminatorWobble.value = c.terminatorWobble;
    u.uCoastWobble.value = c.coastWobble;
    u.uPigment.value = c.pigment;
    u.uEdgeDarkening.value = c.edgeDarkening;
    u.uGranulation.value = c.granulation;
    u.uIceNorth.value = THREE.MathUtils.lerp(from.ice[0], to.ice[0], f);
    u.uIceSouth.value = THREE.MathUtils.lerp(from.ice[1], to.ice[1], f);
    u.uIceIrregular.value = c.iceIrregular;
    u.uIceCoast.value = c.iceCoast;
    u.uIceSoftness.value = c.iceSoftness;
    u.uSnowStart.value = c.snowStart;
    u.uSnowEnd.value = Math.max(c.snowEnd, c.snowStart + 1);
    u.uScribble.value = c.scribble;
    u.uScribbleDensity.value = c.scribbleDensity;
    u.uScribbleWidth.value = c.scribbleWidth;
    u.uIceThickness.value = c.iceThickness;
    u.uCityDensity.value = c.cityDensity;
    u.uSpecular.value = c.specular;
    u.uFresnel.value = c.fresnel;
  });

  return (
    <mesh ref={mesh} name="globe">
      <sphereGeometry args={[1, 128, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
      {/* Eis-Knäuel schweben als eigene Schalen über den Polen und drehen mit der Erde */}
      <IceCaps />
    </mesh>
  );
}
