import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import { latLonToVector } from "./route.js";
import noise from "./shaders/noise.glsl?raw";
import sunlight from "./shaders/sunlight.glsl?raw";

// Bilderbuch-Wolken wie mit Kreide gezeichnet: gerundete Unterkante, runde Bögen oben, weicher
// ausgefranster Rand, oben weisslich und unten satt, in Violett, Flieder und Rosa. Flache Scheiben, die immer zur Kamera zeigen,
// alle in einer InstancedMesh (ein Zeichenaufruf). Eine Wolke hat einen kleinen Blitz.

// [Breite, Länge, Grösse, Farbe, Blitz]
const CLOUDS = [
  [48, -30, 1.0, "#7f86ee", 0],
  [8, -38, 0.9, "#b07ee8", 0],
  [-32, -18, 1.1, "#8a64e8", 0],
  [40, 25, 0.95, "#c88ae8", 0],
  [-12, 30, 1.0, "#7b8df2", 0],
  [55, 110, 0.9, "#8a64e8", 1],
  [15, 150, 1.05, "#c88ae8", 0],
  [-25, -120, 1.0, "#7f86ee", 0],
  [30, -150, 0.9, "#b07ee8", 0],
  [-40, 120, 1.0, "#7b8df2", 0],
];

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSeed;
  attribute float aBolt;
  varying vec2 vP;
  varying vec3 vColor;
  varying float vSeed;
  varying float vBolt;
  varying vec3 vCenter;
  varying float vVisible;
  void main() {
    // Mittelpunkt und Grösse aus der Instanzmatrix, Ausrichtung zur Kamera (Billboard)
    vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float size = length(instanceMatrix[0].xyz);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = center.xyz + (right * position.x + up * position.y) * size;
    vP = position.xy;
    vColor = aColor;
    vSeed = aSeed;
    vBolt = aBolt;
    vCenter = center.xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    // Ganze Wolke mit der Tiefe ihres Mittelpunkts zeichnen: wie ein aufgeklebtes Bild, das nicht
    // in die Kugel schneidet
    // Tiefe etwas zur Kamera hin versetzt: zum Rand hin wölbt sich die Kugel vor den Mittelpunkt
    // (z. B. im Norden), sonst würde sie die Unterkante doch abschneiden
    vec3 biased = center.xyz + normalize(cameraPosition - center.xyz) * size * 1.3;
    vec4 clipCenter = projectionMatrix * viewMatrix * vec4(biased, 1.0);
    gl_Position.z = (clipCenter.z / clipCenter.w) * gl_Position.w;
    // Hinter dem Erdrand weich ausblenden (Sichtlinie Kamera -> Mittelpunkt streift die Kugel)
    vec3 toCenter = center.xyz - cameraPosition;
    float t = clamp(-dot(cameraPosition, toCenter) / dot(toCenter, toCenter), 0.0, 1.0);
    float closest = length(cameraPosition + toCenter * t);
    vVisible = t >= 1.0 ? 1.0 : smoothstep(0.98, 1.04, closest);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform float uTime;
  uniform float uCurls;
  varying vec2 vP;
  varying vec3 vColor;
  varying float vSeed;
  varying float vBolt;
  varying vec3 vCenter;
  varying float vVisible;
  ${noise}
  ${sunlight}

  float hash(float n) { return fract(sin(n * 91.7 + 13.3) * 43758.5453); }

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  // Bögen oben: 3–5, ungleich gross; der grösste sitzt je Wolke an einer anderen Stelle
  float bumpCount() { return 3.0 + floor(hash(vSeed * 3.1) * 3.0); }
  void bump(float fi, float count, out vec2 c, out float r) {
    float f = fi / (count - 1.0);
    float peak = mix(0.3, 0.7, hash(vSeed * 1.7));
    float big = 1.0 - min(abs(f - peak) * 1.8, 1.0);
    r = (0.17 + 0.15 * big) * (0.85 + 0.3 * hash(vSeed + fi * 13.0));
    c = vec2(mix(-0.5, 0.5, f) + (hash(vSeed + fi * 5.1) - 0.5) * 0.08, -0.12 + r * 0.55);
  }

  // Umriss: Körper wie ein Brotlaib, Unterkante leicht gerundet (an den Enden hochgezogen)
  float cloudShape(vec2 p) {
    float d = sdRoundBox(p - vec2(0.0, -0.17), vec2(0.78, 0.12), 0.12);
    float count = bumpCount();
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      if (fi >= count) break;
      vec2 c; float r;
      bump(fi, count, c, r);
      d = min(d, length(p - c) - r);
    }
    return max(d, -0.29 + 0.1 * p.x * p.x - p.y);
  }

  // Nächster Bogen: Mittelpunkt und Abstand zum Rand (für Striche, die der Wölbung folgen)
  vec3 nearestBump(vec2 p) {
    float count = bumpCount();
    vec3 best = vec3(0.0, 0.0, 1e3);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      if (fi >= count) break;
      vec2 c; float r;
      bump(fi, count, c, r);
      float d = length(p - c) - r;
      if (d < best.z) best = vec3(c, d);
    }
    return best;
  }

  // Ein dünner Farbstiftstrich: t läuft quer zu den Strichen, je ganze Zahl ein Strich.
  // dt = Pixelgrösse von t (vorab bestimmt), Breite in Pixeln
  float pencil(float t, float dt, float widthPx) {
    float distPx = abs(fract(t) - 0.5) / max(dt, 1e-4);
    return 1.0 - smoothstep(widthPx * 0.5, widthPx, distPx);
  }

  // Blitz: Zickzack unter der Wolke
  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  float bolt(vec2 p) {
    float d = segment(p, vec2(0.1, -0.28), vec2(-0.08, -0.47));
    d = min(d, segment(p, vec2(-0.08, -0.47), vec2(0.08, -0.52)));
    d = min(d, segment(p, vec2(0.08, -0.52), vec2(-0.07, -0.78)));
    return d;
  }

  void main() {
    vec2 p = vP;
    float d = cloudShape(p) + snoise(vec3(p * 5.0, vSeed)) * 0.015;
    vec3 nb = nearestBump(p);

    // Drei Lagen dünner Striche, wie mit Farbstift dicht übereinander gekritzelt:
    // A und B verwirbelt in zwei Richtungen über den Körper, C in Bögen um die Wölbungen oben
    float warp = snoise(vec3(p * 2.6, vSeed)) * 2.4 + snoise(vec3(p * 8.0, vSeed + 3.0)) * 0.5;
    float tA = dot(p, vec2(0.25, 1.0)) * 18.0 + warp * 1.4;
    float tB = dot(p, vec2(1.0, -0.55)) * 20.0 + snoise(vec3(p * 3.2, vSeed + 7.0)) * 3.6;
    float tC = length(p - nb.xy) * 20.0 + snoise(vec3(p * 6.0, vSeed + 11.0)) * 0.7;
    // Ableitungen vor jeder Verzweigung bestimmen
    float dA = fwidth(tA), dB = fwidth(tB), dC = fwidth(tC);

    // Rand aus Strichenden: weich und ausgefranst
    float fray = snoise(vec3(p * 30.0, vSeed + 1.0)) * 0.03;
    float shape = 1.0 - smoothstep(-0.03, 0.015, d + fray);

    // Sonne wie bei allen Objekten: im Erdschatten dunkler
    float lit = earthShadow(vCenter, uSunDirection);
    float light = mix(0.55, 1.0, lit);

    vec3 color = vec3(0.0);
    float alpha = 0.0;
    if (shape > 0.0) {
      float top = smoothstep(-0.3, 0.32, p.y);
      // Druck wechselt entlang der Striche
      float pressA = 0.6 + 0.4 * snoise(vec3(p * 6.0, vSeed + 20.0));
      float pressB = 0.55 + 0.45 * snoise(vec3(p * 5.0, vSeed + 30.0));
      float a = pencil(tA, dA, 2.0) * pressA;
      float b = pencil(tB, dB, 1.8) * pressB;
      // Bogenstriche nur in den Wölbungen oben
      float inBump = (1.0 - smoothstep(-0.02, 0.06, nb.z)) * smoothstep(-0.2, 0.0, p.y - nb.y);
      float cArc = pencil(tC, dC, 1.6) * inBump * uCurls * 0.6;

      // Papier zwischen den Strichen: dunkler Grund, leicht in der Farbe getönt
      vec3 paper = vColor * 0.68;
      vec3 deep = vColor * 0.88;
      vec3 bright = mix(vColor, vec3(1.0), 0.22 + 0.25 * top);
      color = paper;
      color = mix(color, mix(deep, vColor, top), a);
      color = mix(color, mix(vColor, bright, top), b * 0.9);
      color = mix(color, mix(vColor, vec3(1.0), 0.3), cArc);
      // Dicht gemalt: die Striche decken fast alles, Lücken sind halb durchsichtig
      float cover = max(max(a, b), cArc);
      alpha = shape * mix(0.8, 1.0, cover);
    }
    float glowLight = 0.0;
    if (vBolt > 0.5) {
      // Blitz zuckt schnell und oft, manchmal doppelt; mit hellem Schein und aufleuchtender Wolke
      float tick = floor(uTime * 9.0);
      float flash = step(0.55, fract(sin(tick * 12.9898) * 43758.5453))
                  * (0.7 + 0.3 * fract(sin(tick * 78.233) * 43758.5453));
      float dist = bolt(p);
      float core = (1.0 - smoothstep(0.02, 0.045, dist)) * step(p.y, -0.28);
      float halo = exp(-dist * 22.0) * step(p.y, -0.2) * 0.8;
      color *= 1.0 + flash * 0.35 * shape;
      color = mix(color, vec3(1.0, 0.92, 0.55), halo * flash);
      color = mix(color, vec3(1.0, 1.0, 0.92), core * flash);
      alpha = max(alpha, max(core, halo * 0.75) * flash);
      glowLight = flash * (core + halo);
    }
    alpha *= vVisible;
    if (alpha < 0.05) discard;
    // Blitz leuchtet selbst, auch im Erdschatten
    gl_FragColor = vec4(color * mix(light, 1.0, clamp(glowLight, 0.0, 1.0)), alpha);
    #include <colorspace_fragment>
  }
