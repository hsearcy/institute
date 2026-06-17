import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber/native";
import { Float, RoundedBox, Sparkles } from "@react-three/drei/native";
import { Color, DoubleSide } from "three";
import type { Group, Mesh, ShaderMaterial } from "three";
import type { PortalDef, PortalId } from "../../config";
import { glowStandard, flatStandard, PALETTE } from "../theme";
import { BlobShadow } from "./BlobShadow";

type Props = {
  def: PortalDef;
  /** Phase offset in seconds so portals don't pulse in unison. */
  phaseOffsetS?: number;
  onTap?: (id: PortalDef["id"]) => void;
};

const PULSE_PERIOD_S = 1.0;
const PULSE_AMP = 0.02;

// Per-game color identity (preserved from the original mapping). Each portal
// is a glowing magical gateway tinted to its mini-game.
const PORTAL_COLORS: Record<PortalId, { body: string; emissive: string; flag: string }> = {
  "spell-cast":   { body: "#b07cf0", emissive: "#5b2ea0", flag: "#ffd84a" }, // purple+gold
  "block-tower":  { body: "#e07a3a", emissive: "#7a3812", flag: "#fff5e0" }, // orange+cream
  "cookie-share": { body: "#f4c28c", emissive: "#7a4a1f", flag: "#d63b3b" }, // tan+red
  "door-code":    { body: "#3a7d52", emissive: "#1a3d22", flag: "#a3e0b8" }, // green+mint
};

// Swirling vortex membrane. Pure GLSL — native-safe (no DOM/CanvasTexture).
// A spiral pattern rotates around the gateway center, tinted to the portal's
// color, with an additive-ish bright core that says "step through me!".
const VORTEX_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VORTEX_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uCore;

  void main() {
    // center the uv; treat the plane as a disc
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);

    // spiral: angle twists with radius and drifts over time
    float swirl = ang * 3.0 + r * 9.0 - uTime * 1.6;
    float bands = 0.5 + 0.5 * sin(swirl);

    // soft elliptical mask so it fills the gateway and fades at the rim
    float mask = smoothstep(1.0, 0.55, r);

    // a bright pulsing core pulling the eye into the gateway
    float core = smoothstep(0.6, 0.0, r) * (0.6 + 0.25 * sin(uTime * 2.0));

    vec3 col = mix(uColor, uCore, bands * 0.6 + core);
    float a = mask * (0.32 + bands * 0.4 + core * 0.5);
    gl_FragColor = vec4(col, a);
  }
`;

export function Portal({ def, phaseOffsetS = 0, onTap }: Props) {
  const pulseRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const crystalRef = useRef<Mesh>(null);
  const vortexRef = useRef<ShaderMaterial>(null);

  const colors = PORTAL_COLORS[def.id];

  const vortexUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color(colors.emissive) },
      uCore: { value: new Color(colors.flag) },
    }),
    [colors.emissive, colors.flag],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phaseOffsetS;
    if (pulseRef.current) {
      const s = 1 + Math.sin((2 * Math.PI * t) / PULSE_PERIOD_S) * PULSE_AMP;
      pulseRef.current.scale.set(s, s, s);
    }
    if (ringRef.current) ringRef.current.rotation.z = t * 0.6;
    if (crystalRef.current) {
      crystalRef.current.rotation.y = t * 0.9;
      crystalRef.current.position.y = 3.05 + Math.sin(t * 1.3) * 0.08;
    }
    if (vortexRef.current) {
      const u = vortexRef.current.uniforms.uTime;
      if (u) u.value = t;
    }
  });

  return (
    <group position={def.position}>
      <BlobShadow radius={0.85} opacity={0.32} position={[0, 0.02, 0]} />

      {/* pulsing gateway group (keeps the original pulse behavior + click) */}
      <group
        ref={pulseRef}
        onClick={(e) => {
          e.stopPropagation();
          onTap?.(def.id);
        }}
      >
        {/* base plinth */}
        <RoundedBox args={[1.1, 0.35, 1.1]} radius={0.12} smoothness={3} position={[0, 0.18, 0]}>
          <meshStandardMaterial {...flatStandard(colors.emissive, { roughness: 0.9 })} />
        </RoundedBox>

        {/* two glowing pylons framing the gateway */}
        {[-0.42, 0.42].map((x) => (
          <RoundedBox key={x} args={[0.3, 2.3, 0.3]} radius={0.13} smoothness={4} position={[x, 1.45, 0]}>
            <meshStandardMaterial {...glowStandard(colors.body, colors.emissive, 0.85)} />
          </RoundedBox>
        ))}

        {/* glowing arch connecting the pylons */}
        <mesh position={[0, 2.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.46, 0.13, 12, 24, Math.PI]} />
          <meshStandardMaterial {...glowStandard(colors.body, colors.emissive, 0.9)} />
        </mesh>

        {/* swirling vortex membrane between the pylons (custom GLSL) */}
        <mesh position={[0, 1.5, 0]}>
          <planeGeometry args={[0.84, 2.3]} />
          <shaderMaterial
            ref={vortexRef}
            vertexShader={VORTEX_VERT}
            fragmentShader={VORTEX_FRAG}
            uniforms={vortexUniforms}
            transparent
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>

        {/* rotating accent ring */}
        <mesh ref={ringRef} position={[0, 1.5, 0.02]}>
          <torusGeometry args={[0.34, 0.05, 10, 28]} />
          <meshStandardMaterial {...glowStandard(colors.flag, colors.flag, 0.6)} />
        </mesh>
      </group>

      {/* floating rotating crystal accent above the arch */}
      <Float speed={2} rotationIntensity={0} floatIntensity={0.4} floatingRange={[-0.05, 0.05]}>
        <mesh ref={crystalRef} position={[0, 3.05, 0]} rotation={[0, 0, 0]}>
          <octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial {...glowStandard(colors.flag, colors.flag, 0.9)} />
        </mesh>
      </Float>

      {/* sparkles drifting around the gateway */}
      <Sparkles count={16} scale={[1.4, 3, 1.4]} size={2.5} speed={0.3} position={[0, 1.6, 0]} color={colors.flag} opacity={0.75} />
    </group>
  );
}
