export function Hero() {
  return (
    <group position={[0, 0, 0]}>
      {/* legs */}
      <mesh position={[-0.18, 0.4, 0]}>
        <boxGeometry args={[0.18, 0.8, 0.2]} />
        <meshStandardMaterial color="#2c5aa0" />
      </mesh>
      <mesh position={[0.18, 0.4, 0]}>
        <boxGeometry args={[0.18, 0.8, 0.2]} />
        <meshStandardMaterial color="#2c5aa0" />
      </mesh>
      {/* body */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.55, 0.85, 0.3]} />
        <meshStandardMaterial color="#d63b3b" />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.85, 0]}>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshStandardMaterial color="#f4c28c" />
      </mesh>
    </group>
  );
}
