import { useRef, useState, useCallback, useEffect } from "react";
import { useFrame } from "@react-three/fiber/native";
import { RoundedBox, Float, Sparkles } from "@react-three/drei/native";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import type { SceneProps, AttemptOutcome } from "@institute/plugin-engine";
import { MiniStage, BlobShadow, PALETTE, flatStandard, glowStandard, Face } from "@institute/minigame-kit";
import type { DoorCodeParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";

/**
 * Imperative interface the kid-app's NumberPad / voice layer uses to drive
 * the round. Exposed via `onHandleReady` on mount; the App-level
 * MiniGameMount captures it to wire taps/voice into the Scene's
 * evaluate-and-advance logic.
 *
 * Why not React context: Scene runs inside the R3F render tree; the NumberPad
 * runs inside the RN UI tree. They don't share a React subtree. A small
 * imperative bridge is the simplest correct shape and isolates the coupling
 * to two well-named callbacks.
 */
export type DoorCodeSceneHandle = {
  /** Called with a number when the kid answers. Returns the EvaluateResult for any UI feedback. */
  submitAnswer: (answer: number) => { correct: boolean; expected: number; isLastStep: boolean };
  /** Called when the kid taps the back button. */
  abort: () => void;
};

type Props = SceneProps<DoorCodeParams> & {
  /** Bridge for the RN NumberPad / BackButton to talk to the Scene. */
  onHandleReady?: (h: DoorCodeSceneHandle) => void;
};

const CYAN = PALETTE.cyan;
const GOLD = PALETTE.gold;

/**
 * A single code slot: a chunky rune disc set into the door. Unsolved slots
 * glow dimly; once solved they ramp emissive up and gain a pulsing core.
 */
function CodeSlot({
  x,
  solved,
  active,
}: {
  x: number;
  solved: boolean;
  active: boolean;
}) {
  const coreRef = useRef<Mesh>(null);
  const ringMatRef = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (coreRef.current) {
      const base = solved ? 1 : active ? 0.62 : 0.42;
      const pulse = solved ? 0.12 * Math.sin(t * 4) : active ? 0.08 * Math.sin(t * 3) : 0;
      coreRef.current.scale.setScalar(base + pulse);
    }
    if (ringMatRef.current) {
      const target = solved ? 1.6 : active ? 0.8 : 0.18;
      ringMatRef.current.emissiveIntensity +=
        (target - ringMatRef.current.emissiveIntensity) * 0.1;
    }
  });

  const color = solved ? GOLD : CYAN;
  return (
    <group position={[x, 0, 0.34]}>
      {/* Recessed ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.06, 12, 28]} />
        <meshStandardMaterial
          ref={ringMatRef}
          color="#3b4252"
          emissive={color}
          emissiveIntensity={0.18}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      {/* Glowing faceted gem core */}
      <mesh ref={coreRef} position={[0, 0, 0.04]} rotation={[0.3, 0.4, 0]}>
        <icosahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial
          {...glowStandard(color, color, solved ? 1.8 : active ? 0.9 : 0.35)}
        />
      </mesh>
    </group>
  );
}

/** One chunky door leaf (RoundedBox) that slides aside on open. */
function DoorLeaf({
  side,
  open,
  shake,
}: {
  side: -1 | 1;
  open: boolean;
  shake: number;
}) {
  const ref = useRef<Group>(null);
  const slideRef = useRef(0);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    // Slide open smoothly when solved.
    const target = open ? side * 1.9 : 0;
    slideRef.current += (target - slideRef.current) * 0.08;
    const shakeX = shake > 0 ? Math.sin(t * 55) * 0.05 : 0;
    ref.current.position.x = side * 0.78 + slideRef.current + shakeX;
  });

  return (
    <group ref={ref}>
      <RoundedBox args={[1.5, 3.2, 0.45]} radius={0.12} smoothness={3}>
        <meshStandardMaterial {...flatStandard("#8a7d63", { roughness: 0.7 })} />
      </RoundedBox>
      {/* Inset panel for depth */}
      <RoundedBox args={[1.05, 2.7, 0.5]} radius={0.1} smoothness={3} position={[0, 0, 0.02]}>
        <meshStandardMaterial {...flatStandard("#766a52", { roughness: 0.75 })} />
      </RoundedBox>
    </group>
  );
}

// A cute stone door-keeper perched on the arch. Bobs idly, then cheers (excited
// face + hop) when the door opens — gives the puzzle a friendly character.
function Keeper({ opened }: { opened: boolean }) {
  const ref = useRef<Group>(null);
  // Perched on the arch's top-right corner (clear of the centred task banner).
  const baseY = 4.5;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = baseY + (opened ? Math.abs(Math.sin(t * 7)) * 0.18 : Math.sin(t * 1.4) * 0.05);
    ref.current.rotation.y = -0.4 + Math.sin(t * 0.6) * 0.18;
  });
  return (
    <group ref={ref} position={[1.25, baseY, 0.25]}>
      <mesh>
        <icosahedronGeometry args={[0.58, 0]} />
        <meshStandardMaterial {...flatStandard("#9a8c70", { roughness: 0.8 })} />
      </mesh>
      {[-0.27, 0.27].map((x) => (
        <mesh key={x} position={[x, 0.48, 0]} rotation={[0, 0, x < 0 ? 0.22 : -0.22]}>
          <coneGeometry args={[0.09, 0.26, 6]} />
          <meshStandardMaterial {...flatStandard("#7c7058", { roughness: 0.8 })} />
        </mesh>
      ))}
      <Face size={1.2} position={[0, 0.02, 0.54]} mood={opened ? "excited" : "happy"} cheeks />
    </group>
  );
}

