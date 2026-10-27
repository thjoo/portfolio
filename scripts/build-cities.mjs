// Erzeugt src/data/cities.json aus GeoNames (Paket all-the-cities).
// Format: flaches Array [lon, lat, einwohner/1000, ...], nur Städte ab MIN_POPULATION.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const MIN_POPULATION = 20000;
const cities = createRequire(import.meta.url)("all-the-cities");

const flat = [];
for (const city of cities) {
  if (city.population < MIN_POPULATION) continue;
  const [lon, lat] = city.loc.coordinates;
  flat.push(Math.round(lon * 100) / 100, Math.round(lat * 100) / 100, Math.round(city.population / 1000));
}

writeFileSync(new URL("../src/data/cities.json", import.meta.url), JSON.stringify(flat));
console.log(`${flat.length / 3} Städte geschrieben`);
