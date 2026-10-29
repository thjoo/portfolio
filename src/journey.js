import { createContext, useContext, useRef } from "react";
import * as THREE from "three";

// Die Reise durch das Schuljahr: ein Stadium pro Abschnitt der Seite. Beim Scrollen wird zwischen den
// Stadien weich übergeblendet (Ansicht, Zoom, Farben, Eis, Sonne, sichtbare Objekte).
//
// view: Ort, der zur Kamera zeigt [Breite, Länge]. Die Erde dreht beim Scrollen nur vorwärts (West -> Ost wie
// in echt): jedes Stadium liegt mindestens 35° weiter westlich als das vorige, notfalls eine Runde mehr; zoom: Abstand im Verhältnis zur ganzen Erde (1 = passt
// ganz ins Bild); shift: Erde seitlich verschieben, damit links Platz für den Text bleibt (Anteil Breite);
// palette: Farben der Erde und des Hintergrunds (null = Grundfarben aus den Reglern);
// ice: [Arktis, Antarktis] 0 Sommer … 1 Winter; sun: [Winkel (°), Höhe] der Sonne;
// focus: Objekte, die hervorgehoben sind; others: Grösse aller übrigen (0 = ausgeblendet)

const SPRING = {
  oceanDay: "#3f8f98",
  oceanNight: "#1f4656",
  landDay: "#8ccb7c",
  landNight: "#1c3829",
  ice: "#e8f6ec",
  seaIce: "#acd9c6",
  highlight: "#a6e6cc",
  background: "#2d6656",
  wash: "#3f8a6c",
  cloud: "#eaf6e4",
  cloudMix: 0.55,
};
const SUMMER = {
  oceanDay: "#2f88a8",
  oceanNight: "#253f5e",
  landDay: "#e6b35e",
  landNight: "#4a2b24",
  ice: "#fff1d8",
  seaIce: "#f0d3aa",
  highlight: "#ffd79c",
  background: "#a84e3c",
  wash: "#cc6e4a",
  cloud: "#ffd7c2",
  cloudMix: 0.6,
};
const AUTUMN = {
  oceanDay: "#4b6a88",
  oceanNight: "#2a2e48",
  landDay: "#cf7a3e",
  landNight: "#3a2119",
  ice: "#f2e3cd",
  seaIce: "#c9b39a",
  highlight: "#efb272",
  background: "#683426",
  wash: "#8a4b2f",
  cloud: "#f3d6b8",
  cloudMix: 0.5,
};
const WINTER = {
  oceanDay: "#3f6fae",
  oceanNight: "#1c2a50",
  landDay: "#7f97c4",
  landNight: "#26324e",
  ice: "#ffffff",
  seaIce: "#d0e1f6",
  highlight: "#d6e8ff",
  background: "#1f3358",
  wash: "#2f4c7a",
  cloud: "#eef4ff",
  cloudMix: 0.6,
};

export const STAGES = [
  {
    id: "intro",
    view: [22, -10],
    zoom: 1,
    shift: 0,
    palette: null,
    ice: [0, 1],
    sun: [-72, 0.25],
    focus: ["balloonClassic", "balloonOnion", "shipContainer", "clouds"],
    others: 0,
  },
  {
    // Wie der Anfang, aber die Erde rückt zur Seite und der Text kommt hinter ihr hervor
    id: "untergymnasium",
    view: [22, -48],
    zoom: 0.92,
    shift: 0.2,
    palette: null,
    ice: [0, 1],
    sun: [-72, 0.25],
    focus: ["balloonClassic", "balloonOnion", "shipContainer", "clouds"],
    others: 0,
  },
  {
    id: "spring",
    view: [26, -84],
    zoom: 0.72,
    shift: 0.27,
    palette: SPRING,
    ice: [0.45, 0.55],
    sun: [-55, 0.05],
    focus: ["rocket", "clouds", "planeZurich"],
    others: 0.7,
  },
  {
    id: "summer",
    view: [37, 14],
    zoom: 0.6,
    shift: 0.29,
    palette: SUMMER,
    ice: [0, 1],
    sun: [-45, 0.45],
    focus: ["volcano", "clouds", "planeLondon"],
    others: 0.7,
  },
  {
    id: "autumn",
    view: [28, -30],
    zoom: 0.95,
    shift: 0.2,
    palette: AUTUMN,
    ice: [0.55, 0.45],
    sun: [-70, 0.05],
    focus: ["balloonClassic", "balloonOnion", "weatherBalloon", "zeppelin", "clouds"],
    others: 0.7,
  },
  {
    id: "winter",
    view: [-42, -66],
    zoom: 0.76,
    shift: 0.27,
    palette: WINTER,
    ice: [1, 0.15],
    sun: [-60, -0.35],
    focus: ["shipResearch", "meteor", "satellite"],
    others: 0.7,
  },
  {
    id: "about",
    view: [18, -104],
    zoom: 1.15,
    shift: 0.16,
    palette: null,
    ice: [0, 1],
    sun: [-72, 0.25],
    focus: ["balloonClassic", "balloonOnion", "clouds", "zeppelin"],
    others: 0.6,
  },
];

