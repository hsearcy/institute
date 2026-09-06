import { Group, Matrix4, Mesh, Object3D } from 'three';

// Measured against the accepted authored hero (rig_authored_hero.py).
// Items use +Y toward the tip and +Z for the presentation face. The source
// sword has a rolled blade, so translation or a single 90-degree turn is wrong.
export function authoredHeroGrip(): Matrix4 {
  return new Matrix4().fromArray([
    .3673559425, .8642477551, -.3436944424, 0,
    -.7229649200, .0328620800, -.6901027200, 0,
    -.5851251902, .5019923704, .6368926200, 0,
    -.03460448, .16085970, -.04303135, 1,
  ]);
}

/** A rigid item follows its measured palm socket through every animation.
 * Geometry, textures and materials remain owned by the source asset cache.
 */
export class HeldEquipment {
  private mounted?: Group;
  private readonly embedded: { mesh: Mesh; visible: boolean }[] = [];

  constructor(private readonly hero: Object3D, private readonly hand: Object3D, private readonly socket: Matrix4) {}

  /** Invalid candidates leave the currently equipped model intact. */
  replace(source?: Object3D): boolean {
    if (!source) { this.clear(); return true; }
    const clone = source.clone(true);
    let grip: Object3D | undefined;
    let metadata: Object3D | undefined;
    clone.traverse(node => {
      if (node.userData.attachment === 'hand.R' && typeof node.userData.itemId === 'string') metadata = node;
      if (node.userData.attachmentRole === 'Grip') grip = node;
    });
    if (!metadata) return false;
    grip ??= clone.getObjectByName(metadata.userData.gripNode);
    if (!grip) return false;
    clone.updateMatrixWorld(true);
    const transform = grip.matrixWorld;
    if (!transform.elements.every(Number.isFinite) || Math.abs(transform.determinant()) < 1e-8) return false;
    const mount = new Group(); mount.name = 'HeldEquipment';
    mount.userData.itemId = metadata.userData.itemId;
    mount.matrixAutoUpdate = false;
    mount.matrix.copy(this.socket).multiply(transform.clone().invert());
    mount.add(clone);
    this.clear();
    this.hero.traverse(node => {
      if (node instanceof Mesh && node.userData.sourcePart === 'equipped_sword') {
        this.embedded.push({ mesh: node, visible: node.visible }); node.visible = false;
      }
    });
    this.hand.add(mount); this.mounted = mount;
    return true;
  }

  clear(): void {
    this.mounted?.removeFromParent(); this.mounted = undefined;
    for (const { mesh, visible } of this.embedded) mesh.visible = visible;
    this.embedded.length = 0;
  }

  get itemId(): string | undefined { return this.mounted?.userData.itemId; }
}
