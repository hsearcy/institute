import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Institute</Text>
      <Text style={styles.subtitle}>Hub coming online…</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#7ec0ee",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 32, fontWeight: "700", color: "#222" },
  subtitle: { fontSize: 16, color: "#222", marginTop: 8 },
});
