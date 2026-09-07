import { Group, Matrix4, Mesh, Object3D, SkinnedMesh, Vector3 } from 'three';

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

export type ItemAttachment = 'hand.R' | 'head' | 'chest' | 'belt';
export interface EquipmentSocket { parent: Object3D; transform: Matrix4 }
export type EquipmentSockets = Partial<Record<Exclude<ItemAttachment, 'hand.R'>, EquipmentSocket>>;

/** Local frames on the authored rig. Wearables use an upright +Y axis and
 * +Z front, with the source Grip marker at the band center or suspension point.
 */
export function authoredHeroWearableSockets(hero: Object3D): EquipmentSockets {
  const sockets: EquipmentSockets = {};
  for (const [slot, bone, x, y, z] of [
    ['head', 'head', 0, .17, 0],
    ['chest', 'chest', 0, .27, .15],
    ['belt', 'pelvis', .18, .03, .13],
  ] as const) {
    const parent = hero.getObjectByName(bone);
    if (parent) sockets[slot] = { parent, transform: new Matrix4().makeTranslation(x, y, z) };
  }
  return sockets;
}

/** The three progression armors use the original eight-bone rig. Measured
 * from characters.py's forged grip midpoint after its authored body pose,
 * then transformed into arm.R space. Their sword meshes are separate parts.
 */
export function legacyHeroEquipment(hero: Object3D): HeldEquipment | undefined {
  const arm = hero.getObjectByName('armR');
  if (!arm) return undefined;
  const socket = new Matrix4().fromArray([
    .3810421550, .1253900453, .9160154817, 0,
    .9233177003, -.1029034613, -.3699937167, 0,
    .0478676146, .9867564482, -.1549854183, 0,
    -.0689967104, .3802823301, .0045418245, 1,
  ]);
  const wearables: EquipmentSockets = {};
  for (const [slot, name, x, y, z] of [
    ['head', 'head', -.035, .255, .018],
    ['chest', 'chest', -.035, .405, .28],
    ['belt', 'root', .18, 1.005, .17],
  ] as const) {
    const parent = hero.getObjectByName(name);
    if (parent) wearables[slot] = { parent, transform: new Matrix4().makeTranslation(x, y, z) };
  }
  hero.traverse(node => {
    if (node instanceof Mesh && /^Sword_(Baked|Glow)(?:\.|\d|$)/.test(node.name)) node.userData.sourcePart = 'equipped_sword';
  });
  return new HeldEquipment(hero, arm, socket, wearables);
}

/** A rigid item follows its measured palm socket through every animation.
 * Geometry, textures and materials remain owned by the source asset cache.
 */
export class HeldEquipment {
  private mounted?: Group;
  private grip?: Object3D;
  private tip?: Object3D;
  private embeddedBlade?: { grip: Vector3; tip: Vector3 };
  private readonly embedded: { mesh: Mesh; visible: boolean }[] = [];

