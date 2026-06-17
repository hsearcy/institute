import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DailyQuest } from "@institute/progression";

export function QuestPanel({ quest, onPlay }: { quest: DailyQuest; onPlay?: () => void }) {
  if (quest.status === "complete") {
    return (
      <View style={[styles.card, styles.cardComplete]}>
        <Text style={styles.completeText}>Quest Complete! 🎉</Text>
      </View>
    );
  }

  const ratio = quest.targetCount > 0 ? quest.completedCount / quest.targetCount : 0;
  const pct = Math.max(0, Math.min(1, ratio)) * 100;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>Today's Quest</Text>
        <Text style={styles.count}>
          {quest.completedCount} / {quest.targetCount} ⭐
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
      <Pressable style={styles.playButton} onPress={onPlay} hitSlop={8}>
        <Text style={styles.playText}>Play!</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    width: 280,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cardComplete: {
    backgroundColor: "#e9fbe9",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2b2b2b",
  },
  count: {
    fontSize: 16,
    fontWeight: "800",
    color: "#5b2ea0",
  },
  barTrack: {
    height: 14,
    borderRadius: 7,
    backgroundColor: "#eee",
    overflow: "hidden",
    marginBottom: 12,
  },
  barFill: {
    height: "100%",
    borderRadius: 7,
    backgroundColor: "#2bb3a3",
  },
  playButton: {
    backgroundColor: "#ff6b5e",
    borderRadius: 16,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  playText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },
  completeText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#2e8b2e",
    paddingVertical: 6,
  },
});
