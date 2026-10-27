import { useMemo } from "react";
import * as THREE from "three";

const palette = ["#ffffff", "#d9cfff", "#ffd6f0", "#c9e4ff"];

export default function Stars({ count = 260 }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const shapes = new Float32Array(count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 10);
      positions.set([v.x, v.y, v.z], i * 3);
      color.set(palette[Math.floor(Math.random() * palette.length)]);
      colors.set([color.r, color.g, color.b], i * 3);
      const sparkle = Math.random() < 0.06;
      shapes[i] = sparkle ? 1 : 0;
      sizes[i] = sparkle ? 26 + Math.random() * 16 : 3 + Math.random() * 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aShape", new THREE.BufferAttribute(shapes, 1));
    return g;
  }, [count]);

  return (
    <points geometry={geometry}>
      <shaderMaterial
        transparent
        depthWrite={false}
        vertexColors
        uniforms={{ uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } }}
        vertexShader={/* glsl */ `
          uniform float uPixelRatio;
          attribute float aSize;
          attribute float aShape;
          varying vec3 vColor;
          varying float vShape;
          void main() {
            vColor = color;
            vShape = aShape;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPixelRatio;
          }
        `}
        fragmentShader={/* glsl */ `
          varying vec3 vColor;
          varying float vShape;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float alpha;
            if (vShape > 0.5) {
              // Vierzackiger Funkelstern
              float cross = max(
                1.0 - smoothstep(0.0, 0.04 + 0.5 * (0.5 - abs(uv.x)) * 0.12, abs(uv.y)) ,
                1.0 - smoothstep(0.0, 0.04 + 0.5 * (0.5 - abs(uv.y)) * 0.12, abs(uv.x))
              );
              float fade = 1.0 - smoothstep(0.1, 0.5, length(uv));
              alpha = cross * fade + (1.0 - smoothstep(0.03, 0.08, length(uv)));
            } else {
              alpha = 1.0 - smoothstep(0.3, 0.5, length(uv));
            }
            gl_FragColor = vec4(vColor, alpha * 0.9);
          }
        `}
      />
    </points>
  );
}