  constructor(private readonly hero: Object3D, private readonly hand: Object3D, private readonly socket: Matrix4,
    private readonly wearableSockets: EquipmentSockets = {}) {
    // The authored embedded sword is rigidly weighted to the holding hand.
    // Measure its real distal vertex once; do not invent a length/axis for items
    // whose distinct replacement model has not been installed yet.
    hero.updateWorldMatrix(true, false); hero.updateMatrixWorld(true);
    const grip = new Vector3().setFromMatrixPosition(socket), point = new Vector3(), tip = new Vector3();
    const toHand = hand.matrixWorld.clone().invert(); let farthest = .25 ** 2;
    hero.traverse(node => {
      if (!(node instanceof SkinnedMesh) || node.userData.sourcePart !== 'equipped_sword') return;
      const indices = node.geometry.getAttribute('skinIndex'), weights = node.geometry.getAttribute('skinWeight'), positions = node.geometry.getAttribute('position');
      if (!indices || !weights || !positions) return;
      for (let i = 0; i < positions.count; i++) {
        let sum = 0;
        for (let component = 0; component < 4; component++) {
          const weight = weights.getComponent(i, component); sum += weight;
          if (weight > 1e-6 && node.skeleton.bones[indices.getComponent(i, component)] !== hand) return;
        }
        if (Math.abs(sum - 1) > .001) return;
      }
      for (let i = 0; i < positions.count; i++) {
        node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).applyMatrix4(toHand);
        const distance = point.distanceToSquared(grip);
        if (distance > farthest) { farthest = distance; tip.copy(point); }
      }
    });
    if (farthest > .25 ** 2) this.embeddedBlade = { grip, tip };
  }

  /** Invalid candidates leave the currently equipped model intact. */
  replace(source?: Object3D): boolean {
    if (!source) { this.clear(); return true; }
    const clone = source.clone(true);
    let grip: Object3D | undefined;
    let tip: Object3D | undefined;
    let metadata: Object3D | undefined;
    clone.traverse(node => {
      if (['hand.R', 'head', 'chest', 'belt'].includes(node.userData.attachment) && typeof node.userData.itemId === 'string') metadata = node;
      if (node.userData.attachmentRole === 'Grip') grip = node;
      if (node.userData.attachmentRole === 'Tip') tip = node;
    });
    if (!metadata) return false;
    const attachment = metadata.userData.attachment as ItemAttachment;
    const target = attachment === 'hand.R' ? { parent: this.hand, transform: this.socket } : this.wearableSockets[attachment];
    if (!target || !target.transform.elements.every(Number.isFinite) || Math.abs(target.transform.determinant()) < 1e-8) return false;
    grip ??= clone.getObjectByName(metadata.userData.gripNode);
    tip ??= clone.getObjectByName(metadata.userData.tipNode);
    if (!grip) return false;
    clone.updateMatrixWorld(true);
    const transform = grip.matrixWorld;
    if (!transform.elements.every(Number.isFinite) || Math.abs(transform.determinant()) < 1e-8) return false;
    const mount = new Group(); mount.name = 'HeldEquipment';
    mount.userData.itemId = metadata.userData.itemId;
    mount.userData.attachment = attachment;
    mount.matrixAutoUpdate = false;
    mount.matrix.copy(target.transform).multiply(transform.clone().invert());
    mount.add(clone);
    this.clear();
    if (attachment === 'hand.R') this.hero.traverse(node => {
      if (node instanceof Mesh && node.userData.sourcePart === 'equipped_sword') {
        this.embedded.push({ mesh: node, visible: node.visible }); node.visible = false;
      }
    });
    target.parent.add(mount); this.mounted = mount;
    // A worn relic augments the hero's embedded weapon. Its markers must never
    // turn a crown or pendant into the endpoints of the Cleave blade trail.
    if (attachment === 'hand.R') { this.grip = grip; this.tip = tip; }
    return true;
  }

  clear(): void {
    this.mounted?.removeFromParent(); this.mounted = undefined;
    this.grip = undefined; this.tip = undefined;
    for (const { mesh, visible } of this.embedded) mesh.visible = visible;
    this.embedded.length = 0;
  }

  get itemId(): string | undefined { return this.mounted?.userData.itemId; }

  /** Actual mounted endpoints, including the current hand pose and actor scale.
   * Caller-owned vectors avoid allocations in a live weapon trail.
   */
  sampleWorldBlade(grip: Vector3, tip: Vector3): boolean {
    if ((!this.mounted || this.mounted.userData.attachment !== 'hand.R') && this.embeddedBlade) {
      this.hand.localToWorld(grip.copy(this.embeddedBlade.grip));
      this.hand.localToWorld(tip.copy(this.embeddedBlade.tip));
      return true;
    }
    if (!this.grip || !this.tip) return false;
    this.grip.getWorldPosition(grip); this.tip.getWorldPosition(tip);
    return true;
  }
}
