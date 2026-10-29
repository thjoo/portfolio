import { useEffect, useRef, useState } from "react";
import { SECTION_VH, STAGES, journey } from "./journey.js";

// Texte der Reise, einer pro Stadium (ab Stadium 1; am Anfang nur die Erde).
// Kurze Zusammenfassungen der Einheiten nach Hub/01_KKN (READMEs der Stufen), im Stil der eigenen Schreibregeln.
// Jahreszeiten stehen bewusst nicht im Text: sie sollen sich an der Erde selbst zeigen.
const CARDS = [
  { stage: 1, title: "1.–2. Klasse", lines: ["1.–2.", "KLASSE"], text: "Wo auf der Erde bin ich eigentlich und woher weiss ich das? Wir starten mit Karten, Kontinenten und dem Gradnetz und schauen, weshalb es im Dezember früher dunkel wird. In der 2. Klasse reisen wir durch die Klimazonen von den Tropen bis in die Kälte. Unterwegs machen wir Halt in Europa und fragen, wie die EU funktioniert, warum Menschen ihre Heimat verlassen, woher unsere Energie kommt und was der Klimawandel mit all dem zu tun hat.", accent: "#9fa8ff", icon: "earth" },
  { stage: 2, title: "3. Klasse", lines: ["3.KL", "ASSE"], text: "Warum findet man in den Alpen Muscheln, die einmal am Meeresboden lagen? Und was haben Berge mit meinem Handy zu tun? In der 3. Klasse kommen neue Klassen zusammen und die Schüler:innen fragen zuerst, was Geografie überhaupt ist. Dann geht es um die Erde in Bewegung: von innen mit Plattentektonik und Vulkanen, von aussen mit Flüssen und Gletschern. Aus diesen Kräften entstehen auch die Rohstoffe. Die Schüler:innen verfolgen den Weg eines Rohstoffs von der Mine bis in die Schweiz und fragen, unter welchen Bedingungen er abgebaut wird und wer davon profitiert.", accent: "#a6e6b4", icon: "flower" },
  { stage: 3, title: "4. Klasse", lines: ["4.KL", "ASSE"], text: "Warum regnet es im Tessin oft heftiger als in Zürich? Und wieso liegen die grossen Wüsten fast alle auf derselben Breite? In der 4. Klasse bauen die Schüler:innen Schritt für Schritt ein Bild des Klimasystems. Experimente und Wetterkarten liefern die Bausteine, an einer Rätselwand sammeln sich die offenen Fragen, bis klar wird, wie die Klimazonen entstehen. Den Klimawandel erarbeiten die Schüler:innen danach selbstständig. Zum Schluss geht es in die Stadt und um die Frage, wer eigentlich entscheidet, wo gebaut wird.", accent: "#ffcf8a", icon: "sun" },
  { stage: 4, title: "5. Klasse", lines: ["5.KL", "ASSE"], text: "Wie soll Zürich im Jahr 2050 aussehen und wer darf das mitbestimmen? In der 5. Klasse gibt es keinen Geografieunterricht, dafür die Sonderwoche «Städte der Zukunft». In Gruppen wählen die Schüler:innen ein Zürcher Quartier, lesen es aus offenen Daten und prüfen auf einer Exkursion, ob die Daten stimmen. Danach planen sie das Quartier in ArcGIS Urban neu. Jede Person vertritt dabei eine Rolle wie Klima oder Wohnraum und weil die Rollen Verschiedenes wollen, muss die Gruppe abwägen. Am Freitag stellen sie ihr Projekt vor.", accent: "#f0a56a", icon: "leaf" },
  { stage: 5, title: "6. Klasse", lines: ["6.KL", "ASSE"], text: "Warum bekommt eine Frau in Niger im Schnitt sechs Kinder und eine Frau in der Schweiz weniger als zwei? In der Maturaklasse geht es um Menschen. Die Schüler:innen untersuchen, wie Bevölkerungen wachsen und altern. In Halbklassen stellen sie dazu eigene Daten so dar, dass man sie auf einen Blick versteht. Danach folgt die Frage, warum der Wohlstand auf der Welt so ungleich verteilt ist und was Entwicklungszusammenarbeit daran ändern kann. Am Beispiel Bolivien wird das konkret. Am Ende steht die Maturaprüfung.", accent: "#cfe2ff", icon: "snow" },
  { stage: 6, title: "Kontakt", lines: ["KON", "TAKT"], size: 0.4, text: "Text über mich und Kontaktangaben folgen.", accent: "#9fa8ff", icon: "letter" },
];

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Feste „Zufalls“-Neigung und -Versatz je Buchstabe (gleich bei jedem Laden), wie lose hingeworfen
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const tilt = (n) => ((hash(n) - 0.5) * 30).toFixed(1); // Grad
const lift = (n) => ((hash(n + 19) - 0.5) * 0.14).toFixed(3); // em

