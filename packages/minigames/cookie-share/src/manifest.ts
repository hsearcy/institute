import { z } from "zod";
import type { Manifest } from "@institute/plugin-engine";

export const CookieShareParams = z.object({
  /**
   * Each round is an equal-sharing problem: "Share `cookies` cookies equally
   * among `friends` friends — how many each?" `answer` must equal
   * cookies / friends and must be a whole number (rounds divide evenly).
   */
  rounds: z
    .array(
      z.object({
        cookies: z.number().int().positive(),
        friends: z.number().int().positive(),
        answer: z.number().int().nonnegative(),
      }),
    )
    .nonempty(),
  /** Tutor-spoken intro line (M2 renders as on-screen text). */
  intro: z.string().min(1),
  /** Sequence of correct answers, in order — one per round, for the voice layer. */
  sequence: z.array(z.number().int().nonnegative()).nonempty(),
});
export type CookieShareParams = z.infer<typeof CookieShareParams>;

export const manifest: Manifest<CookieShareParams> = {
  id: "cookie-share",
  title: "Cookie Share",
  supportedSkills: ["counting", "equal_sharing", "beginning_division"],
  paramSchema: CookieShareParams,
};
