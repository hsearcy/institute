// A cute face (eyes + shine + mouth) shared across minigames so every character
// reads in the same friendly toy-block style. Geometry-only → native-safe.
// Position it on the front (+Z) of a host shape; `size` scales the features to
// the host (≈ the host's facing dimension).
type Props = {
  size?: number;
  position?: [number, number, number];
  /** "happy" = smile, "excited" = open O mouth (e.g. mid-celebration). */
  mood?: "happy" | "excited";
  cheeks?: boolean;
};

export function Face({ size = 1, position, mood = "happy", cheeks = false }: Props) {
  const ex = size * 0.2;
  const ey = size * 0.08;
  const er = size * 0.11;
  return (
    <group position={position}>
      {[-ex, ex].map((x, i) => (
        <group key={i} position={[x, ey, 0]}>
          <mesh>
            <sphereGeometry args={[er, 14, 14]} />
            <meshStandardMaterial color="#ffffff" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, er * 0.55]}>
            <sphereGeometry args={[er * 0.52, 12, 12]} />
            <meshStandardMaterial color="#2a2a33" roughness={0.3} />
          </mesh>
          <mesh position={[er * 0.22, er * 0.28, er * 0.8]}>
            <sphereGeometry args={[er * 0.2, 8, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
      {cheeks &&
        [-ex * 1.25, ex * 1.25].map((x, i) => (
          <mesh key={`c${i}`} position={[x, -size * 0.04, size * 0.02]}>
            <sphereGeometry args={[size * 0.085, 10, 10]} />
            <meshStandardMaterial color="#ff9db0" transparent opacity={0.55} roughness={0.6} />
          </mesh>
        ))}
      {mood === "happy" ? (
        <mesh position={[0, -size * 0.12, 0]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[size * 0.15, size * 0.028, 8, 18, Math.PI]} />
          <meshStandardMaterial color="#2a2a33" roughness={0.4} />
        </mesh>
      ) : (
        <mesh position={[0, -size * 0.13, size * 0.01]}>
          <sphereGeometry args={[size * 0.1, 14, 14]} />
          <meshStandardMaterial color="#6b2b3a" roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}