// Kleine Symbole wie mit Wasserfarbe gemalt: einfache Formen, darüber der Filter «aquarell»
// (wackeliger Rand, dunklerer Pigmentrand, Papierkorn). Definiert einmal in <WatercolorFilter />
const ICONS = {
  earth: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path className="icon-deep" d="M7.5 9.5c1.6-1.8 3.8-1.4 4.6.2.7 1.4-.6 2.6-1.9 2.5-1.4-.1-1.8 1.4-.8 2.6.8 1-.2 2.4-1.6 1.6-1.6-.9-2.4-4.6-.3-6.9zM14.8 13.6c1.1-.4 2.6.3 2.4 1.6-.2 1.2-1.6 2-2.5 1.4-.8-.6-.9-2.6.1-3z" />
    </>
  ),
  flower: (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="12" cy="6.8" rx="3" ry="4.4" transform={`rotate(${a} 12 12)`} />
      ))}
      <circle className="icon-deep" cx="12" cy="12" r="2.6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} className="icon-stroke" d="M12 2.6v3.2" transform={`rotate(${a} 12 12)`} />
      ))}
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c-1-6.5 3.2-12.6 14.2-14.2C19.4 13 13.6 19.6 5 19z" />
      <path className="icon-stroke icon-deep-stroke" d="M5.5 18.5c3.5-4 6.8-7.2 10.8-10.6" />
    </>
  ),
  snow: (
    <>
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a} 12 12)`}>
          <path className="icon-stroke" d="M12 3v18M9.6 5.4 12 7.6l2.4-2.2M9.6 18.6 12 16.4l2.4 2.2" />
        </g>
      ))}
    </>
  ),
  letter: (
    <>
      <path d="M3.5 7.2h17v10.6h-17z" />
      <path className="icon-stroke icon-deep-stroke" d="M3.8 7.5 12 13.2l8.2-5.7" />
    </>
  ),
};

function PaintedIcon({ kind, color }) {
  return (
    <svg className="season-icon" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" style={{ "--paint": color }}>
      <g filter="url(#aquarell)">{ICONS[kind]}</g>
    </svg>
  );
}

// SVG-Filter für die gemalten Symbole: Rand mit Rauschen verschieben, leicht verlaufen lassen,
// Pigment am Rand dunkler (Rand minus geschrumpfte Form), Korn aus feinem Rauschen
function WatercolorFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id="aquarell" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4" result="wobble" />
        <feDisplacementMap in="SourceGraphic" in2="wobble" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="shape" />
        <feGaussianBlur in="shape" stdDeviation="0.35" result="soft" />
        <feMorphology in="soft" operator="erode" radius="0.7" result="inner" />
        <feComposite in="soft" in2="inner" operator="out" result="rim" />
        <feColorMatrix in="rim" type="matrix" values="0.55 0 0 0 0  0 0.5 0 0 0  0 0 0.7 0 0  0 0 0 0.75 0" result="rimDark" />
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="9" result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -0.6 1.15" result="grainMask" />
        <feComposite in="soft" in2="grainMask" operator="in" result="grained" />
        <feMerge>
          <feMergeNode in="grained" />
          <feMergeNode in="rimDark" />
        </feMerge>
      </filter>
    </svg>
  );
}

function sectionHeight() {
  return (window.innerHeight * SECTION_VH) / 100;
}

export default function Sections() {
  const layers = useRef([]);
  const cards = useRef([]);
  const nav = useRef();
  const cue = useRef();
  const texts = useRef([]);
  const [active, setActive] = useState(0);

  // Jedes Bild: Titel und Text nach dem Stand der Reise bewegen. Der Titel liegt immer hinter der Erde
  // (eigene Ebene unter der Erde, wie ein Bild mit Tiefe); ausserhalb seines Stadiums steckt er ganz hinter
  // ihr und schiebt sich beim Ankommen zur Seite hervor. Der Text unten links blendet dazu ein.
  useEffect(() => {
    let frame;
    const tick = () => {
      const { x, y, r } = journey.screen;
      cards.current.forEach((title, i) => {
        const layer = layers.current[i];
        const text = texts.current[i];
        if (!title || !layer || !text) return;
        const d = Math.abs(journey.stage - CARDS[i].stage);
        const out = smoothstep(0.08, 0.5, d); // 0 = an seinem Platz, 1 = hinter der Erde
        const visible = out < 0.999;
        layer.style.visibility = visible ? "visible" : "hidden";
        text.style.visibility = visible ? "visible" : "hidden";
        if (!visible) return;
        // Titel hängt an der Erde: sein rechtes Ende liegt ein Stück hinter der Erdscheibe, in der Höhe
        // etwa auf der oberen Erdhälfte -> die Erde schiebt sich davor. Grösse passt in den Platz links
        // daneben (offsetWidth/Height ohne Transform; nur bei spürbarer Änderung neu setzen)
        const margin = window.innerWidth * 0.03;
        const tuck = x - r * 0.8; // so weit reicht der Titel hinter die Erde
        const current = parseFloat(title.style.fontSize) || parseFloat(getComputedStyle(title).fontSize);
        const max = Math.min(window.innerHeight * (CARDS[i].size ?? 0.26), 420);
        const wanted = Math.max(Math.min((current * (tuck - margin)) / Math.max(title.offsetWidth, 1), max), 40);
        if (Math.abs(wanted - current) > 0.5) title.style.fontSize = `${wanted}px`;
        const left = Math.max(tuck - title.offsetWidth, margin);
        const top = Math.max(y - r * 0.55 - title.offsetHeight * 0.5, window.innerHeight * 0.03);
        title.style.left = `${left}px`;
        title.style.top = `${top}px`;
        // Weg vom Platz des Titels zur Erdmitte
        const box = title.getBoundingClientRect();
        const cx = box.left - (parseFloat(title.dataset.tx) || 0) + box.width / 2;
        const cy = box.top - (parseFloat(title.dataset.ty) || 0) + box.height / 2;
        const tx = (x - cx) * out;
        const ty = (y - cy) * out;
        title.dataset.tx = tx;
        title.dataset.ty = ty;
        title.style.transform = `translate(${tx}px, ${ty}px) scale(${1 - 0.3 * out})`;
        // Buchstaben purzeln beim Hervorkommen stärker und setzen sich dann
        title.style.setProperty("--scatter", out.toFixed(3));
        title.style.opacity = String(1 - smoothstep(0.6, 1, out));
        // Text: kommt etwas später und von unten
        const t = smoothstep(0.05, 0.35, out);
        text.style.opacity = String(1 - t);
        text.style.transform = `translateY(${t * 24}px)`;
      });
      // Leiste erst einblenden, wenn die Reise beginnt
      if (nav.current) nav.current.style.opacity = String(smoothstep(0.15, 0.6, journey.stage));
      // Hinweis zum Scrollen nur am Anfang
      if (cue.current) {
        // nach dem tatsächlichen Scrollweg (nicht nach dem Stadium, das am Anfang eine Weile ruht)
        const show = 1 - smoothstep(0.02, 0.15, journey.raw);
        cue.current.style.opacity = String(show);
        cue.current.style.visibility = show > 0.01 ? "visible" : "hidden";
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const read = () => {
      const stage = Math.round(window.scrollY / sectionHeight());
      const index = CARDS.findIndex((card) => card.stage === stage);
      setActive(index);
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  const go = (stage) => window.scrollTo({ top: stage * sectionHeight(), behavior: "smooth" });

  return (
    <>
      {/* Platzhalter für den Scrollweg: ein Abschnitt pro Stadium, der letzte nur bildschirmhoch */}
      <div className="journey-track" style={{ height: `${(STAGES.length - 1) * SECTION_VH + 100}vh` }} aria-hidden="true" />
      {/* Titel liegen zwischen Hintergrund und Erde (siehe Ebenen in App.jsx) */}
      <div className="titles">
        {CARDS.map((card, i) => (
          <div key={card.stage} className="title-layer" ref={(el) => (layers.current[i] = el)} aria-hidden={active !== i}>
            <h2
              className="page-title"
              ref={(el) => (cards.current[i] = el)}
              style={{ "--accent": card.accent }}
              aria-label={card.title}
            >
              {card.lines.map((line, l) => (
                <span key={l} className="page-title-line" aria-hidden="true">
                  {[...line].map((letter, k) => {
                    const n = card.stage * 31 + l * 7 + k;
                    return (
                      <span
                        key={k}
                        className={`page-title-letter${letter === "." ? " is-dot" : ""}`}
                        style={{ "--r": tilt(n), "--y": lift(n) }}
                      >
                        {letter}
                      </span>
                    );
                  })}
                </span>
              ))}
            </h2>
          </div>
        ))}
      </div>
      <div className="cards">
        {CARDS.map((card, i) => (
          <p
            key={card.stage}
            className="page-text"
            ref={(el) => (texts.current[i] = el)}
            style={{ "--accent": card.accent }}
            aria-hidden={active !== i}
          >
            {card.text}
          </p>
        ))}
      </div>
      <button type="button" className="scroll-cue" ref={cue} onClick={() => go(1)} aria-label="Nach unten scrollen">
        <span className="scroll-cue-text" aria-hidden="true">
          <span>nach unten</span>
          <span>scrollen</span>
        </span>
        <svg className="scroll-cue-arrow" viewBox="0 0 12 22" width="12" height="22" aria-hidden="true">
          <path d="M6 1 C5.6 7 6.4 13 6 20 M1.5 15.5 C3.5 17 5 18.6 6 20.5 C7 18.6 8.5 17 10.5 15.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <WatercolorFilter />
      <nav className="seasons" aria-label="Stadien" ref={nav}>
        {CARDS.map((card, i) => (
          <button
            key={card.stage}
            type="button"
            className={`season${i === active ? " is-active" : ""}`}
            style={{ "--accent": card.accent }}
            onClick={() => go(card.stage)}
            aria-label={card.title}
            aria-current={i === active ? "step" : undefined}
          >
            <PaintedIcon kind={card.icon} color={card.accent} />
            <span className="season-label">{card.title}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
