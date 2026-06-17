import { useRef, useState, useCallback, useEffect } from "react";
import { useFrame } from "@react-three/fiber/native";
import { Float, Sparkles } from "@react-three/drei/native";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import type { SceneProps, AttemptOutcome } from "@institute/plugin-engine";
import { MiniStage, BlobShadow, GltfModel, PALETTE } from "@institute/minigame-kit";
import type { SpellCastParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";

/**
 * Imperative interface the kid-app's NumberPad / voice layer uses to drive the
 * round. Exposed via onHandleReady on first mount; MiniGameMount captures it to
 * wire taps/voice into the Scene's evaluate-and-advance logic.
 *
 * Why not React context: Scene runs inside the R3F render tree; the NumberPad
 * runs inside the RN UI tree. They don't share a React subtree. A small
 * imperative bridge is the simplest correct shape.
 */
export type SpellCastSceneHandle = {
  /** Called with a number when the kid answers. Returns the EvaluateResult for any UI feedback. */
  submitAnswer: (answer: number) => { correct: boolean; expected: number; isLastStep: boolean };
  /** Called when the kid taps the back button. */
  abort: () => void;
};

type Props = SceneProps<SpellCastParams> & {
  onHandleReady?: (h: SpellCastSceneHandle) => void;
};

const GOBLIN_GLB = require("../assets/goblin.glb");

// Where the little monster stands, and where spells come from (front, near the
// camera, as if cast by the player's wand) and land (the monster's chest).
const GOBLIN_POS: [number, number, number] = [0, 0, -2.4];
const CAST_FROM: [number, number, number] = [-0.4, 1.0, 6.5];
const CAST_TO: [number, number, number] = [0, 1.7, -2.2];
const BOLT = "#8be9ff";

/**
 * A one-shot spell: a glowing bolt streaks from the wand to the monster, then
 * blooms into an impact flash + sparkle burst. Self-animating; remounted (via a
 * changing key) on every correct answer.
 */
function SpellHit() {
  const boltRef = useRef<Mesh>(null);
  const flashRef = useRef<Mesh>(null);
  const bornRef = useRef<number | null>(null);
  const [burst, setBurst] = useState(false);
  const TRAVEL = 0.26;

  useFrame(({ clock }) => {
    if (bornRef.current === null) bornRef.current = clock.elapsedTime;
    const t = clock.elapsedTime - bornRef.current;

    if (boltRef.current) {
      if (t < TRAVEL) {
        const k = t / TRAVEL;
        boltRef.current.visible = true;
        boltRef.current.position.set(
          CAST_FROM[0] + (CAST_TO[0] - CAST_FROM[0]) * k,
          CAST_FROM[1] + (CAST_TO[1] - CAST_FROM[1]) * k,
          CAST_FROM[2] + (CAST_TO[2] - CAST_FROM[2]) * k,
        );
        boltRef.current.scale.setScalar(0.22 + 0.12 * Math.sin(k * Math.PI));
      } else {
        boltRef.current.visible = false;
      }
    }

    if (t >= TRAVEL && !burst) setBurst(true);

    if (flashRef.current) {
      const it = t - TRAVEL;
      const mat = flashRef.current.material as MeshBasicMaterial;
      if (it >= 0 && it < 0.36) {
        const k = it / 0.36;
        flashRef.current.visible = true;
        flashRef.current.scale.setScalar(0.3 + k * 1.7);
        mat.opacity = 0.9 * (1 - k);
      } else {
        flashRef.current.visible = false;
      }
    }
  });

  return (
    <group>
      <mesh ref={boltRef} position={CAST_FROM}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={BOLT} toneMapped={false} transparent opacity={0.95} />
      </mesh>
      <mesh ref={flashRef} position={CAST_TO} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {burst && <Sparkles count={22} scale={2.4} position={CAST_TO} size={6} speed={0.7} color={BOLT} />}
    </group>
  );
}

export function Scene({ params, onComplete, onHandleReady, skillId }: Props) {
  const goblinRef = useRef<Group>(null);
  const scaleRef = useRef<Group>(null);
  const [step, setStep] = useState(0);
  const [hp, setHp] = useState(params.sequence.length);
  const [shake, setShake] = useState(0);
  const [castKey, setCastKey] = useState(0);
  const [defeated, setDefeated] = useState(false);
  const recoilRef = useRef(0);
  const startedAtRef = useRef(Date.now());
  const outcomesRef = useRef<AttemptOutcome[]>([]);

  const total = params.sequence.length;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Smoothly shrink toward the current hp (and to nothing once defeated).
    if (scaleRef.current) {
      const target = defeated ? 0.001 : 0.5 + 0.5 * (hp / total);
      const cur = scaleRef.current.scale.x;
      const next = cur + (target - cur) * 0.18;
      scaleRef.current.scale.setScalar(next);
    }

    if (goblinRef.current) {
      // Idle bob + a little sway so it feels alive.
      goblinRef.current.position.y = Math.sin(t * 1.6) * 0.06;
      goblinRef.current.rotation.y = Math.sin(t * 0.7) * 0.12;
      // Recoil knockback eases back to rest.
      recoilRef.current *= 0.86;
      goblinRef.current.position.z = -recoilRef.current;
      // Wrong-answer wiggle.
      goblinRef.current.position.x = shake > 0 ? Math.sin(t * 46) * 0.12 : 0;
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
          difficulty: 0.4,
          occurredAt: new Date(),
        });
        if (r.correct) {
          setHp((h) => h - 1);
          setCastKey((k) => k + 1); // fire a spell
          recoilRef.current = 0.5; // knock the monster back
          if (r.isLastStep) {
            setDefeated(true);
            // Let the final spell + poof play before the round closes.
            setTimeout(() => finish("completed"), 900);
          } else {
            setStep((s) => s + 1);
          }
        } else {
          setShake(20);
        }
        return r;
      },
      abort: () => finish("aborted"),
    });
  }, [params, step, onHandleReady, finish, skillId]);

  return (
    <MiniStage>
      {/* The friendly little monster you befriend by skip-counting spells. */}
      <group ref={goblinRef} position={GOBLIN_POS}>
        <group ref={scaleRef}>
          <GltfModel src={GOBLIN_GLB} height={2.6} rotation={[0, Math.PI, 0]} />
        </group>
        <BlobShadow radius={1.1} opacity={0.34} position={[0, 0.02, 0]} />
        {/* Gentle ambient sparkles around it. */}
        <Sparkles count={10} scale={2.2} position={[0, 1.4, 0]} size={3} speed={0.3} color={PALETTE.gold} opacity={0.6} />
      </group>

      {/* The active spell (remounts on each correct answer). */}
      <SpellHit key={castKey} />

      {/* Befriend poof on defeat: a shower of stars + hearts where it stood. */}
      {defeated && (
        <Float speed={3} floatIntensity={1.2} position={[GOBLIN_POS[0], 1.6, GOBLIN_POS[2]]}>
          <Sparkles count={40} scale={3} size={8} speed={1} color={PALETTE.gold} />
        </Float>
      )}
    </MiniStage>
  );
}
