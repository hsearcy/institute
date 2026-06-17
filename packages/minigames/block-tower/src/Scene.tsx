import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber/native";
import { Float, RoundedBox, Sparkles } from "@react-three/drei/native";
import type { Group, Mesh } from "three";
import type { SceneProps, AttemptOutcome } from "@institute/plugin-engine";
import { MiniStage, BlobShadow, PALETTE, flatStandard } from "@institute/minigame-kit";
import type { BlockTowerParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";

/**
 * Imperative interface the kid-app's NumberPad uses to drive the round.
 * Exposed via onHandleReady on first mount; the App-level MiniGameMount
 * captures it to wire taps from the RN NumberPad UI to the Scene's
 * evaluate-and-advance logic.
 *
 * Why not React context: Scene runs inside the R3F render tree; NumberPad
 * runs inside the RN UI tree. They don't share a React subtree. A small
 * imperative bridge is the simplest correct shape and isolates the
 * coupling to two well-named callbacks.
 */
export type BlockTowerSceneHandle = {
  /** Called with a number when the kid taps a button. Returns the EvaluateResult for any UI feedback. */
  submitAnswer: (answer: number) => { correct: boolean; expected: number; isLastStep: boolean };
  /** Called when the kid taps the back button. */
  abort: () => void;
};

type Props = SceneProps<BlockTowerParams> & {
  /** Bridge for the RN NumberPad / BackButton to talk to the Scene. */
  onHandleReady?: (h: BlockTowerSceneHandle) => void;
};

// Cheerful toy-block palette, cycled up the tower.
const BLOCK_COLORS = ["#ff8fb0", "#6fe6ff", "#ffd84a", "#8fd16b", "#b07cf0"];
const ADDEND_A_COLOR = "#6fe6ff"; // cyan group = a
const ADDEND_B_COLOR = "#ff8fb0"; // pink group = b

// Slightly larger blocks so the tower reads as a confident, full presence.
const BLOCK_SIZE = 0.72;
const BLOCK_GAP = 0.1;
const BLOCK_STEP = BLOCK_SIZE + BLOCK_GAP;

// A small counter-block used to visualise an addend group. Gentle idle bob.
function CountBlock({
  index,
  color,
  position,
}: {
  index: number;
  color: string;
  position: [number, number, number];
}) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y =
      position[1] + Math.sin(clock.elapsedTime * 2 + index * 0.6) * 0.04;
  });
  return (
    <group ref={ref} position={position}>
      <RoundedBox args={[0.44, 0.44, 0.44]} radius={0.09} smoothness={3}>
        <meshStandardMaterial {...flatStandard(color, { emissive: color, emissiveIntensity: 0.08, roughness: 0.7 })} />
      </RoundedBox>
    </group>
  );
}

// A horizontal row of count-blocks representing one addend, each sitting on the
// ground with its own contact shadow beneath it.
const ADDEND_SPACING = 0.56;

function AddendGroup({
  count,
  color,
  origin,
}: {
  count: number;
  color: string;
  origin: [number, number, number];
}) {
  const blocks = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const width = (count - 1) * ADDEND_SPACING;
  return (
    <group position={origin}>
      <BlobShadow radius={Math.max(0.6, width / 2 + 0.5)} opacity={0.3} />
      {blocks.map((i) => (
        <CountBlock
          key={i}
          index={i}
          color={color}
          position={[i * ADDEND_SPACING - width / 2, 0.28, 0]}
        />
      ))}
    </group>
  );
}

// One block in the tower. Animates a bouncy settle when it first appears.
function TowerBlock({ slot, color }: { slot: number; color: string }) {
  const ref = useRef<Mesh>(null);
  const bornAt = useRef<number | null>(null);
  const restY = slot * BLOCK_STEP + BLOCK_SIZE / 2;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (bornAt.current === null) bornAt.current = clock.elapsedTime;
    const t = clock.elapsedTime - bornAt.current;
    if (t < 0.6) {
      // Drop from above + damped bounce settle.
      const drop = (1 - t / 0.6) * 2.2;
      const bounce = Math.sin(t * 22) * Math.exp(-t * 8) * 0.35;
      ref.current.position.y = restY + drop + bounce;
      const s = 1 + Math.sin(t * 22) * Math.exp(-t * 8) * 0.18;
      ref.current.scale.set(s, 1 / Math.max(0.4, s), s);
    } else {
      ref.current.position.y = restY;
      ref.current.scale.set(1, 1, 1);
    }
  });

  return (
    <RoundedBox
      ref={ref}
      args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]}
      radius={0.12}
      smoothness={4}
      position={[0, restY, 0]}
    >
      <meshStandardMaterial {...flatStandard(color, { emissive: color, emissiveIntensity: 0.1, roughness: 0.7 })} />
    </RoundedBox>
  );
}

