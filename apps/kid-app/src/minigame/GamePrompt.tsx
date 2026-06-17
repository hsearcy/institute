// Top-center task banner so a kid always knows what to do — the game must be
// playable without relying on the spoken voice intro. Updated per step by App.
import { StyleSheet, Text, View } from "react-native";

export function GamePrompt({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 18,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 22,
    maxWidth: "86%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    borderWidth: 3,
    borderColor: "#ffd84a",
  },
  text: {
    color: "#3a2c5a",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
});
