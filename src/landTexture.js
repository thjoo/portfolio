import * as THREE from "three";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land50 from "world-atlas/land-50m.json";

// Landmaske als equirectangulare Textur (2:1), passt direkt auf SphereGeometry-UVs.
// R = Küste leicht weich (für die wackelige Küstenlinie im Shader)
// G = stark weichgezeichnet (für den dunklen Pigmentrand)
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

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = sharp[i];
    data[i + 1] = soft[i];
    data[i + 2] = 0;
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
