import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  candidates: [number, number];
  onPick: (n: number) => void;
  onNeither: () => void;
};

export function Confirmation({ candidates, onPick, onNeither }: Props) {
  const [a, b] = candidates;
  return (
    <View style={styles.overlay}>
      <Text style={styles.q}>Did you say…</Text>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => onPick(a)}><Text style={styles.label}>{a}</Text></Pressable>
        <Pressable style={styles.btn} onPress={() => onPick(b)}><Text style={styles.label}>{b}</Text></Pressable>
      </View>
      <Pressable style={styles.neither} onPress={onNeither}><Text style={styles.neitherLabel}>Neither — try again</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 90, left: 16, right: 16,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 12, padding: 16, alignItems: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  q: { color: "#fff", fontSize: 18, marginBottom: 12 },
  row: { flexDirection: "row", gap: 16, marginBottom: 12 },
  btn: {
    width: 80, height: 80, borderRadius: 12, backgroundColor: "rgba(176,124,240,0.6)",
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff",
  },
  label: { color: "#fff", fontSize: 32, fontWeight: "700" },
  neither: { paddingVertical: 6, paddingHorizontal: 12 },
  neitherLabel: { color: "#fff", textDecorationLine: "underline" },
});
