// apps/kid-app/src/world/components/BlobShadow.tsx
// Fake contact shadow: a flat disc on the ground with a radial alpha
// falloff. Pure GLSL ShaderMaterial — native-safe (no CanvasTexture, no
// DOM). Used to ground heroes / portals / decor without realtime shadows.
import { useMemo } from "react";
import { Color, DoubleSide } from "three";
import { PALETTE } from "../theme";

type Props = {
  radius?: number;
  opacity?: number;
  /** World position of the disc center. Y is lifted slightly off the ground. */
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
    // distance from disc center (uv 0.5,0.5) → 0 at center, ~0.707 at corner
    float d = distance(vUv, vec2(0.5)) * 2.0;
    // soft falloff: opaque in the middle, fading to nothing at the rim
    float a = smoothstep(1.0, 0.25, d);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;

export function BlobShadow({
  radius = 1,
  opacity = 0.35,
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
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={position as [number, number, number]}
    >
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
