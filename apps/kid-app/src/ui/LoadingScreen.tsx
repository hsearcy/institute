import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#222" />
      <Text style={styles.text}>Loading the world…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#7ec0ee",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { marginTop: 12, color: "#222", fontSize: 16, fontWeight: "600" },
});
