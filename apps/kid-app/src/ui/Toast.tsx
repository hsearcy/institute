import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

export function Toast({ message, onHide }: { message: string; onHide: () => void }) {
  // `useAnimatedValue` isn't in react-native-web 0.21; this is the cross-version form.
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [message]);

  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: "rgba(34,34,34,0.85)",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  text: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
