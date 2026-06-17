// Vertical gradient sky dome via a custom GLSL ShaderMaterial (native-safe),
// rendered on the BackSide of a large sphere.
import { useMemo } from "react";
import { BackSide, Color } from "three";
import { PALETTE } from "./theme.ts";

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vWorldPos;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  void main() {
    float h = clamp(vWorldPos.y / 100.0, -1.0, 1.0) * 0.5 + 0.5;
    float t = smoothstep(0.45, 0.95, h);
    vec3 col = mix(uHorizon, uZenith, t);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new Color(PALETTE.skyZenith) },
      uHorizon: { value: new Color(PALETTE.skyHorizon) },
    }),
    [],
  );

  return (
    <mesh>
      <sphereGeometry args={[100, 32, 16]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
