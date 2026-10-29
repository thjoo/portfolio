import { useEffect, useState } from "react";
import { SECTION_VH } from "./journey.js";

// Abschnitte der Reise, einer pro Stadium. Inhalte (Themen, Skripte) folgen später.
const SECTIONS = [
  {
    id: "untergymnasium",
    season: "Ruhe",
    kicker: "1.–2. Klasse · Untergymnasium",
    title: "Die Erde kennenlernen",
    text: "Themen und Skripte des Untergymnasiums folgen.",
    accent: "#9fa8ff",
    symbol: "◐",
  },
  {
    id: "fruehling",
    season: "Frühling",
    kicker: "3. Klasse",
    title: "Frühling",
    text: "Themen und Skripte der 3. Klasse folgen.",
    accent: "#a6e6b4",
    symbol: "✿",
  },
  {
    id: "sommer",
    season: "Sommer",
    kicker: "4. Klasse",
    title: "Sommer",
    text: "Themen und Skripte der 4. Klasse folgen.",
    accent: "#ffcf8a",
    symbol: "☀",
  },
  {
    id: "herbst",
    season: "Herbst",
    kicker: "5. Klasse · Sonderwoche",
    title: "Herbst",
    text: "Inhalte zur Sonderwoche folgen.",
    accent: "#f0a56a",
    symbol: "❦",
  },
  {
    id: "winter",
    season: "Winter",
    kicker: "6. Klasse",
    title: "Winter",
    text: "Themen und Skripte der 6. Klasse folgen.",
    accent: "#cfe2ff",
    symbol: "❄",
  },
  {
    id: "ueber-mich",
    season: "Über mich",
    kicker: "Über mich",
    title: "Kontakt",
    text: "Text über mich und Kontaktangaben folgen.",
    accent: "#9fa8ff",
    symbol: "✉",
  },
];

function sectionHeight() {
  return (window.innerHeight * SECTION_VH) / 100;
}

export default function Sections() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const read = () => setActive(Math.min(Math.round(window.scrollY / sectionHeight()), SECTIONS.length - 1));
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  const go = (i) => window.scrollTo({ top: i * sectionHeight(), behavior: "smooth" });

  return (
    <>
      <main className="journey">
        {SECTIONS.map((section, i) => (
          <section
            key={section.id}
            id={section.id}
            className={`journey-section${i === 0 ? " is-first" : ""}${i === SECTIONS.length - 1 ? " is-last" : ""}`}
            style={{ "--accent": section.accent }}
          >
            {i === 0 && (
              <header className="hero">
                <p className="hero-kicker">Geografie</p>
                <h1 className="hero-title">Eine Reise durch das Schuljahr</h1>
                <p className="hero-hint">Scrollen, um zu reisen · Ziehen, um die Erde zu drehen</p>
              </header>
            )}
            <article className="card">
              <p className="card-kicker">{section.kicker}</p>
              <h2 className="card-title">{section.title}</h2>
              <p className="card-text">{section.text}</p>
            </article>
          </section>
        ))}
      </main>
      <nav className="seasons" aria-label="Stadien">
        {SECTIONS.map((section, i) => (
          <button
            key={section.id}
            type="button"
            className={`season${i === active ? " is-active" : ""}`}
            style={{ "--accent": section.accent }}
            onClick={() => go(i)}
            aria-label={section.season}
            aria-current={i === active ? "step" : undefined}
          >
            <span className="season-symbol" aria-hidden="true">
              {section.symbol}
            </span>
            <span className="season-label">{section.season}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
