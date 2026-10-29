import { useEffect, useRef, useState } from "react";
import { SECTION_VH, STAGES, journey } from "./journey.js";

// Texte der Reise, einer pro Stadium (ab Stadium 1; am Anfang nur die Erde).
// Kurze Zusammenfassungen der Einheiten nach Hub/01_KKN (READMEs der Stufen), im Stil der eigenen Schreibregeln.
// Jahreszeiten stehen bewusst nicht im Text: sie sollen sich an der Erde selbst zeigen.
const CARDS = [
  { stage: 1, title: "1.–2. Klasse", lines: ["1.–2.", "KLASSE"], text: "Wo auf der Erde bin ich eigentlich und woher weiss ich das? Wir starten mit Karten, Kontinenten und dem Gradnetz und schauen, weshalb es im Dezember früher dunkel wird. In der 2. Klasse reisen wir durch die Klimazonen von den Tropen bis in die Kälte. Unterwegs machen wir Halt in Europa und fragen, wie die EU funktioniert, warum Menschen ihre Heimat verlassen, woher unsere Energie kommt und was der Klimawandel mit all dem zu tun hat.", accent: "#9fa8ff", symbol: "◐" },
  { stage: 2, title: "3. Klasse", lines: ["3.KL", "ASSE"], text: "Die Erde in Bewegung: von innen Platten, Vulkane und Erdbeben, von aussen Verwitterung, Flüsse und Gletscher. Am Gneis aus dem Gotthard sieht man, wie tief ein Gestein einmal lag. Am Schluss stehen die Rohstoffe, die aus beidem entstehen, und die Karten, mit denen wir das alles darstellen.", accent: "#a6e6b4", symbol: "✿" },
  { stage: 3, title: "4. Klasse", lines: ["4.KL", "ASSE"], text: "Warum regnet es, und warum gibt es überhaupt Klimazonen? Mit Experimenten und Wetterkarten bauen wir Schritt für Schritt ein Bild des Klimasystems und kommen so zum Klimawandel. Danach Stadtgeografie und Raumplanung: wie Städte wachsen und wer darüber entscheidet.", accent: "#ffcf8a", symbol: "☀" },
  { stage: 4, title: "5. Klasse", lines: ["5.KL", "ASSE"], text: "In der 5. Klasse gibt es keinen Geografieunterricht, dafür die Sonderwoche «Städte der Zukunft»: Wie wollen wir in dreissig Jahren wohnen, und wie viel davon lässt sich heute schon planen?", accent: "#f0a56a", symbol: "❦" },
  { stage: 5, title: "6. Klasse", lines: ["6.KL", "ASSE"], text: "In der Maturaklasse geht es um Menschen: wie Bevölkerungen wachsen und altern, warum Wohlstand so ungleich verteilt ist und was Entwicklungszusammenarbeit bewirken kann. Am Beispiel Bolivien wird das konkret. Am Ende steht die Maturaprüfung.", accent: "#cfe2ff", symbol: "❄" },
  { stage: 6, title: "Kontakt", lines: ["KON", "TAKT"], size: 0.4, text: "Text über mich und Kontaktangaben folgen.", accent: "#9fa8ff", symbol: "✉" },
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
  // (Erdscheibe ausgeblendet, wie ein Bild mit Tiefe); ausserhalb seines Stadiums steckt er ganz hinter
  // ihr und schiebt sich beim Ankommen zur Seite hervor. Der Text unten links blendet dazu ein.
  useEffect(() => {
    let frame;
    const tick = () => {
      const { x, y, r } = journey.screen;
      const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 1.5}px)`;
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
        layer.style.maskImage = mask;
        layer.style.webkitMaskImage = mask;
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
      <div className="cards">
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
            <span className="season-symbol" aria-hidden="true">
              {card.symbol}
            </span>
            <span className="season-label">{card.title}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
