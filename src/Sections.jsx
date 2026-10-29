import { useEffect, useRef, useState } from "react";
import { SECTION_VH, STAGES, journey } from "./journey.js";

// Texte der Reise, einer pro Stadium (ab Stadium 1; am Anfang nur die Erde). Inhalte folgen später.
// Jahreszeiten stehen bewusst nicht im Text: sie sollen sich an der Erde selbst zeigen.
const CARDS = [
  { stage: 1, kicker: "Untergymnasium", title: "1.–2. Klasse", text: "Themen und Skripte folgen.", accent: "#9fa8ff", symbol: "◐" },
  { stage: 2, kicker: "Gymnasium", title: "3. Klasse", text: "Themen und Skripte folgen.", accent: "#a6e6b4", symbol: "✿" },
  { stage: 3, kicker: "Gymnasium", title: "4. Klasse", text: "Themen und Skripte folgen.", accent: "#ffcf8a", symbol: "☀" },
  { stage: 4, kicker: "Sonderwoche", title: "5. Klasse", text: "Inhalte zur Sonderwoche folgen.", accent: "#f0a56a", symbol: "❦" },
  { stage: 5, kicker: "Gymnasium", title: "6. Klasse", text: "Themen und Skripte folgen.", accent: "#cfe2ff", symbol: "❄" },
  { stage: 6, kicker: "Über mich", title: "Kontakt", text: "Text über mich und Kontaktangaben folgen.", accent: "#9fa8ff", symbol: "✉" },
];

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

function sectionHeight() {
  return (window.innerHeight * SECTION_VH) / 100;
}

export default function Sections() {
  const layers = useRef([]);
  const cards = useRef([]);
  const nav = useRef();
  const cue = useRef();
  const [active, setActive] = useState(0);

  // Jedes Bild: Karten nach dem Stand der Reise bewegen. Ausserhalb ihres Stadiums liegt eine Karte
  // hinter der Erde (dort ausgeblendet); kommt man an, schiebt sie sich zur Seite hervor.
  useEffect(() => {
    let frame;
    const tick = () => {
      const { x, y, r } = journey.screen;
      cards.current.forEach((card, i) => {
        const layer = layers.current[i];
        if (!card || !layer) return;
        const d = Math.abs(journey.stage - CARDS[i].stage);
        const out = smoothstep(0.08, 0.5, d); // 0 = an ihrem Platz, 1 = hinter der Erde
        const visible = out < 0.999;
        layer.style.visibility = visible ? "visible" : "hidden";
        if (!visible) return;
        // Weg vom Platz der Karte zur Erdmitte
        const box = card.getBoundingClientRect();
        const cx = box.left - (parseFloat(card.dataset.tx) || 0) + box.width / 2;
        const cy = box.top - (parseFloat(card.dataset.ty) || 0) + box.height / 2;
        const tx = (x - cx) * out;
        const ty = (y - cy) * out;
        card.dataset.tx = tx;
        card.dataset.ty = ty;
        card.style.transform = `translate(${tx}px, ${ty}px) scale(${1 - 0.25 * out})`;
        card.style.opacity = String(1 - smoothstep(0.6, 1, out));
        // Teil der Karte hinter der Erdscheibe verdecken; ist die Karte ganz draussen, gibt die Erde sie frei
        const radius = r * smoothstep(0, 0.35, out);
        const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${radius}px, #000 ${radius + 1.5}px)`;
        layer.style.maskImage = mask;
        layer.style.webkitMaskImage = mask;
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
          <div key={card.stage} className="card-layer" ref={(el) => (layers.current[i] = el)}>
            <article
              className="card"
              ref={(el) => (cards.current[i] = el)}
              style={{ "--accent": card.accent }}
              aria-hidden={active !== i}
            >
              <p className="card-kicker">{card.kicker}</p>
              <h2 className="card-title">{card.title}</h2>
              <p className="card-text">{card.text}</p>
            </article>
          </div>
        ))}
      </div>
      <button type="button" className="scroll-cue" ref={cue} onClick={() => go(1)} aria-label="Nach unten scrollen">
        <svg viewBox="0 0 24 36" width="22" height="33" aria-hidden="true">
          <rect x="1.5" y="1.5" width="21" height="33" rx="10.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle className="scroll-cue-dot" cx="12" cy="10" r="2.4" fill="currentColor" />
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
