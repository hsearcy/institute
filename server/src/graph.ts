// server/src/graph.ts — pure unlock/frontier computation over the curated graph.
import type { Topic } from "@institute/shared";

/** Topics whose hard prereqs are ALL mastered (roots are always unlocked). */
export function unlockedTopics(topics: Topic[], mastered: Set<string>): Topic[] {
  return topics.filter((t) => t.prereqs.every((p) => mastered.has(p)));
}

/** Unlocked topics still being learned — where new problems come from. */
export function frontierTopics(topics: Topic[], mastered: Set<string>): Topic[] {
  return unlockedTopics(topics, mastered).filter((t) => !mastered.has(t.id));
}
