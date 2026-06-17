import { Pressable, StyleSheet, Text, View } from "react-native";

export function Hud({
  gems,
  streak,
  onOpenShop,
}: {
  gems: number;
  streak: number;
  onOpenShop: () => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>💎 {gems}</Text>
      </View>
      <View style={[styles.pill, styles.streakPill]}>
        <Text style={styles.pillText}>🔥 {streak}</Text>
      </View>
      <Pressable style={styles.closet} onPress={onOpenShop} hitSlop={8}>
        <Text style={styles.closetText}>🎒 Closet</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    backgroundColor: "#ffffff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    minHeight: 44,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  streakPill: {
    backgroundColor: "#fff1e6",
  },
  pillText: {
    color: "#2b2b2b",
    fontSize: 18,
    fontWeight: "800",
  },
  closet: {
    backgroundColor: "#5b2ea0",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    minHeight: 44,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  closetText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