// Höhe eines Abschnitts in vh: je Stadium so viel Scrollweg (davon ein Teil Ruhe auf demselben Ausschnitt)
export const SECTION_VH = 170;
// Anteil des Scrollwegs am Anfang und Ende jedes Abschnitts, auf dem die Ansicht stehen bleibt
const HOLD = 0.28;

// Gemeinsamer Zustand der Reise (wird von <Journey> jedes Bild aktualisiert)
export const journey = {
  raw: 0, // Scroll-Position in Stadien (0 … 5), gedämpft
  stage: 0, // mit Ruhezonen: bleibt bei ganzen Zahlen eine Weile stehen
  screen: { x: 0, y: 0, r: 0 }, // Erde auf dem Bildschirm (Mitte und Radius in CSS-Pixeln)
  arrival: { index: 0, count: 0 }, // zuletzt erreichtes Stadium; count zählt jedes Ankommen
};

export function dwell(raw) {
  const i = Math.floor(raw);
  const f = raw - i;
  return i + THREE.MathUtils.smoothstep(f, HOLD, 1 - HOLD);
}

// Aktuelle zwei Stadien und Mischanteil
export function blend() {
  const i = Math.min(Math.floor(journey.stage), STAGES.length - 2);
  return [STAGES[i], STAGES[i + 1], journey.stage - i];
}

// 1 genau im Stadium, 0 ab einem ganzen Stadium Abstand
export function stageWeight(index) {
  return Math.max(0, 1 - Math.abs(journey.stage - index));
}

function weightIn(stage, id) {
  return stage.focus.includes(id) ? 1 : stage.others;
}

// Grösse/Sichtbarkeit eines Objekts im aktuellen Moment der Reise (0 … 1)
export function presenceOf(id) {
  const [a, b, f] = blend();
  return THREE.MathUtils.lerp(weightIn(a, id), weightIn(b, id), f);
}

// Farbe aus den Paletten der beiden Stadien mischen; null-Palette = Grundfarbe aus den Reglern
const colorA = new THREE.Color();
const colorB = new THREE.Color();
export function blendColor(target, key, base) {
  const [a, b, f] = blend();
  colorA.set(a.palette?.[key] ?? base);
  colorB.set(b.palette?.[key] ?? base);
  return target.copy(colorA).lerp(colorB, f);
}

// Zahl aus den Paletten mischen (fehlt sie oder ist die Palette null: base)
export function blendNumber(key, base) {
  const [a, b, f] = blend();
  const va = a.palette?.[key] ?? base;
  const vb = b.palette?.[key] ?? base;
  return THREE.MathUtils.lerp(va, vb, f);
}

// Objekte melden sich mit ihrer Kennung an: <Presence id="rocket"><Rocket /></Presence>
const PresenceContext = createContext(null);
export const Presence = PresenceContext.Provider;
export function usePresence() {
  const id = useContext(PresenceContext);
  return () => (id ? presenceOf(id) : 1);
}

// Ankommen in einem Stadium (z. B. Rakete starten): liefert true genau einmal pro Ankunft
export function useArrival(index) {
  const seen = useRef(-1);
  return () => {
    const a = journey.arrival;
    if (a.index === index && a.count !== seen.current) {
      seen.current = a.count;
      return true;
    }
    return false;
  };
}
