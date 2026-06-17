// A full-screen, non-interactive juice layer driven by a single event. Because
// every minigame answer (number-pad OR voice) funnels through one wrapped
// submitAnswer handle, this gives correct/wrong/win feedback — a tinted screen
// flash plus an emoji particle burst — uniformly across all four games and the
// hub, with zero per-game wiring. Cross-platform via RN Animated (web + native).
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

export type FeedbackKind = "correct" | "wrong" | "win" | "collect";
export type FeedbackEvent = { id: number; kind: FeedbackKind } | null;

const FLASH_COLOR: Record<FeedbackKind, string> = {
  correct: "#5ad17a",
  wrong: "#ff6b6b",
  win: "#ffd84a",
  collect: "#6fe6ff",
};

const FLASH_PEAK: Record<FeedbackKind, number> = {
  correct: 0.28,
  wrong: 0.34,
  win: 0.42,
  collect: 0.2,
};

const BURST: Record<FeedbackKind, { glyphs: string[]; count: number } | null> = {
  correct: { glyphs: ["✨", "⭐", "💫"], count: 10 },
  win: { glyphs: ["⭐", "✨", "🎉", "💫", "🌟"], count: 22 },
  collect: { glyphs: ["💎", "✨"], count: 6 },
  wrong: null,
};

function Flash({ event }: { event: FeedbackEvent }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!event) return;
    a.setValue(0);
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: event.kind === "win" ? 520 : 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [event, a]);
  if (!event) return null;
  const peak = FLASH_PEAK[event.kind];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: FLASH_COLOR[event.kind], opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, peak] }) },
      ]}
    />
  );
}

function Particle({ glyph, angle, distance, delay, size, spin }: {
  glyph: string; angle: number; distance: number; delay: number; size: number; spin: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 900, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t, delay]);
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  return (
    <Animated.Text
      style={{
        position: "absolute",
        fontSize: size,
        opacity: t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy - 30] }) },
          { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 1.2, 0.9] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${spin}deg`] }) },
        ],
      }}
    >
      {glyph}
    </Animated.Text>
  );
}

function Burst({ event }: { event: NonNullable<FeedbackEvent> }) {
  const spec = BURST[event.kind];
  if (!spec) return null;
  const parts = Array.from({ length: spec.count }, (_, i) => {
    // deterministic-ish spread keyed off index so it reads as an even pop
    const angle = (i / spec.count) * Math.PI * 2 + (event.id % 7) * 0.3;
    const distance = 90 + ((i * 37) % 90) + (event.kind === "win" ? 60 : 0);
    return {
      glyph: spec.glyphs[i % spec.glyphs.length]!,
      angle,
      distance,
      delay: (i % 5) * 30,
      size: 22 + ((i * 13) % 16),
      spin: (i % 2 === 0 ? 1 : -1) * (120 + ((i * 29) % 180)),
    };
  });
  return (
    <View pointerEvents="none" style={styles.burstCenter}>
      {parts.map((p, i) => (
        <Particle key={`${event.id}-${i}`} {...p} />
      ))}
      {event.kind === "win" && <Text style={styles.winText}>Great job!</Text>}
    </View>
  );
}

export function FeedbackOverlay({ event }: { event: FeedbackEvent }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Flash event={event} />
      {/* Remount the burst on every event id so its entry animation replays. */}
      {event && <Burst key={event.id} event={event} />}
    </View>
  );
}

const styles = StyleSheet.create({
  burstCenter: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  winText: {
    position: "absolute",
    top: "32%",
    fontSize: 40,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
});
