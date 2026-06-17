import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { isMusicMuted, toggleMusicMuted } from "../audio/sfx";

/** Tiny always-on toggle to mute/unmute the background music bed. */
export function MusicButton() {
  const [muted, setMuted] = useState(isMusicMuted());
  return (
    <Pressable
      onPress={() => setMuted(toggleMusicMuted())}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      accessibilityLabel={muted ? "Unmute music" : "Mute music"}
    >
      <Text style={styles.label}>{muted ? "🔇" : "🎵"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    top: 16,
    left: 64,
    width: 40,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  btnPressed: { backgroundColor: "rgba(255,255,255,0.25)" },
  label: { fontSize: 20, lineHeight: 24 },
});
