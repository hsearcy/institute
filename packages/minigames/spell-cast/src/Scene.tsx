import { useRef, useState, useCallback, useEffect } from "react";
import { useFrame } from "@react-three/fiber/native";
import type { Group } from "three";
import type { SceneProps, AttemptOutcome } from "@institute/plugin-engine";
import type { SpellCastParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";

/**
 * Imperative interface the kid-app's NumberPad uses to drive the round.
 * Exposed via a global ref-like setter on first mount; the App-level
 * MiniGameMount captures it to wire taps from the RN NumberPad UI to the
 * Scene's evaluate-and-advance logic.
 *
 * Why not React context: Scene runs inside the R3F render tree; NumberPad
 * runs inside the RN UI tree. They don't share a React subtree. A small
 * imperative bridge is the simplest correct shape and isolates the
 * coupling to two well-named callbacks.
 */
export type SpellCastSceneHandle = {
  /** Called with a number when the kid taps a button. Returns the EvaluateResult for any UI feedback. */
  submitAnswer: (answer: number) => { correct: boolean; expected: number; isLastStep: boolean };
  /** Called when the kid taps the back button. */
  abort: () => void;
};

type Props = SceneProps<SpellCastParams> & {
  /** Bridge for the RN NumberPad / BackButton to talk to the Scene. */
  onHandleReady?: (h: SpellCastSceneHandle) => void;
};

export function Scene({ params, onComplete, onHandleReady, skillId }: Props) {
  const goblinRef = useRef<Group>(null);
  const [step, setStep] = useState(0);
  const [hp, setHp] = useState(params.sequence.length);
  const [shake, setShake] = useState(0);
  const startedAtRef = useRef(Date.now());
  const outcomesRef = useRef<AttemptOutcome[]>([]);

  // Subtle bob always, plus shake when wrong.
  useFrame(({ clock }) => {
    if (!goblinRef.current) return;
    const t = clock.elapsedTime;
    goblinRef.current.position.y = 1 + Math.sin(t * 1.5) * 0.05;
    if (shake > 0) {
      goblinRef.current.position.x = Math.sin(t * 50) * 0.1;
      // shake decays per frame; not exact ms but close enough for placeholder
      setShake((s) => Math.max(0, s - 1));
    } else {
      goblinRef.current.position.x = 0;
    }
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
          setHp((h) => h - 1);
          if (r.isLastStep) {
            // Defer to next tick so the HP shrink renders before the round closes.
            setTimeout(() => finish("completed"), 250);
          } else {
            setStep((s) => s + 1);
          }
        } else {
          setShake(20); // ~20 frames of shake at 60fps ≈ 333ms
        }
        return r;
      },
      abort: () => finish("aborted"),
    });
  }, [params, step, onHandleReady, finish, skillId]);

  // Each correct answer shrinks the goblin proportionally to remaining HP.
  const scale = Math.max(0.05, hp / params.sequence.length);

  // Pretty hacky color per enemy type — placeholder until we get assets.
  const enemyColor =
    params.enemyType === "goblin" ? "#3a7d52" :
    params.enemyType === "slime"  ? "#7fc7d9" : "#bda7e0";

  return (
    <>
      <ambientLight intensity={0.5} color="#b8d8ff" />
      <directionalLight position={[5, 10, 5]} intensity={1.0} color="#fff5e0" />
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#5fa052" />
      </mesh>
      {/* Goblin: capsule body + sphere head + 2 sphere eyes */}
      <group ref={goblinRef} position={[0, 1, -3]} scale={[scale, scale, scale]}>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 1.2, 12]} />
          <meshStandardMaterial color={enemyColor} />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.6, 16, 16]} />
          <meshStandardMaterial color={enemyColor} />
        </mesh>
        <mesh position={[0, -0.6, 0]}>
          <sphereGeometry args={[0.6, 16, 16]} />
          <meshStandardMaterial color={enemyColor} />
        </mesh>
        <mesh position={[-0.22, 0.7, 0.55]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.22, 0.7, 0.55]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    </>
  );
}
