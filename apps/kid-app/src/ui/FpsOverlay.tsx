import { StyleSheet, Text, View } from "react-native";

export function FpsOverlay({ fps }: { fps: number }) {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>{fps} FPS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  text: { color: "#0f0", fontFamily: "Courier", fontSize: 12, fontWeight: "700" },
});
