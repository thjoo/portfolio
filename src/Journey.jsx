import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { journey, dwell, blend, STAGES, SECTION_VH } from "./journey.js";
import { latLonToVector } from "./route.js";

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const tilt = new THREE.Quaternion();
const yaw = new THREE.Quaternion();
const point = new THREE.Vector3();
const center = new THREE.Vector3();

// Kürzester Weg zwischen zwei Winkeln (Grad)
function lerpAngle(a, b, f) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * f;
}

// Steuert die Reise: Scroll-Position -> Stadium, Erde zum Ort drehen, Kamera-Abstand und Verschiebung.
// Die Erde lässt sich mit der Maus/dem Finger drehen: am Anfang und am Schluss frei, dazwischen federt
// sie zurück in die Ansicht des Stadiums.
export default function Journey() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const drag = useRef({ yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, down: false, x: 0, y: 0, spin: 0 });

  useEffect(() => {
    const read = () => {
      const section = (window.innerHeight * SECTION_VH) / 100;
      journey.target = THREE.MathUtils.clamp(window.scrollY / section, 0, STAGES.length - 1);
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const d = drag.current;
    const down = (e) => {
      d.down = true;
      d.x = e.clientX;
      d.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!d.down) return;
      const dx = (e.clientX - d.x) / el.clientWidth;
      const dy = (e.clientY - d.y) / el.clientHeight;
      d.x = e.clientX;
      d.y = e.clientY;
      d.yaw += dx * 4;
      d.pitch = THREE.MathUtils.clamp(d.pitch + dy * 3, -1.2, 1.2);
      d.vyaw = dx * 4 * 60;
      d.vpitch = dy * 3 * 60;
    };
    const up = () => (d.down = false);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.style.touchAction = "pan-y"; // senkrecht wischen scrollt die Seite, waagrecht dreht die Erde
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    // Scroll weich nachziehen, dann Ruhezonen bei jedem Stadium
    journey.raw += ((journey.target ?? 0) - journey.raw) * (1 - Math.exp(-dt * 2.5));
    journey.stage = dwell(journey.raw);
    const nearest = Math.round(journey.stage);
    if (Math.abs(journey.stage - nearest) < 0.01 && journey.arrival.index !== nearest) {
      journey.arrival = { index: nearest, count: journey.arrival.count + 1 };
    }

    const [a, b, f] = blend();
    // Am Anfang und am Schluss darf man frei mit der Erde spielen, dazwischen federt sie zurück
    const free = Math.max(1 - Math.min(journey.stage / 0.3, 1), THREE.MathUtils.smoothstep(journey.stage, STAGES.length - 1.3, STAGES.length - 1));
    const d = drag.current;
    if (!d.down) {
      d.yaw += d.vyaw * dt;
      d.pitch = THREE.MathUtils.clamp(d.pitch + d.vpitch * dt, -1.2, 1.2);
      d.vyaw *= Math.exp(-dt * 2.5);
      d.vpitch *= Math.exp(-dt * 4);
      const spring = (1 - free) * 2.2;
      d.yaw -= d.yaw * Math.min(spring * dt, 1);
      d.pitch -= d.pitch * Math.min((spring + free * 0.6) * dt, 1);
      // Im freien Teil dreht sich die Erde ganz langsam von selbst
      d.spin += dt * 0.03 * free;
    }
    if (free < 0.01) d.spin -= d.spin * Math.min(2 * dt, 1);

    // Ort zur Kamera drehen: erst um die Erdachse (Länge), dann kippen (Breite)
    const lat = THREE.MathUtils.lerp(a.view[0], b.view[0], f);
    const lon = lerpAngle(a.view[1], b.view[1], f);
    latLonToVector(0, lon, point);
    // Auch in den Ruhezonen dreht die Erde beim Scrollen mit: Abstand zwischen Scrollweg und Stadium.
    // Er ist bei jedem Stadium genau 0 und wächst sonst stetig mit dem Scrollen -> die Erde dreht immer vorwärts
    const scrollSpin = (journey.raw - journey.stage) * 1.6;
    yaw.setFromAxisAngle(Y, -Math.atan2(point.x, point.z) + d.yaw + d.spin + scrollSpin);
    tilt.setFromAxisAngle(X, THREE.MathUtils.degToRad(lat) + d.pitch);
    const globe = scene.getObjectByName("globe");
    if (globe) globe.quaternion.copy(tilt).multiply(yaw);

    // Kamera: Abstand so, dass die ganze Erde passt (auch im Hochformat), dann Zoom des Stadiums
    const { width, height } = state.size;
    const aspect = width / height;
    const fit = 1.45 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = (aspect < 1 ? fit / aspect : fit) * THREE.MathUtils.lerp(a.zoom, b.zoom, f);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    // Breiter Bildschirm: Erde zur Seite schieben (Platz für den Text); schmal: etwas nach oben
    const shift = THREE.MathUtils.lerp(a.shift, b.shift, f);
    if (aspect > 1.1) camera.setViewOffset(width, height, -shift * width, 0, width, height);
    else camera.setViewOffset(width, height, 0, Math.abs(shift) * height * 0.6, width, height);
    camera.updateProjectionMatrix();

    // Lage der Erdscheibe auf dem Bildschirm (für die Texte, die hinter ihr hervorkommen)
    camera.updateMatrixWorld();
    center.set(0, 0, 0).project(camera);
    journey.screen.x = (center.x * 0.5 + 0.5) * width;
    journey.screen.y = (-center.y * 0.5 + 0.5) * height;
    journey.screen.r = (Math.tan(Math.asin(1 / distance)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (height / 2);
  });

  return null;
}
