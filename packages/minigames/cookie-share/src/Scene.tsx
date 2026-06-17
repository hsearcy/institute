import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber/native";
import { RoundedBox, Float, Sparkles } from "@react-three/drei/native";
import type { Group } from "three";
import type { SceneProps, AttemptOutcome } from "@institute/plugin-engine";
import { MiniStage, BlobShadow, flatStandard } from "@institute/minigame-kit";
import type { CookieShareParams } from "./manifest.ts";
import { evaluate } from "./evaluate.ts";

/**
 * Imperative interface the kid-app's NumberPad uses to drive the round.
 * Exposed via `onHandleReady` on mount; the App-level MiniGameMount captures
 * it to wire taps from the RN NumberPad UI to the Scene's evaluate-and-advance
 * logic.
 *
 * Why not React context: Scene runs inside the R3F render tree; NumberPad runs
 * inside the RN UI tree. They don't share a React subtree. A small imperative
 * bridge is the simplest correct shape and isolates the coupling to two
 * well-named callbacks.
 */
export type CookieShareSceneHandle = {
  /** Called with a number when the kid taps a button. Returns the EvaluateResult for any UI feedback. */
  submitAnswer: (answer: number) => { correct: boolean; expected: number; isLastStep: boolean };
  /** Called when the kid taps the back button. */
  abort: () => void;
};

type Props = SceneProps<CookieShareParams> & {
  /** Bridge for the RN NumberPad / BackButton to talk to the Scene. */
  onHandleReady?: (h: CookieShareSceneHandle) => void;
};

const FRIEND_COLORS = ["#ff8fb0", "#6fe6ff", "#ffd84a", "#8fd16b", "#c79bff", "#ffa552"];

const COOKIE_RADIUS = 0.42;
const PILE_Z = -1.8; // tray in the open field clearly behind the friends (no overlap, fully visible)
const PILE_Y = 0.3; // cookies rest on the tray surface

/** Warm rounded choc-chip cookie disc, sized to read clearly and be countable. */
function Cookie({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={[scale, scale, scale]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[COOKIE_RADIUS, COOKIE_RADIUS, 0.16, 22]} />
        <meshStandardMaterial {...flatStandard("#c98a4b", { roughness: 0.7 })} />
      </mesh>
      {[
        [0.16, 0.11],
        [-0.13, 0.17],
        [0.07, -0.2],
        [-0.19, -0.08],
        [0.21, -0.05],
        [0.0, 0.02],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x!, y!, 0.09]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial {...flatStandard("#5a3a1f", { roughness: 0.7 })} />
        </mesh>
      ))}
    </group>
  );
}

/** Pale rounded plate disc. */
function Plate() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <cylinderGeometry args={[0.55, 0.5, 0.08, 24]} />
      <meshStandardMaterial {...flatStandard("#f0ead8", { roughness: 0.7 })} />
    </mesh>
  );
}

/** Cute low-poly friend: rounded body + head + dot eyes, in a cheerful color. */
function Friend({ color }: { color: string }) {
  return (
    <group>
      <RoundedBox args={[0.7, 0.8, 0.6]} radius={0.18} smoothness={3} position={[0, 0.4, 0]}>
        <meshStandardMaterial {...flatStandard(color, { roughness: 0.7 })} />
      </RoundedBox>
      <mesh position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.34, 18, 18]} />
        <meshStandardMaterial {...flatStandard(color, { roughness: 0.7 })} />
      </mesh>
      <mesh position={[-0.12, 1.04, 0.3]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.7} metalness={0} />
      </mesh>
      <mesh position={[0.12, 1.04, 0.3]}>
        <sphereGeometry args={[0.06, 10, 10]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}

