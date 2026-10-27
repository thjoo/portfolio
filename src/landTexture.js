import * as THREE from "three";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land50 from "world-atlas/land-50m.json";
import cities from "./data/cities.json";

// Landmaske als equirectangulare Textur (2:1), passt direkt auf SphereGeometry-UVs.
// R = Küste leicht weich (für die wackelige Küstenlinie im Shader)
// G = stark weichgezeichnet (für den dunklen Pigmentrand)
// B = Stadtlichter aus echten Städten (GeoNames, ab 20'000 Einwohnern)
// A = Eis: 0.5 an der Winterkante, 0.92 an der Sommerkante des Meereises (für die Jahreszeiten-Regler)
export function createLandTexture(width = 4096) {
  const height = width / 2;
  const land = feature(land50, land50.objects.land);
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2]);

  const drawMask = (blur) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    geoPath(projection, ctx)(land);
    ctx.fill();
    return ctx.getImageData(0, 0, width, height).data;
  };

  const sharp = drawMask(width / 1400);
  const soft = drawMask(width / 180);

  const lights = drawCityLights(width, height);
  const ice = computeIce(width, height, sharp);

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = sharp[i];
    data[i + 1] = soft[i];
    data[i + 2] = lights[i];
    data[i + 3] = ice[i / 4];
  }

  const texture = new THREE.DataTexture(data, width, height);
  texture.flipY = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

// Kleiner deterministischer Zufallsgenerator, damit die Lichter bei jedem Laden gleich liegen
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Um jede Stadt Punkte streuen: grosse Städte = viele Punkte, breiter gestreut.
// Kleine Städte ergeben einzelne Punkte, leere Gegenden bleiben dunkel.
function drawCityLights(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  const random = mulberry32(42);
  const gaussian = () => Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());
  const pxPerKm = width / 40075;
  const dotRadius = width / 5200;

  for (let i = 0; i < cities.length; i += 3) {
    const lon = cities[i];
    const lat = cities[i + 1];
    const population = cities[i + 2] * 1000;
    const size = population / 20000;

    const dots = Math.max(1, Math.round(Math.pow(size, 0.55)));
    const spreadKm = 6 + 9 * Math.pow(size, 0.42);
    // In der equirectangularen Karte werden Breitengrade gegen die Pole gestreckt
    const stretch = 1 / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);

    const cx = ((lon + 180) / 360) * width;
    const cy = ((90 - lat) / 180) * height;

    for (let d = 0; d < dots; d++) {
      const spread = d === 0 ? 0 : spreadKm * pxPerKm;
      const x = cx + gaussian() * spread * stretch;
      const y = cy + gaussian() * spread;
      const brightness = 0.45 + 0.55 * random();
      const r = dotRadius * (0.7 + 0.6 * random());
      ctx.fillStyle = `rgba(255,255,255,${brightness})`;
      ctx.beginPath();
      ctx.ellipse(((x % width) + width) % width, y, r * stretch, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return ctx.getImageData(0, 0, width, height).data;
}

// Ungefähre Kanten des Meereises, [Länge, Breite]. Quellen: NSIDC / NASA Earth Observatory.
// Winter = Maximum (Arktis März, Antarktis September), Sommer = Minimum (Arktis September, Antarktis Februar).
// Bewusst vereinfacht, die Kante wird im Shader noch unregelmässig gemalt.
const ARCTIC_WINTER = [
  [-180, 60], [-170, 58], [-160, 57], [-150, 59], [-140, 70], [-120, 68], [-100, 52], [-80, 52],
  [-70, 55], [-60, 50], [-50, 55], [-45, 60], [-30, 65], [-20, 67], [-10, 72], [0, 75], [20, 76],
  [40, 70], [50, 68], [60, 66], [140, 62], [143, 46], [155, 47], [160, 56], [170, 60], [180, 60],
];
const ARCTIC_SUMMER = [
  [-180, 75], [-160, 74], [-140, 73], [-110, 72], [-90, 74], [-75, 77], [-65, 80], [-40, 81],
  [-20, 78], [0, 81], [20, 82], [60, 82], [90, 80], [120, 78], [140, 76], [160, 76], [180, 75],
];
const ANTARCTIC_WINTER = [
  [-180, -61], [-160, -63], [-130, -65], [-100, -66], [-80, -63], [-60, -60], [-45, -58],
  [-25, -56], [0, -55], [20, -55], [35, -57], [60, -60], [80, -62], [100, -63], [120, -63],
  [150, -64], [170, -62], [180, -61],
];
const ANTARCTIC_SUMMER = [
  [-180, -74], [-150, -73], [-120, -71], [-90, -70], [-70, -67], [-50, -63], [-30, -70],
  [0, -69], [30, -68], [60, -66], [90, -64], [120, -65], [150, -66], [180, -74],
];

function edgeAt(table, lon) {
  for (let i = 0; i < table.length - 1; i++) {
    const [lon0, lat0] = table[i];
    const [lon1, lat1] = table[i + 1];
    if (lon >= lon0 && lon <= lon1) return lat0 + ((lon - lon0) / (lon1 - lon0)) * (lat1 - lat0);
  }
  return table[0][1];
}

function isGreenland(lon, lat) {
  return (lat > 60 && lat < 75 && lon > -55 && lon < -15) || (lat >= 75 && lon > -70 && lon < -12);
}

// A-Kanal: 0.5 an der Winterkante, 0.92 an der Sommerkante (pro Längengrad).
// Der Regler im Shader schiebt die Schwelle dazwischen hin und her.
function computeIce(width, height, landData) {
  const ice = new Uint8Array(width * height);
  const SUMMER = 0.92;
  for (let x = 0; x < width; x++) {
    const lon = (x / width) * 360 - 180;
    const northWinter = edgeAt(ARCTIC_WINTER, lon);
    const northSummer = Math.max(edgeAt(ARCTIC_SUMMER, lon), northWinter + 1);
    const southWinter = edgeAt(ANTARCTIC_WINTER, lon);
    const southSummer = Math.min(edgeAt(ANTARCTIC_SUMMER, lon), southWinter - 1);
    for (let y = 0; y < height; y++) {
      const lat = 90 - (y / height) * 180;
      const i = y * width + x;
      const land = landData[i * 4] > 127;
      let value = 0;
      if (land) {
        // Landeis nur auf Grönland und der Antarktis
        if (isGreenland(lon, lat) || lat < -60) value = 1;
      } else if (lat > 0) {
        value = 0.5 + ((lat - northWinter) / (northSummer - northWinter)) * (SUMMER - 0.5);
      } else {
        value = 0.5 + ((southWinter - lat) / (southWinter - southSummer)) * (SUMMER - 0.5);
      }
      ice[i] = Math.round(Math.min(Math.max(value, 0), 1) * 255);
    }
  }
  return ice;
}
