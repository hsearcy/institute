// apps/kid-app/src/world/components/Ground.tsx
export function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
        <planeGeometry args={[30, 30, 1, 1]} />
        <meshStandardMaterial color="#5fa052" />
      </mesh>
      {/* Cliff perimeter — 4 dark walls flush with the ground edges */}
      {[
        { pos: [0, 1, -15] as const, size: [30, 2, 0.5] as const },
        { pos: [0, 1,  15] as const, size: [30, 2, 0.5] as const },
        { pos: [-15, 1, 0] as const, size: [0.5, 2, 30] as const },
        { pos: [ 15, 1, 0] as const, size: [0.5, 2, 30] as const },
      ].map((w, i) => (
        <mesh key={i} position={w.pos}>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color="#3a5a2c" />
        </mesh>
      ))}
    </>
  );
}
