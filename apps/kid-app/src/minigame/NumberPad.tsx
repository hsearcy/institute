import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onPress: (n: number) => void;
};

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function NumberPad({ onPress }: Props) {
  return (
    <View style={styles.row}>
      {NUMBERS.map((n) => (
        <Pressable
          key={n}
          onPress={() => onPress(n)}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.label}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  btn: {
    flex: 1,
    marginHorizontal: 3,
    aspectRatio: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  btnPressed: { backgroundColor: "rgba(176,124,240,0.8)" },
  label: { color: "#fff", fontSize: 22, fontWeight: "700" },
});