export function Scene({ params, onComplete, onHandleReady, skillId }: Props) {
  const rigRef = useRef<Group>(null);
  const [step, setStep] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [opened, setOpened] = useState(false);
  const [shake, setShake] = useState(0);
  const startedAtRef = useRef(Date.now());
  const outcomesRef = useRef<AttemptOutcome[]>([]);

  // Gentle idle sway of the whole door rig, plus a brief shake on wrong.
  useFrame(({ clock }) => {
    if (!rigRef.current) return;
    const t = clock.elapsedTime;
    rigRef.current.rotation.y = Math.sin(t * 0.4) * 0.04;
    if (shake > 0) setShake((s) => Math.max(0, s - 1));
  });

  const finish = useCallback(
    (status: "completed" | "aborted") => {
      onComplete({
        status,
        outcomes: outcomesRef.current,
        durationMs: Date.now() - startedAtRef.current,
      });
    },
    [onComplete],
  );

  useEffect(() => {
    if (!onHandleReady) return;
    onHandleReady({
      submitAnswer: (answer: number) => {
        const r = evaluate(params, step, answer);
        outcomesRef.current.push({
          skillId,
          correct: r.correct,
          hinted: false,
          scaffolded: false,
          // Placeholder difficulty; M5 will compute real difficulty banding.
          difficulty: 0.4,
          occurredAt: new Date(),
        });
        if (r.correct) {
          setSolvedCount((c) => c + 1);
          if (r.isLastStep) {
            setOpened(true);
            // Defer so the last slot lights + the door begins opening before close.
            setTimeout(() => finish("completed"), 1400);
          } else {
            setStep((s) => s + 1);
          }
        } else {
          setShake(24); // ~24 frames of red buzz/shake at 60fps ≈ 400ms
        }
        return r;
      },
      abort: () => finish("aborted"),
    });
  }, [params, step, onHandleReady, finish, skillId]);

  const slotCount = params.problems.length;
  const slotSpacing = 0.62;
  const slotStartX = -((slotCount - 1) * slotSpacing) / 2;

  const buzzing = shake > 0;

  return (
    <MiniStage>
      {/* Contact shadow grounding the whole structure to the grass. */}
      <BlobShadow radius={3.4} opacity={0.42} position={[0, 0.02, -3.2]} />

      {/* --- The locked door, scaled up for presence and grounded on a plinth --- */}
      <group ref={rigRef} position={[0, 0, -3.2]} scale={1.25}>
        {/* Stone plinth / threshold: the door visibly rests on this at y=0. */}
        <RoundedBox args={[4.2, 0.55, 1.4]} radius={0.12} smoothness={3} position={[0, 0.27, 0]}>
          <meshStandardMaterial {...flatStandard(PALETTE.rock, { roughness: 0.95 })} />
        </RoundedBox>
        {/* A lower, wider stone step in front for an inviting approach. */}
        <RoundedBox args={[4.9, 0.28, 1.9]} radius={0.1} smoothness={3} position={[0, 0.14, 0.35]}>
          <meshStandardMaterial {...flatStandard(PALETTE.rockDark, { roughness: 0.95 })} />
        </RoundedBox>

        {/* Stone arch frame around the doorway, sitting on the plinth. */}
        <RoundedBox args={[3.7, 4.0, 0.7]} radius={0.18} smoothness={3} position={[0, 2.55, -0.2]}>
          <meshStandardMaterial {...flatStandard(PALETTE.rockDark, { roughness: 0.85 })} />
        </RoundedBox>
        {/* The friendly door-keeper perched on the keystone. */}
        <Keeper opened={opened} />
        {/* Dark doorway recess behind the leaves (the "burst of light" when open) */}
        <mesh position={[0, 2.15, -0.45]}>
          <planeGeometry args={[2.9, 3.3]} />
          <meshStandardMaterial
            color={opened ? "#fff7d6" : "#1a1c24"}
            emissive={opened ? "#ffe9a8" : "#000000"}
            emissiveIntensity={opened ? 2.2 : 0}
            roughness={1}
          />
        </mesh>

        {/* Two sliding leaves, resting on the plinth top. */}
        <group position={[0, 2.15, 0]}>
          <DoorLeaf side={-1} open={opened} shake={shake} />
          <DoorLeaf side={1} open={opened} shake={shake} />
        </group>

        {/* Code panel: a row of glowing rune slots on a recessed plate */}
        <Float speed={1.4} rotationIntensity={0} floatIntensity={0.25} floatingRange={[-0.04, 0.06]}>
          <group position={[0, 2.15, 0]}>
            <RoundedBox args={[slotCount * slotSpacing + 0.5, 0.78, 0.18]} radius={0.1} smoothness={3} position={[0, 0, 0.3]}>
              <meshStandardMaterial
                color={buzzing ? "#a8413a" : "#2c313c"}
                emissive={buzzing ? "#ff3b30" : "#000000"}
                emissiveIntensity={buzzing ? 1.4 : 0}
                roughness={0.45}
                metalness={0.25}
                flatShading
              />
            </RoundedBox>
            {params.problems.map((_, i) => (
              <CodeSlot
                key={i}
                x={slotStartX + i * slotSpacing}
                solved={i < solvedCount}
                active={i === solvedCount && !opened}
              />
            ))}
          </group>
        </Float>
      </group>

      {/* --- Rewarding burst on completion --- */}
      {opened && (
        <Sparkles
          count={60}
          scale={[5, 5, 3]}
          position={[0, 2.8, -2.6]}
          size={6}
          speed={0.6}
          color={GOLD}
        />
      )}
    </MiniStage>
  );
}