export function Scene({ params, onComplete, onHandleReady, skillId }: Props) {
  const [step, setStep] = useState(0);
  // 0 = cookies sitting in the pile, 1 = fully distributed onto plates.
  const [share, setShare] = useState(0);
  const shareTargetRef = useRef(0);
  const [shake, setShake] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const startedAtRef = useRef(Date.now());
  const outcomesRef = useRef<AttemptOutcome[]>([]);

  const pileRef = useRef<Group>(null);
  const stageRef = useRef<Group>(null);

  const round = params.rounds[Math.min(step, params.rounds.length - 1)]!;
  const { cookies, friends, answer } = round;

  // Friend x-positions, centered around 0.
  const friendXs = useMemo(() => {
    const spacing = 2.0;
    return Array.from({ length: friends }, (_, i) => (i - (friends - 1) / 2) * spacing);
  }, [friends]);

  // Where each pile cookie ends up: friend i gets `answer` cookies on its plate,
  // arranged in a small spiral so a stack reads clearly.
  const targets = useMemo(() => {
    const out: { x: number; y: number; z: number }[] = [];
    for (let f = 0; f < friends; f++) {
      const fx = friendXs[f] ?? 0;
      for (let c = 0; c < answer; c++) {
        const ang = c * 2.4;
        const rad = c === 0 ? 0 : 0.22;
        out.push({
          x: fx + Math.cos(ang) * rad,
          y: 0.16 + c * 0.16,
          z: 1.6 + Math.sin(ang) * rad,
        });
      }
    }
    return out;
  }, [friends, answer, friendXs]);

  // Pile (start) position for each cookie: a neat little stack of clearly
  // separated rows near the centre, so a kid can read & count individual
  // cookies instead of seeing one brown blob. Rows of up to 4, gently
  // overlapping like a real stack of cookies.
  const sources = useMemo(() => {
    const perRow = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(cookies))));
    const spacing = COOKIE_RADIUS * 1.9; // > radius so discs read individually
    const rows = Math.ceil(cookies / perRow);
    return Array.from({ length: cookies }, (_, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = Math.min(perRow, cookies - row * perRow);
      const x = (col - (rowCount - 1) / 2) * spacing;
      // A single readable layer on a tray in the foreground (centered around
      // PILE_Z), so a kid sees and counts individual cookies — no brown blob.
      const z = PILE_Z - (row - (rows - 1) / 2) * spacing;
      const y = PILE_Y;
      return { x, y, z };
    });
  }, [cookies]);

  const cookieRefs = useRef<(Group | null)[]>([]);

  // Reset distribution + refs whenever the round changes.
  useEffect(() => {
    setShare(0);
    shareTargetRef.current = 0;
    setCelebrate(false);
    cookieRefs.current = cookieRefs.current.slice(0, cookies);
  }, [step, cookies]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Ease the share fraction toward its target.
    setShare((s) => {
      const target = shareTargetRef.current;
      const next = s + (target - s) * 0.08;
      return Math.abs(target - next) < 0.001 ? target : next;
    });

    // Gentle pile bob.
    if (pileRef.current) pileRef.current.position.y = Math.sin(t * 1.4) * 0.04;

    // Wrong-answer wobble on the whole stage.
    if (stageRef.current) {
      stageRef.current.rotation.z = shake > 0 ? Math.sin(t * 40) * 0.03 : 0;
      if (shake > 0) setShake((sh) => Math.max(0, sh - 1));
    }

    // Animate each cookie from its pile source toward its plate target.
    const k = share * share * (3 - 2 * share); // smoothstep
    for (let i = 0; i < cookies; i++) {
      const m = cookieRefs.current[i];
      if (!m) continue;
      const src = sources[i]!;
      const dst = targets[i] ?? src;
      m.position.x = src.x + (dst.x - src.x) * k;
      m.position.z = src.z + (dst.z - src.z) * k;
      // Arc upward at mid-flight so cookies hop onto the plates.
      const arc = Math.sin(Math.min(1, share) * Math.PI) * 0.9 * (targets[i] ? 1 : 0);
      m.position.y = src.y + (dst.y - src.y) * k + arc;
      m.rotation.y = t * 0.5 + i;
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
      submitAnswer: (ans: number) => {
        const r = evaluate(params, step, ans);
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
          shareTargetRef.current = 1; // trigger the share-out animation
          setCelebrate(true);
          if (r.isLastStep) {
            // Let the share-out + sparkles play before closing the round.
            setTimeout(() => finish("completed"), 1400);
          } else {
            // Hold on the satisfying distribution, then advance to next round.
            setTimeout(() => setStep((s) => s + 1), 1400);
          }
        } else {
          setShake(20); // ~20 frames of wobble at 60fps ≈ 333ms
        }
        return r;
      },
      abort: () => finish("aborted"),
    });
  }, [params, step, onHandleReady, finish, skillId]);

  return (
    <MiniStage>
      <group ref={stageRef}>
        {/* Friends + their plates, each grounded with a kit blob shadow. */}
        {friendXs.map((fx, i) => (
          <group key={i} position={[fx, 0, 2.6]}>
            <BlobShadow radius={0.7} opacity={0.32} position={[0, 0.02, -0.9]} />
            <Float speed={1.6} rotationIntensity={0.15} floatIntensity={0.35}>
              <group position={[0, 0, -1.0]}>
                <Friend color={FRIEND_COLORS[i % FRIEND_COLORS.length]!} />
              </group>
            </Float>
            <BlobShadow radius={0.62} opacity={0.3} position={[0, 0.03, 0]} />
            <Plate />
          </group>
        ))}

        {/* Foreground tray holding the cookies to share — clearly grounded and
            countable, sitting in front of the friends. */}
        <group position={[0, 0, PILE_Z]}>
          <BlobShadow radius={2.1} opacity={0.32} />
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[1.9, 2.0, 0.16, 28]} />
            <meshStandardMaterial {...flatStandard("#caa46a", { roughness: 0.7 })} />
          </mesh>
        </group>
        <group ref={pileRef} position={[0, 0, 0]}>
          {Array.from({ length: cookies }).map((_, i) => (
            <group
              key={i}
              ref={(m) => {
                cookieRefs.current[i] = m;
              }}
              position={[sources[i]!.x, sources[i]!.y, sources[i]!.z]}
            >
              <Cookie />
            </group>
          ))}
        </group>

        {/* Celebration sparkles over the table when a share completes. */}
        {celebrate && (
          <Sparkles
            count={30}
            scale={[friendXs.length * 2 + 1, 1.5, 3]}
            position={[0, 1.2, 1.8]}
            size={4}
            speed={0.4}
            color="#fff1b8"
          />
        )}
      </group>
    </MiniStage>
  );
}
