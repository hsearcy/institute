// Fake contact shadow: a flat disc with radial alpha falloff. Pure GLSL
// ShaderMaterial — native-safe (no CanvasTexture, no DOM). Grounds objects
// without realtime shadows.
import { useMemo } from "react";
import { Color, DoubleSide } from "three";
import { PALETTE } from "./theme.ts";

type Props = {
  radius?: number;
  opacity?: number;
  position?: readonly [number, number, number];
  color?: string;
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float d = distance(vUv, vec2(0.5)) * 2.0;
    float a = smoothstep(1.0, 0.25, d);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;

export function BlobShadow({
  radius = 1,
  opacity = 0.3,
  position = [0, 0.02, 0],
  color = PALETTE.shadow,
}: Props) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
    }),
    [color, opacity],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position as [number, number, number]}>
      <circleGeometry args={[radius, 32]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
