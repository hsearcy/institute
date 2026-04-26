// apps/kid-app/src/world/components/Decor.tsx

const TREES: ReadonlyArray<readonly [number, number, number]> = [
  [-8, 0, -10], [-6, 0, 8], [10, 0, -8],
  [12, 0, 6], [-12, 0, 2], [9, 0, 11],
];

const ROCKS: ReadonlyArray<readonly [number, number, number]> = [
  [-4, 0, 9], [7, 0, 4], [-9, 0, -4],
];

function Tree({ position }: { position: readonly [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 1.2, 6]} />
        <meshStandardMaterial color="#6b3f1d" />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <coneGeometry args={[0.9, 1.6, 6]} />
        <meshStandardMaterial color="#2f7d32" />
      </mesh>
    </group>
  );
}

function Rock({ position }: { position: readonly [number, number, number] }) {
  return (
    <mesh position={[position[0], 0.25, position[2]]}>
      <icosahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#8a8a8a" flatShading />
    </mesh>
  );
}

export function Decor() {
  return (
    <>
      {TREES.map((p, i) => <Tree key={`t${i}`} position={p} />)}
      {ROCKS.map((p, i) => <Rock key={`r${i}`} position={p} />)}
    </>
  );
}
