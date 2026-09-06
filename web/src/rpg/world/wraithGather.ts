import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
const cache = new WeakMap<BufferGeometry, BufferGeometry>();

/** Bend cloth around a continuous centerline; retain length instead of compressing height. */
export function bendWraithPoint(point: Vector3, hem: number, height: number): number {
  const hinge = hem + height * .16, radius = height * .84 / 1.65;
  const angle = Math.max(0, point.y - hinge) / radius;
  if (!angle) return 0;
  const z = point.z;
  point.y = hinge + radius * Math.sin(angle) - z * Math.sin(angle);
  point.z = radius * (1 - Math.cos(angle)) + z * Math.cos(angle);
  point.x -= .07 * Math.sin(angle);
  return angle;
}

/** Authored cloth gathering target; hem stays fixed while upper cloth folds. */
export function wraithGatherGeometry(source: BufferGeometry, envelope?: { hem: number; height: number }): BufferGeometry {
  const cached = cache.get(source); if (cached) return cached;
  const geometry = source.clone(), position = source.getAttribute('position');
  source.computeBoundingBox();
  const box = source.boundingBox!, hem = envelope?.hem ?? box.min.y, height = envelope?.height ?? box.max.y - hem;
  const bent = new Vector3();
  const delta = new Float32Array(position.count * 3), target = source.clone(), targetPosition = target.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    bendWraithPoint(bent.set(x, y, z), hem, height);
    delta.set([bent.x - x, bent.y - y, bent.z - z], i * 3); targetPosition.setXYZ(i, bent.x, Math.max(hem, bent.y), bent.z);
    delta[i * 3 + 1] = targetPosition.getY(i) - y;
  }
  target.computeVertexNormals();
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal'), targetNormal = target.getAttribute('normal'), normalDelta = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) for (let axis = 0; axis < 3; axis++) normalDelta[i * 3 + axis] = targetNormal.getComponent(i, axis) - normal.getComponent(i, axis);
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new Float32BufferAttribute(delta, 3)];
  geometry.morphAttributes.normal = [new Float32BufferAttribute(normalDelta, 3)];
  geometry.userData.wraithGather = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  target.dispose(); cache.set(source, geometry); return geometry;
}
