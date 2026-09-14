// server/src/rescue.ts — the soft-edge safety net. When the child keeps missing a
// topic, we don't just ease the numbers — we step DOWN the graph to a prerequisite
// (hard or soft) he can win at, rebuild confidence, and let the selector bring him
// back. Never a gate; always a ladder down.
import type { Topic } from "@institute/shared";
import type { MasteryLite } from "./select.ts";

/** The topic to fall back to when the child keeps missing `topic`, or null. */
export function rescueTopic(topic: Topic, mastery: MasteryLite[], all: Topic[]): Topic | null {
  const byId = new Map(all.map((t) => [t.id, t]));
  // Help-prereqs first: they are the remediation ladder (hand-authored ones lead
  // the list). Hard prereqs are unlock gates and only a fallback. Stepping a
  // child who cannot halve 158 down to "9 divided by 3" helps nobody.
  const candidates = [...(topic.helpPrereqs ?? []), ...topic.prereqs]
    .map((id) => byId.get(id))
    .filter((t): t is Topic => !!t);
  if (candidates.length === 0) return null;
  const mastered = new Set(mastery.filter((m) => m.state === "mastered").map((m) => m.topicId));
  return candidates.find((t) => mastered.has(t.id)) ?? candidates[0];
}
