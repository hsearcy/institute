// server/src/tts.test.ts
import { describe, expect, test } from "bun:test";
import { ttsText, spokenForm, speechSimilarity, GARBLE_FLOOR } from "./tts.ts";

describe("ttsText", () => {
  test("em and en dashes become commas (they flip the multilingual model)", () => {
    expect(ttsText("Not yet — take another look!")).toBe("Not yet, take another look!");
    expect(ttsText("So close – check again.")).toBe("So close, check again.");
  });
  test("ordinary text is untouched", () => {
    expect(ttsText("You got it!")).toBe("You got it!");
  });
});

// The garble check compares what we SENT with what the voice actually SAID.
// Both sides are reduced to plain spoken words first, because the transcriber
// writes "74" as "seventy four" and "+" as "plus".
describe("spokenForm", () => {
  test("numbers become words", () => {
    expect(spokenForm("The answer is 74.")).toBe("the answer is seventy four");
  });
  test("math symbols become words", () => {
    expect(spokenForm("Add the tens first (40 + 30), then the ones.")).toBe(
      "add the tens first forty plus thirty then the ones",
    );
  });
  test("punctuation and case do not matter", () => {
    expect(spokenForm("Count on: 9, and one more!")).toBe(spokenForm("count on nine and one more"));
  });
});

describe("speechSimilarity", () => {
  const sent = "Ooh, a tricky gem! The answer is 74. Add the tens first (40 + 30), then the ones.";

  test("a faithful take scores at the top", () => {
    const heard = "Oh, a tricky gem. The answer is seventy four. Add the tens first, forty plus thirty, then the ones.";
    expect(speechSimilarity(sent, heard)).toBeGreaterThan(GARBLE_FLOOR);
  });
  test("a stray inserted word still passes", () => {
    const heard = "Oh, a tricky gem. The answer is seventy four. Add the tens first, forty plus thirty, say, then the ones.";
    expect(speechSimilarity(sent, heard)).toBeGreaterThan(GARBLE_FLOOR);
  });
  test("a take that flips language is rejected", () => {
    expect(speechSimilarity(sent, "Una gema complicada. La respuesta es setenta y cuatro.")).toBeLessThan(GARBLE_FLOOR);
  });
  test("a take that drops most of the line is rejected", () => {
    expect(speechSimilarity(sent, "Ooh, a tricky gem.")).toBeLessThan(GARBLE_FLOOR);
  });
  test("empty audio is rejected", () => {
    expect(speechSimilarity(sent, "")).toBe(0);
  });
  test("word order matters — a scrambled take is rejected", () => {
    expect(speechSimilarity("one two three four five six", "six five four three two one")).toBeLessThan(GARBLE_FLOOR);
  });
});