`;

const up = new THREE.Vector3();
const position = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();

export default function Clouds() {
  const frame = useRef();
  const mesh = useRef();
  const scene = useThree((state) => state.scene);
  const style = useObjectStyle();

  // Fläche etwas breiter als hoch; unten Platz für den Blitz
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 1.55);
    g.translate(0, -0.155, 0);
    const colors = new Float32Array(CLOUDS.length * 3);
    const color = new THREE.Color();
    CLOUDS.forEach(([, , , hex], i) => color.set(hex).toArray(colors, i * 3));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(CLOUDS.map((_, i) => i * 3.17 + 1)), 1));
    g.setAttribute("aBolt", new THREE.InstancedBufferAttribute(new Float32Array(CLOUDS.map((cloud) => cloud[4])), 1));
    return g;
  }, []);
  const uniforms = useMemo(
    () => ({ uSunDirection: { value: new THREE.Vector3(0, 0, 1) }, uTime: { value: 0 }, uCurls: { value: 1 } }),
    []
  );

  const c = useControls(
    "Wolken",
    {
      visible: { value: true, label: "an" },
      size: { value: 0.3, min: 0.03, max: 0.6, label: "Grösse" },
      altitude: { value: 0.06, min: 0.01, max: 0.3, label: "Höhe" },
      speed: { value: 0.6, min: 0, max: 5, label: "Wind (°/s)" },
      curls: { value: 1, min: 0, max: 1.5, label: "Bogenlinien" },
    },
    { collapsed: true }
  );

  useFrame(({ clock }) => {
    const globe = scene.getObjectByName("globe");
    if (!globe) return;
    globe.updateWorldMatrix(true, false);
    frame.current.matrix.copy(globe.matrixWorld);
    const t = clock.elapsedTime;
    const size = c.size * style.scale;

    CLOUDS.forEach(([lat, lon, scale], i) => {
      // Mit dem Wind langsam nach Osten, dazu leichtes Pendeln in der Breite
      const drift = 0.7 + ((i * 37) % 10) / 15;
      const lng = lon + t * c.speed * drift;
      latLonToVector(lat + Math.sin(t * 0.05 + i) * 2, ((((lng + 180) % 360) + 360) % 360) - 180, up);
      position.copy(up).multiplyScalar(1 + c.altitude);
      scaleVector.setScalar(size * scale);
      matrix.compose(position, quaternion, scaleVector);
      mesh.current.setMatrixAt(i, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.visible = c.visible;

    const u = mesh.current.material.uniforms;
    u.uSunDirection.value.copy(globe.material.uniforms.uSunDirection.value);
    u.uTime.value = t;
    u.uCurls.value = c.curls;
  });

  return (
    <group ref={frame} matrixAutoUpdate={false}>
      <instancedMesh ref={mesh} args={[geometry, null, CLOUDS.length]} frustumCulled={false}>
        <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} transparent />
      </instancedMesh>
    </group>
  );
}
