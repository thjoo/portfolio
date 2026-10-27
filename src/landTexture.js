import * as THREE from "three";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land50 from "world-atlas/land-50m.json";
import cities from "./data/cities.json";

// Landmaske als equirectangulare Textur (2:1), passt direkt auf SphereGeometry-UVs.
// R = Küste leicht weich (für die wackelige Küstenlinie im Shader)
// G = stark weichgezeichnet (für den dunklen Pigmentrand)
// B = Stadtlichter aus echten Städten (GeoNames, ab 20'000 Einwohnern)
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

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = sharp[i];
    data[i + 1] = soft[i];
    data[i + 2] = lights[i];
    data[i + 3] = 255;
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
  const dotRadius = width / 3000;

  for (let i = 0; i < cities.length; i += 3) {
    const lon = cities[i];
    const lat = cities[i + 1];
    const population = cities[i + 2] * 1000;
    const size = population / 20000;

    const dots = Math.max(1, Math.round(Math.pow(size, 0.6)));
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
