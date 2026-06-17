import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onPress: (n: number) => void;
};

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Cheerful per-key colors so the pad reads as candy, not a debug keypad.
const COLORS = [
  "#ff6b6b", "#ff922b", "#fcc419", "#94d82d", "#20c997",
  "#4dabf7", "#5c7cfa", "#9775fa", "#f06595", "#ff8787",
];

export function NumberPad({ onPress }: Props) {
  return (
    <View style={styles.row}>
      {NUMBERS.map((n, i) => (
        <Pressable
          key={n}
          onPress={() => onPress(n)}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: COLORS[i] },
            pressed && styles.btnPressed,
          ]}
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
    bottom: 20,
    left: 18,
    right: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  btn: {
    flex: 1,
    marginHorizontal: 4,
    aspectRatio: 1,
    maxHeight: 92,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    // Chunky toy-button: a darker bottom lip + drop shadow gives 3D depth.
    borderBottomWidth: 6,
    borderBottomColor: "rgba(0,0,0,0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // Press it "in": drop the lip and nudge down.
  btnPressed: {
    borderBottomWidth: 1,
    transform: [{ translateY: 4 }, { scale: 0.96 }],
    shadowOpacity: 0.1,
  },
  label: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.28)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
});
