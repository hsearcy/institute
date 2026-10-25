import { Group, Matrix4, Mesh, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three';

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

/** Bind only the measured sockets exported with the fresh Tripo rig. Their
 * frames include the source-to-item unit conversion, so actor placement and
 * normalization do not need a second guessed scale or a previous hero's rig.
 */
export function tripoHeroEquipment(hero: Object3D): HeldEquipment | undefined {
  const frame = (name: string): EquipmentSocket | undefined => {
    const marker = hero.getObjectByName(name);
    if (!marker?.parent) return undefined;
    if (marker.matrixAutoUpdate) marker.updateMatrix();
    const transform = marker.matrix.clone();
    if (!transform.elements.every(Number.isFinite) || Math.abs(transform.determinant()) < 1e-8) return undefined;
    return { parent: marker.parent, transform };
  };
  const castMarker = hero.getObjectByName('TripoCastOrigin');
  if (castMarker && !hero.getObjectByName('CastOrigin')) {
    const origin = new Group(); origin.name = 'CastOrigin';
    origin.userData.source = 'tripo-measured-left-palm';
    castMarker.add(origin);
  }
  const grip = frame('TripoGrip');
  if (!grip) return undefined;
  const wearables: EquipmentSockets = {};
  for (const [slot, name] of [['head', 'TripoHeadSocket'], ['chest', 'TripoChestSocket'], ['belt', 'TripoBeltSocket']] as const) {
    const socket = frame(name);
    if (socket) wearables[slot] = socket;
  }
  return new HeldEquipment(hero, grip.parent, grip.transform, wearables);
}

/** Local frames on the authored rig. Wearables use an upright +Y axis and
 * +Z front, with the source Grip marker at the band center or suspension point.
 */
export function authoredHeroWearableSockets(hero: Object3D): EquipmentSockets {
  const sockets: EquipmentSockets = {};
  for (const [slot, bone, x, y, z] of [
    ['head', 'head', 0, .23, 0],
    ['chest', 'chest', 0, .27, .195],
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
    ['head', 'head', -.035, .345, .018],
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
  private handRelic?: { floating: boolean; inverseGrip: Matrix4 };
  private readonly relicPosition = new Vector3();
  private readonly relicRotation = new Quaternion();
  private readonly heroRotation = new Quaternion();
  private readonly relicScale = new Vector3();
  private readonly relicOffset = new Vector3();
  private readonly embedded: { node: Object3D; visible: boolean }[] = [];

  constructor(private readonly hero: Object3D, private readonly hand: Object3D, private readonly socket: Matrix4,
    private readonly wearableSockets: EquipmentSockets = {}) {
    // The authored embedded sword is rigidly weighted to the holding hand.
    // Measure its real distal vertex once; do not invent a length/axis for items
    // whose distinct replacement model has not been installed yet.
    hero.updateWorldMatrix(true, false); hero.updateMatrixWorld(true);
    const grip = new Vector3().setFromMatrixPosition(socket), point = new Vector3(), tip = new Vector3();
    const toHand = hand.matrixWorld.clone().invert(); let farthest = .25 ** 2;
    hero.traverse(node => {
      if (node.userData.sourcePart !== 'equipped_sword') return;
      // A segmented Tripo sword is a rigid group under the new hand. Explicit
      // markers preserve its curved blade's real endpoint and handle center.
      const sourceTip = node.getObjectByName('Tip');
      if (sourceTip && hand.getObjectById(node.id)) {
        sourceTip.getWorldPosition(point).applyMatrix4(toHand);
        const distance = point.distanceToSquared(grip);
        if (distance > farthest) { farthest = distance; tip.copy(point); }
        return;
      }
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute('position');
      if (!positions) return;
      if (node instanceof SkinnedMesh) {
        const indices = node.geometry.getAttribute('skinIndex'), weights = node.geometry.getAttribute('skinWeight');
        if (!indices || !weights) return;
        for (let i = 0; i < positions.count; i++) {
          let sum = 0;
          for (let component = 0; component < 4; component++) {
            const weight = weights.getComponent(i, component); sum += weight;
            if (weight > 1e-6 && node.skeleton.bones[indices.getComponent(i, component)] !== hand) return;
          }
          if (Math.abs(sum - 1) > .001) return;
        }
      } else if (!hand.getObjectById(node.id)) return;
      for (let i = 0; i < positions.count; i++) {
        if (node instanceof SkinnedMesh) node.getVertexPosition(i, point);
        else point.fromBufferAttribute(positions, i);
        point.applyMatrix4(node.matrixWorld).applyMatrix4(toHand);
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
    const handRelic = metadata.userData.itemId === 'thunderbell' || metadata.userData.itemId === 'stormorbit';
    const attachment = handRelic ? 'hand.R' : metadata.userData.attachment as ItemAttachment;
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
      if (node.userData.sourcePart === 'equipped_sword') {
        this.embedded.push({ node, visible: node.visible }); node.visible = false;
      }
    });
    target.parent.add(mount); this.mounted = mount;
    if (handRelic) {
      this.handRelic = { floating: metadata.userData.itemId === 'stormorbit', inverseGrip: transform.clone().invert() };
      this.update(0);
    }
    // A worn relic augments the hero's embedded weapon. Its markers must never
    // turn a crown or pendant into the endpoints of the Cleave blade trail.
    if (attachment === 'hand.R' && !handRelic) { this.grip = grip; this.tip = tip; }
    return true;
  }

  /** Gravity keeps the bell upright; the orb floats beside the animated palm. */
  update(time: number): void {
    if (!this.mounted || !this.handRelic) return;
    this.hand.getWorldQuaternion(this.relicRotation).invert();
    this.hero.getWorldQuaternion(this.heroRotation);
    this.relicRotation.multiply(this.heroRotation);
    this.relicPosition.setFromMatrixPosition(this.socket);
    this.relicScale.setFromMatrixScale(this.socket);
    if (this.handRelic.floating) {
      this.relicOffset.set(0, .32 + Math.sin(time * 2) * .025, .25).multiply(this.relicScale).applyQuaternion(this.relicRotation);
      this.relicPosition.add(this.relicOffset);
    }
    this.relicScale.multiplyScalar(this.handRelic.floating ? 1.8 : 1.6);
    this.mounted.matrix.compose(this.relicPosition, this.relicRotation, this.relicScale).multiply(this.handRelic.inverseGrip);
    this.mounted.matrixWorldNeedsUpdate = true;
  }

  clear(): void {
    this.mounted?.removeFromParent(); this.mounted = undefined;
    this.grip = undefined; this.tip = undefined;
    this.handRelic = undefined;
    for (const { node, visible } of this.embedded) node.visible = visible;
    this.embedded.length = 0;
  }

  get itemId(): string | undefined { return this.mounted?.userData.itemId; }

  /** Hide a worn head relic while a helm covers it; everything else always shows. */
  setHelmWorn(helm: boolean): void {
    if (this.mounted) this.mounted.visible = !(helm && this.mounted.userData.attachment === 'head');
  }

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
