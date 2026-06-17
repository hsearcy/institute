// apps/kid-app/src/world/components/Pond.tsx
// A small charming pond off to one side of the hub. The water surface is a
// flat disc with a custom GLSL ShaderMaterial: animated gentle ripples, a soft
// fresnel/edge tint, and a semi-reflective blue-cyan look. Ringed by rounded
// stones and reeds, with a couple of lily pads floating on top.
// Native-safe: pure ShaderMaterial (no DOM / CanvasTexture), R3F from /native.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import { Color, DoubleSide, type ShaderMaterial } from "three";
import { PALETTE, flatStandard } from "../theme";

// Where the pond sits. Off to one side, in the mid ring, clear of the play area.
const POND_CENTER: readonly [number, number, number] = [-8.5, 0, 3];
const POND_RADIUS = 2.6;

// ---------------------------------------------------------------------
// Water shader: layered sine ripples drive a subtle brightness shimmer and a
// vertical wobble; a fresnel-ish radial term tints the rim toward foam.
// ---------------------------------------------------------------------
const WATER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;
  void main() {
    vUv = uv;
    vec3 p = position;
    // concentric + crossing ripples; gentle vertical displacement
    float w =
      sin((uv.x * 18.0) + uTime * 1.6) * 0.5 +
      sin((uv.y * 14.0) - uTime * 1.2) * 0.5 +
      sin((uv.x + uv.y) * 22.0 + uTime * 2.1) * 0.3;
    vWave = w;
    p.z += w * 0.03; // plane is XY before rotation → z is the surface normal
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const WATER_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  varying vec2 vUv;
  varying float vWave;
  void main() {
    // radial distance from disc center → fresnel-ish edge term
    float d = distance(vUv, vec2(0.5)) * 2.0;
    float edge = smoothstep(0.6, 1.0, d);

    // base water gradient deep→shallow, modulated by the ripple for shimmer
    float shimmer = vWave * 0.12 + 0.5;
    vec3 col = mix(uDeep, uShallow, clamp(shimmer, 0.0, 1.0));

    // bright crests: where ripples peak, add a touch of foam highlight
    float crest = smoothstep(0.7, 1.0, vWave * 0.5 + 0.5);
    col = mix(col, uFoam, crest * 0.35);

    // soft foam tint right at the rim (fresnel edge)
    col = mix(col, uFoam, edge * 0.4);

    // fade alpha slightly at the very edge so it blends into the bank
    float a = mix(0.92, 0.78, edge);
    gl_FragColor = vec4(col, a);
  }
`;

function Water() {
  const matRef = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new Color(PALETTE.waterDeep) },
      uShallow: { value: new Color(PALETTE.waterShallow) },
      uFoam: { value: new Color(PALETTE.waterFoam) },
    }),
    [],
  );
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime!.value = clock.elapsedTime;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <circleGeometry args={[POND_RADIUS, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={WATER_VERT}
        fragmentShader={WATER_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------
// Bank: a ring of rounded stones around the rim, with a few reed tufts.
// Deterministic placement so the pond looks the same every render.
// ---------------------------------------------------------------------
const STONE_COUNT = 12;

function Bank() {
  const stones = useMemo(
    () =>
      Array.from({ length: STONE_COUNT }, (_, i) => {
        const a = (i / STONE_COUNT) * Math.PI * 2;
        const r = POND_RADIUS + 0.05;
        const s = 0.32 + (i % 3) * 0.12;
        const dark = i % 2 === 0;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, a, s, dark };
      }),
    [],
  );
  return (
    <>
      {stones.map((st, i) => (
        <mesh
          key={i}
          position={[st.x, 0.08, st.z]}
          rotation={[0.15, st.a, 0.1]}
          scale={[st.s * 1.3, st.s * 0.7, st.s]}
        >
          <dodecahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial
            {...flatStandard(st.dark ? PALETTE.rockDark : PALETTE.rock, { roughness: 0.95 })}
          />
        </mesh>
      ))}
    </>
  );
}

// reed tufts poking up at a few points around the bank
const REED_SPOTS: { a: number; n: number }[] = [
  { a: 0.6, n: 4 },
  { a: 2.4, n: 3 },
  { a: 4.3, n: 5 },
];

function Reeds() {
  return (
    <>
      {REED_SPOTS.map((spot, si) => {
        const cx = Math.cos(spot.a) * (POND_RADIUS - 0.15);
        const cz = Math.sin(spot.a) * (POND_RADIUS - 0.15);
        return (
          <group key={si} position={[cx, 0, cz]}>
            {Array.from({ length: spot.n }, (_, i) => {
              const ba = (i / spot.n) * Math.PI * 2;
              const br = 0.06 + (i % 2) * 0.05;
              const h = 0.6 + (i % 3) * 0.18;
              return (
                <mesh
                  key={i}
                  position={[Math.cos(ba) * br, h / 2, Math.sin(ba) * br]}
                  rotation={[(i % 2 === 0 ? 1 : -1) * 0.18, ba, 0]}
                >
                  <cylinderGeometry args={[0.025, 0.035, h, 5]} />
                  <meshStandardMaterial {...flatStandard(PALETTE.reed, { roughness: 0.8 })} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </>
  );
}

// a couple of lily pads floating on the surface (flat low cylinders)
const LILY_PADS: { o: readonly [number, number]; r: number }[] = [
  { o: [0.7, -0.5], r: 0.32 },
  { o: [-0.9, 0.6], r: 0.26 },
  { o: [0.2, 0.9], r: 0.22 },
];

function LilyPads() {
  return (
    <>
      {LILY_PADS.map((p, i) => (
        <mesh key={i} position={[p.o[0], 0.07, p.o[1]]}>
          <cylinderGeometry args={[p.r, p.r, 0.03, 12]} />
          <meshStandardMaterial {...flatStandard(PALETTE.lilyPad, { roughness: 0.7 })} />
        </mesh>
      ))}
    </>
  );
}

export function Pond() {
  return (
    <group position={POND_CENTER as [number, number, number]}>
      <Water />
      <Bank />
      <Reeds />
      <LilyPads />
    </group>
  );
}
