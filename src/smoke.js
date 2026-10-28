import * as THREE from "three";
import noise from "./shaders/noise.glsl?raw";
import sunlight from "./shaders/sunlight.glsl?raw";

// Rauchwolken als Partikel: wachsen, treiben und verblassen; Rand wie ein nasser Pinseltupfer,
// im Erdschatten dunkel. Gemeinsam für Rakete und Vulkan.
const vertexShader = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uGrowth;
  attribute float aAge;  // 0 = frisch, 1 = verweht
  attribute float aSize;
  attribute float aSeed;
  varying float vAge;
  varying float vSeed;
  varying vec3 vWorld;
  void main() {
    vAge = aAge;
    vSeed = aSeed;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (0.35 + uGrowth * sqrt(aAge)) * (10.0 / -mv.z);
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uColor;
  uniform vec3 uFresh;     // Farbe frisch an der Quelle (warm angestrahlt)
  uniform float uFreshAge; // wie lange die frische Farbe hält (Anteil der Lebensdauer)
  uniform float uOpacity;
  uniform float uGlow;     // 1 = leuchtet selbst (Glut), wird vom Erdschatten nicht abgedunkelt
  varying float vAge;
  varying float vSeed;
  varying vec3 vWorld;
  ${noise}
  ${sunlight}
  void main() {
    if (vAge >= 1.0) discard;
    vec2 p = gl_PointCoord - 0.5;
    float wobble = snoise(vec3(p * 4.0, vSeed * 10.0)) * 0.12;
    float d = length(p) * 2.0 + wobble;
    float body = 1.0 - smoothstep(0.55, 0.95, d);
    if (body <= 0.0) discard;
    // Pigment sammelt sich am Rand
    float rim = smoothstep(0.45, 0.85, d) * body;
    vec3 color = uColor * (1.0 - rim * 0.18);
    color = mix(uFresh, color, smoothstep(0.0, uFreshAge, vAge));
    float lit = earthShadow(vWorld, uSunDirection);
    color = mix(applySunlight(color, lit, 0.4), color, uGlow);
    float alpha = body * pow(1.0 - vAge, 1.3) * uOpacity;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export class SmokePool {
  constructor(count, { color = "#f2edfa", fresh = "#ffb86b", freshAge = 0.08, opacity = 0.7, growth = 1.65, glow = 0 } = {}) {
    this.count = count;
    this.next = 0;
    this.debt = 0;
    this.velocity = Array.from({ length: count }, () => new THREE.Vector3());
    this.life = new Float32Array(count).fill(1);
    this.age = new Float32Array(count).fill(1);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aAge", new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(count), 1));
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
        uColor: { value: new THREE.Color(color) },
        uFresh: { value: new THREE.Color(fresh) },
        uFreshAge: { value: freshAge },
        uOpacity: { value: opacity },
        uGrowth: { value: growth },
        uGlow: { value: glow },
      },
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  spawn(position, velocity, size, life) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const a = this.geometry.attributes;
    a.position.setXYZ(i, position.x, position.y, position.z);
    a.aSize.setX(i, size);
    a.aSeed.setX(i, Math.random());
    a.aSize.needsUpdate = true;
    a.aSeed.needsUpdate = true;
    this.velocity[i].copy(velocity);
    this.life[i] = life;
    this.age[i] = 0;
  }

  // Gleichmässig ausstossen: rate pro Sekunde, emit() wird pro fälligem Partikel aufgerufen
  emit(rate, dt, emit) {
    this.debt += rate * dt;
    while (this.debt >= 1) {
      this.debt -= 1;
      emit();
    }
  }

  // drag: Abbremsen pro Sekunde; accelerate(i, position, velocity, dt): eigene Kräfte (Auftrieb, Schwerkraft)
  update(dt, sunDirection, { drag = 0.8, accelerate } = {}) {
    this.material.uniforms.uSunDirection.value.copy(sunDirection);
    const position = this.geometry.attributes.position;
    const age = this.geometry.attributes.aAge;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] = Math.min(1, this.age[i] + dt / this.life[i]);
      const v = this.velocity[i];
      v.multiplyScalar(Math.max(0, 1 - dt * drag));
      if (accelerate) accelerate(i, position, v, dt);
      position.setXYZ(i, position.getX(i) + v.x * dt, position.getY(i) + v.y * dt, position.getZ(i) + v.z * dt);
      age.setX(i, this.age[i]);
    }
    position.needsUpdate = true;
    age.needsUpdate = true;
  }
}
