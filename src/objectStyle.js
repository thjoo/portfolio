import { useControls } from "leva";

// Gemeinsamer Malstil aller Objekte (Ballone, Schiffe …): ein Satz Regler für alle
export function useObjectStyle() {
  return useControls(
    "Objekte Stil",
    {
      scale: { value: 0.7, min: 0.3, max: 1.5, label: "Grösse alle" },
      shade: { value: 0.4, min: 0, max: 0.8, label: "Schattierung" },
      pigment: { value: 0.3, min: 0, max: 0.6, label: "Pigment-Wolken" },
      edge: { value: 0.55, min: 0, max: 1, label: "Pigmentrand" },
      bleed: { value: 0.22, min: 0.02, max: 0.5, label: "Streifen verlaufen" },
      granulation: { value: 0.06, min: 0, max: 0.2, label: "Körnung" },
      boxEdges: { value: 1, min: 0, max: 1.5, label: "Kanten betonen" },
      outlineWobble: { value: 0.025, min: 0, max: 0.08, label: "Umriss wackelig" },
      swingAmount: { value: 7, min: 0, max: 25, label: "Pendeln (°)" },
      swingSpeed: { value: 1, min: 0.1, max: 3, label: "Pendeln Tempo" },
      orbitSpeed: { value: 0.01, min: 0, max: 0.2, label: "Umkreisen" },
    },
    { collapsed: true }
  );
}
