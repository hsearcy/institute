import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

type Props = { active: boolean };

export function MicIcon({ active }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) return null;
  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.dot, { transform: [{ scale: pulse }] }]} />
      <Text style={styles.label}>🎤</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    width: 64, height: 64,
  },
  dot: {
    position: "absolute",
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(176,124,240,0.4)",
  },
  label: { fontSize: 28 },
});
