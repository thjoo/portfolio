import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import * as THREE from "three";
import { createLandTexture } from "./landTexture.js";
import vertexShader from "./shaders/globe.vert?raw";
import fragmentSource from "./shaders/globe.frag?raw";
import noise from "./shaders/noise.glsl?raw";
import ice from "./shaders/ice.glsl?raw";

const fragmentShader = fragmentSource
  .replace("#include ./noise.glsl", noise)
  .replace("#include ./ice.glsl", ice);

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
      uScribble: { value: 0 },
      uScribbleDensity: { value: 1 },
      uIceFill: { value: 0 },
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
      sunAngle: { value: -72, min: -180, max: 180, step: 1, label: "Sonne (°)" },
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
      iceNorth: { value: 0, min: 0, max: 1, label: "Arktis Sommer→Winter" },
      iceSouth: { value: 1, min: 0, max: 1, label: "Antarktis Sommer→Winter" },
      iceIrregular: { value: 1, min: 0, max: 2, label: "Eiskante unregelmässig" },
      iceCoast: { value: 0.35, min: 0, max: 1, label: "Küste im Eis" },
      iceSoftness: { value: 0.14, min: 0.005, max: 0.3, label: "Eis-Übergang weich" },
      scribble: { value: 1, min: 0, max: 1, label: "Gekritzel" },
      scribbleDensity: { value: 2.0, min: 0.4, max: 4, label: "Gekritzel dicht" },
      iceFill: { value: 0.4, min: 0, max: 1, label: "Meereis Grundfarbe" },
      cityDensity: { value: 1, min: 0, max: 1.5, label: "Stadtlichter" },
      rotationSpeed: { value: 0.015, min: 0, max: 0.3, label: "Rotation" },
    }),
  });

  useFrame((_, delta) => {
    // R3F kopiert das uniforms-Objekt beim Erzeugen -> immer die Uniforms des Materials beschreiben
    const u = mesh.current.material.uniforms;
    u.uOceanDay.value.set(c.oceanDay);
    u.uOceanNight.value.set(c.oceanNight);
    u.uLandDay.value.set(c.landDay);
    u.uLandNight.value.set(c.landNight);
    u.uIce.value.set(c.ice);
    u.uSeaIce.value.set(c.seaIce);
    u.uCityLights.value.set(c.cityLights);
    u.uHighlight.value.set(c.highlight);

    // Sonne in Weltkoordinaten, leicht von oben links vorne wie in der Illustration
    const a = THREE.MathUtils.degToRad(c.sunAngle);
    u.uSunDirection.value.set(Math.sin(a), 0.25, Math.cos(a)).normalize();

    u.uTerminatorSoftness.value = c.terminatorSoftness;
    u.uTerminatorWobble.value = c.terminatorWobble;
    u.uCoastWobble.value = c.coastWobble;
    u.uPigment.value = c.pigment;
    u.uEdgeDarkening.value = c.edgeDarkening;
    u.uGranulation.value = c.granulation;
    u.uIceNorth.value = c.iceNorth;
    u.uIceSouth.value = c.iceSouth;
    u.uIceIrregular.value = c.iceIrregular;
    u.uIceCoast.value = c.iceCoast;
    u.uIceSoftness.value = c.iceSoftness;
    u.uScribble.value = c.scribble;
    u.uScribbleDensity.value = c.scribbleDensity;
    u.uIceFill.value = c.iceFill;
    u.uCityDensity.value = c.cityDensity;
    u.uSpecular.value = c.specular;
    u.uFresnel.value = c.fresnel;

    mesh.current.rotation.y += delta * c.rotationSpeed;
  });

  return (
    <mesh ref={mesh} name="globe" rotation={[0.3, -1.15, -0.12]}>
      <sphereGeometry args={[1, 128, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
