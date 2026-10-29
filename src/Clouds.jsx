import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import * as THREE from "three";
import { useObjectStyle } from "./objectStyle.js";
import { latLonToVector } from "./route.js";
import noise from "./shaders/noise.glsl?raw";
import sunlight from "./shaders/sunlight.glsl?raw";

// Bilderbuch-Wolken wie mit Farbstift gezeichnet: flache Unterkante, gewellte Oberseite, aus kleinen
// Schlaufen gekritzelt, in Violett, Flieder und Rosa. Flache Scheiben, die immer zur Kamera zeigen,
// alle in einer InstancedMesh (ein Zeichenaufruf). Eine Wolke hat einen kleinen Blitz.

// [Breite, Länge, Grösse, Farbe, Blitz]
const CLOUDS = [
  [48, -30, 1.0, "#7468ee", 0],
  [8, -38, 0.9, "#9a5cee", 0],
  [-32, -18, 1.1, "#6c3ee8", 0],
  [40, 25, 0.95, "#d78cea", 0],
  [-12, 30, 1.0, "#7684f0", 0],
  [55, 110, 0.9, "#6c3ee8", 1],
  [15, 150, 1.05, "#d78cea", 0],
  [-25, -120, 1.0, "#7468ee", 0],
  [30, -150, 0.9, "#9a5cee", 0],
  [-40, 120, 1.0, "#7684f0", 0],
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
  ${noise}
  ${sunlight}

  float hash(float n) { return fract(sin(n * 91.7 + 13.3) * 43758.5453); }
  vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  // Umriss: unregelmässige Bögen oben (Anzahl, Grösse und Höhe je Wolke verschieden), flache Unterkante
  float cloudShape(vec2 p) {
    float d = sdRoundBox(p - vec2(0.0, -0.18), vec2(0.8, 0.12), 0.11);
    float count = 4.0 + floor(hash(vSeed * 3.1) * 3.0);
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      if (fi >= count) break;
      float f = fi / (count - 1.0);
      float middle = 1.0 - abs(f - 0.5) * 2.0;
      float h = hash(vSeed + fi * 7.3);
      vec2 c = vec2(mix(-0.64, 0.64, f) + (hash(vSeed + fi * 5.1) - 0.5) * 0.16, -0.1 + (0.12 + 0.2 * h) * (0.45 + 0.55 * middle));
      float r = (0.17 + 0.13 * middle) * (0.75 + 0.5 * hash(vSeed + fi * 13.0));
      d = min(d, length(p - c) - r);
    }
    // Flache Unterkante
    return max(d, -0.3 - p.y);
  }

  // Lockere Farbstift-Schlaufen: verschieden grosse, leicht ovale Kringel, nicht jede Zelle hat einen
  float curls(vec2 p, float width) {
    vec2 g = p / 0.2;
    vec2 cell = floor(g);
    float stroke = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 id = cell + vec2(float(x), float(y));
        vec2 h = hash2(id + vSeed);
        if (h.y < 0.25) continue;
        vec2 c = id + 0.5 + (h - 0.5) * 1.1;
        vec2 q = (g - c) * vec2(1.0, 1.25 + 0.4 * h.y);
        float radius = 0.3 + 0.5 * h.x;
        float ring = abs(length(q) - radius);
        // Strich mit wechselndem Druck
        float pressure = 0.55 + 0.45 * sin(atan(q.y, q.x) * 2.0 + h.x * 6.28);
        stroke = max(stroke, (1.0 - smoothstep(width * 0.4, width, ring)) * pressure);
      }
    }
    return stroke;
  }

  // Blitz: Zickzack unter der Wolke
  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  float bolt(vec2 p) {
    float d = segment(p, vec2(0.08, -0.3), vec2(-0.06, -0.42));
    d = min(d, segment(p, vec2(-0.06, -0.42), vec2(0.06, -0.45)));
    d = min(d, segment(p, vec2(0.06, -0.45), vec2(-0.05, -0.6)));
    return d;
  }

  void main() {
    vec2 p = vP;
    // Umriss leicht zittrig wie von Hand gezogen
    float wobble = snoise(vec3(p * 7.0, vSeed)) * 0.03;
    float d = cloudShape(p) + wobble;
    float aa = fwidth(d) * 1.2;
    float inside = 1.0 - smoothstep(-aa, aa, d);

    // Sonne wie bei allen Objekten: im Erdschatten dunkler
    float lit = earthShadow(vCenter, uSunDirection);
    float light = mix(0.55, 1.0, lit);

    vec3 color = vec3(0.0);
    float alpha = 0.0;
    if (inside > 0.0) {
      // Oben heller, unten satter und dunkler (wie im Bild)
      float top = smoothstep(-0.32, 0.35, p.y);
      vec3 base = mix(vColor * 0.62, vColor, top);
      // Am Rand sammelt sich mehr Farbe
      base *= 1.0 - (1.0 - smoothstep(0.0, 0.05, -d)) * 0.18;
      // Helle Schlaufen darüber, oben deutlicher
      float loops = curls(p + vec2(vSeed * 0.37, 0.0), 0.16) * uCurls;
      base = mix(base, mix(vColor, vec3(1.0), 0.3), loops * (0.3 + 0.3 * top));
      // Papierkorn des Farbstifts
      base *= 1.0 + snoise(vec3(p * 60.0, vSeed)) * 0.05;
      color = base;
      // Farbstift deckt nicht ganz: zum Rand hin schimmert das Papier in kleinen Lücken durch
      float edge = 1.0 - smoothstep(0.0, 0.12, -d);
      float tooth = snoise(vec3(p * 38.0, vSeed + 4.0)) * 0.5 + 0.5;
      alpha = inside * (1.0 - edge * smoothstep(0.45, 0.85, tooth) * 0.7) * (0.9 + 0.1 * tooth);
    }
    if (vBolt > 0.5) {
      // Blitz zuckt ab und zu auf
      float flash = step(0.82, fract(sin(floor(uTime * 2.5) * 12.9898) * 43758.5453));
      float b = (1.0 - smoothstep(0.012, 0.03, bolt(p))) * step(p.y, -0.29) * flash;
      color = mix(color, vec3(1.0, 0.97, 0.78), b);
      alpha = max(alpha, b);
    }
    if (alpha < 0.05) discard;
    gl_FragColor = vec4(color * light, alpha);
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
    const g = new THREE.PlaneGeometry(2, 1.3);
    g.translate(0, -0.03, 0);
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
      size: { value: 0.18, min: 0.03, max: 0.3, label: "Grösse" },
      altitude: { value: 0.06, min: 0.01, max: 0.3, label: "Höhe" },
      speed: { value: 0.6, min: 0, max: 5, label: "Wind (°/s)" },
      curls: { value: 1, min: 0, max: 1.5, label: "Schlaufen" },
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
