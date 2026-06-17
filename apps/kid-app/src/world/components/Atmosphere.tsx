// apps/kid-app/src/world/components/Atmosphere.tsx
// Ambient floating life near the ground / mid-air: drifting pollen and fireflies
// via drei <Sparkles> (two layers, warm gold + soft white), plus a few slow-
// rising motes driven by a tiny custom points shader. Dreamy and low-density.
import { useMemo, useRef } from "react";
import { Sparkles } from "@react-three/drei/native";
import { useFrame } from "@react-three/fiber/native";
import { AdditiveBlending, BufferAttribute, Color } from "three";
import type { Points } from "three";
import { PALETTE } from "../theme";

const MOTE_COUNT = 24;
const MOTE_RANGE = 18; // horizontal spread around the hero
const MOTE_TOP = 6; // height at which a mote recycles to the floor

// A handful of slow-rising glowing motes. Custom points shader so each speck
// renders as a soft round dot (no texture) — native-safe.
const MOTE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uTop;
  attribute float aSpeed;
  attribute float aOffset;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    // rise, wrap back to the floor; gentle lateral sway
    float y = mod(p.y + uTime * aSpeed + aOffset, uTop);
    p.y = y;
    p.x += sin(uTime * 0.3 + aOffset) * 0.4;
    p.z += cos(uTime * 0.25 + aOffset) * 0.4;
    // fade in at the bottom, out near the top
    vAlpha = smoothstep(0.0, 1.0, y) * (1.0 - smoothstep(uTop * 0.6, uTop, y));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (60.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    // round soft dot
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(uColor, soft * vAlpha * 0.7);
  }
`;

function RisingMotes() {
  const ref = useRef<Points>(null);

  const { positions, speeds, offsets, sizes } = useMemo(() => {
    const positions = new Float32Array(MOTE_COUNT * 3);
    const speeds = new Float32Array(MOTE_COUNT);
    const offsets = new Float32Array(MOTE_COUNT);
    const sizes = new Float32Array(MOTE_COUNT);
    for (let i = 0; i < MOTE_COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * MOTE_RANGE;
      positions[i * 3 + 1] = Math.random() * MOTE_TOP;
      positions[i * 3 + 2] = (Math.random() - 0.5) * MOTE_RANGE;
      speeds[i] = 0.25 + Math.random() * 0.35;
      offsets[i] = Math.random() * 100;
      sizes[i] = 2.5 + Math.random() * 3.5;
    }
    return { positions, speeds, offsets, sizes };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTop: { value: MOTE_TOP },
      uColor: { value: new Color(PALETTE.pollenGold) },
    }),
    [],
  );

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSpeed" args={[speeds, 1]} />
        <bufferAttribute attach="attributes-aOffset" args={[offsets, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={MOTE_VERT}
        fragmentShader={MOTE_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

export function Atmosphere() {
  return (
    <>
      {/* warm gold pollen drifting low and wide */}
      <Sparkles
        count={30}
        scale={[26, 5, 26]}
        position={[0, 2.5, 0]}
        size={4}
        speed={0.25}
        opacity={0.7}
        color={PALETTE.pollenGold}
      />
      {/* finer soft-white firefly layer, a touch higher and sparser */}
      <Sparkles
        count={18}
        scale={[22, 7, 22]}
        position={[0, 3.5, 0]}
        size={2.2}
        speed={0.18}
        opacity={0.5}
        color={PALETTE.pollenWhite}
      />
      {/* slow-rising glowing motes */}
      <RisingMotes />
    </>
  );
}

export default Atmosphere;