export function Scene({ params, onComplete, onHandleReady, skillId }: Props) {
  const towerRef = useRef<Group>(null);
  const problemRef = useRef<Group>(null);
  const [step, setStep] = useState(0);
  // Number of blocks currently locked into the tower (the running total of
  // correctly answered problems is not what we stack — each correct answer
  // grows the tower to that problem's answer height).
  const [towerHeight, setTowerHeight] = useState(0);
  const [shake, setShake] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const startedAtRef = useRef(Date.now());
  const outcomesRef = useRef<AttemptOutcome[]>([]);

  const problem = params.problems[Math.min(step, params.problems.length - 1)]!;

  // Idle bob for the whole tower; wobble on a wrong answer.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (towerRef.current) {
      towerRef.current.position.y = Math.sin(t * 1.3) * 0.03;
      towerRef.current.rotation.z =
        shake > 0 ? Math.sin(t * 40) * 0.05 : towerRef.current.rotation.z * 0.85;
    }
    if (problemRef.current && shake > 0) {
      problemRef.current.position.x = Math.sin(t * 45) * 0.08;
    } else if (problemRef.current) {
      problemRef.current.position.x = problemRef.current.position.x * 0.85;
    }
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
          // Placeholder difficulty; M5 will compute real difficulty banding
          // and route per-skill outcomes back to skill-engine.
          difficulty: 0.4,
          occurredAt: new Date(),
        });
        if (r.correct) {
          // Grow the tower to this problem's answer height.
          setTowerHeight(r.expected);
          setCelebrate(true);
          setTimeout(() => setCelebrate(false), 900);
          if (r.isLastStep) {
            // Defer so the final stack + sparkles render before the round closes.
            setTimeout(() => finish("completed"), 900);
          } else {
            setStep((s) => s + 1);
          }
        } else {
          setShake(18); // ~18 frames of wobble at 60fps ≈ 300ms
        }
        return r;
      },
      abort: () => finish("aborted"),
    });
  }, [params, step, onHandleReady, finish, skillId]);

  const towerBlocks = useMemo(
    () => Array.from({ length: towerHeight }, (_, i) => i),
    [towerHeight],
  );

  // Goal marker height (in the tower group's local frame): just above where the
  // finished tower's top block will land, so it reads as "stack up to here".
  // 0.18 = top of the base pad the tower sits on.
  const goalY = 0.18 + problem.answer * BLOCK_STEP + 0.3;

  return (
    <MiniStage>
      {/* The growing tower (left of center). */}
      <group position={[-2.0, 0, 0]}>
        <BlobShadow radius={1.05} opacity={0.4} />
        {/* Base pad so the tower has something toy-like to sit on. */}
        <RoundedBox args={[1.3, 0.2, 1.3]} radius={0.07} smoothness={3} position={[0, 0.1, 0]}>
          <meshStandardMaterial {...flatStandard("#e9d8b8", { roughness: 0.8 })} />
        </RoundedBox>
        {/* Faint gold target column from the base up to the goal hoop, so the
            ring reads as "fill the tower up to here" instead of a lone halo. */}
        {Array.from({ length: problem.answer }, (_, i) => (
          <mesh key={`ghost${i}`} position={[0, 0.2 + i * BLOCK_STEP + BLOCK_SIZE / 2, 0]}>
            <boxGeometry args={[BLOCK_SIZE * 0.96, BLOCK_SIZE * 0.96, BLOCK_SIZE * 0.96]} />
            <meshStandardMaterial color={PALETTE.gold} transparent opacity={0.13} depthWrite={false} roughness={0.6} />
          </mesh>
        ))}
        <group ref={towerRef} position={[0, 0.2, 0]}>
          {towerBlocks.map((i) => (
            <TowerBlock key={i} slot={i} color={BLOCK_COLORS[i % BLOCK_COLORS.length]!} />
          ))}
        </group>

        {/* Goal marker: an upright gold target hoop just above the tower at the
            target height — "stack up to here", not a distant halo. */}
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5} floatingRange={[-0.06, 0.06]}>
          <mesh position={[0, goalY, 0]}>
            <torusGeometry args={[0.62, 0.07, 12, 32]} />
            <meshStandardMaterial {...flatStandard(PALETTE.gold, { emissive: PALETTE.gold, emissiveIntensity: 0.6, roughness: 0.5, flatShading: false })} />
          </mesh>
        </Float>

        {celebrate && (
          <Sparkles count={24} scale={[1.8, goalY + 1, 1.8]} size={4} speed={0.6} color={PALETTE.gold} />
        )}
      </group>

      {/* The current problem shown as two addend groups (right of center). */}
      <group ref={problemRef} position={[2.2, 0, 0.4]}>
        <AddendGroup count={problem.a} color={ADDEND_A_COLOR} origin={[0, 0, 0]} />
        {/* Plus gap, then the b group a bit further out. */}
        <AddendGroup
          count={problem.b}
          color={ADDEND_B_COLOR}
          origin={[Math.max(1.6, problem.a * ADDEND_SPACING + 1.4), 0, 0]}
        />
      </group>
    </MiniStage>
  );
}
