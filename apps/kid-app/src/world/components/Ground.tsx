// apps/kid-app/src/world/components/Ground.tsx
// Stylized ground: a subdivided disc with a radial vertex-color gradient
// (warm light green at center → deeper green at the rim) and flat shading.
// The perimeter is a warm beveled rock ring instead of dark flat walls.
import { useMemo } from "react";
import { BufferAttribute, CircleGeometry, Color } from "three";
import { RoundedBox } from "@react-three/drei/native";
import { PALETTE, flatStandard } from "../theme";

const GROUND_RADIUS = 16;

function useGroundGeometry() {
  return useMemo(() => {
    // Disc, subdivided enough that the flat-shaded facets read as a soft
    // low-poly field but cheap on tris.
    const geo = new CircleGeometry(GROUND_RADIUS, 48);
    geo.rotateX(-Math.PI / 2);

    const center = new Color(PALETTE.grassCenter);
    const edge = new Color(PALETTE.grassEdge);
    const pos = geo.attributes.position!;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.min(1, Math.sqrt(x * x + z * z) / GROUND_RADIUS);
      // ease toward the edge so the center stays bright and inviting
      const t = r * r;
      c.copy(center).lerp(edge, t);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new BufferAttribute(colors, 3));
    return geo;
  }, []);
}

// A ring of chunky rounded rock blocks around the rim, each tipped a little
// so the perimeter reads as a natural low-poly cliff edge.
const CLIFF_COUNT = 16;
const CLIFF_RADIUS = GROUND_RADIUS + 0.2;

function CliffRing() {
  const blocks = useMemo(() => {
    return Array.from({ length: CLIFF_COUNT }, (_, i) => {
      const a = (i / CLIFF_COUNT) * Math.PI * 2;
      const x = Math.cos(a) * CLIFF_RADIUS;
      const z = Math.sin(a) * CLIFF_RADIUS;
      // alternate height + slight tilt for an organic silhouette
      const h = 1.6 + (i % 3) * 0.4;
      const tilt = ((i % 2 === 0 ? 1 : -1) * 0.08) + Math.sin(i) * 0.04;
      const dark = i % 2 === 0;
      return { x, z, a, h, tilt, dark };
    });
  }, []);

  return (
    <>
      {blocks.map((b, i) => (
        <RoundedBox
          key={i}
          args={[7, b.h, 2.4]}
          radius={0.35}
          smoothness={3}
          position={[b.x, b.h / 2 - 0.9, b.z]}
          // face the block toward the center, then tip it outward a touch
          rotation={[b.tilt, -b.a + Math.PI / 2, 0]}
        >
          <meshStandardMaterial
            {...flatStandard(b.dark ? PALETTE.cliffRockDark : PALETTE.cliffRock, {
              roughness: 0.95,
            })}
          />
        </RoundedBox>
      ))}
    </>
  );
}

export function Ground() {
  const geometry = useGroundGeometry();
  return (
    <>
      <mesh geometry={geometry} receiveShadow={false}>
        <meshStandardMaterial vertexColors flatShading roughness={0.95} metalness={0} />
      </mesh>
      <CliffRing />
    </>
  );
}
