import { Box3, Group, Matrix4, Mesh, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three';

/** Gear kinds the hero shows on the body. Rings are too small to read. */
export type WornKind = 'helm' | 'chest' | 'gloves' | 'pants' | 'boots' | 'amulet';
export const WORN_KINDS: readonly WornKind[] = ['helm', 'chest', 'gloves', 'pants', 'boots', 'amulet'];

/** Chest pieces whose skirt hangs over the hips, on top of any pants. */
const SKIRTED = new Set(['padded_tunic', 'scale_mail']);
/** Boots whose shafts reach the knee. */
const TALL_BOOTS = new Set(['traveler_boots']);

/** Which worn piece shows in a body region more than one piece covers. */
export function regionPriority(region: string, kind: WornKind, id: string): number {
  if (region === 'feet') return kind === 'boots' ? 3 : 1;
  // Tall boots cover the shins over trousers; ankle boots leave the trouser legs showing.
  if (region === 'shins') return kind === 'boots' ? (TALL_BOOTS.has(id) ? 3 : 1) : 2;
  if (region === 'hips') return kind === 'chest' ? (SKIRTED.has(id) ? 3 : 1) : 2;
  return 1;
}

interface Piece { mesh: Mesh; box: Box3; origin: Vector3 }
type Fit = (body: Box3, item: Box3, origin: Vector3) => Matrix4;
type Part = 'head' | 'torso' | 'handL' | 'handR' | 'footL' | 'footR';
const PART_BONES: Record<Part, readonly string[]> = {
  head: ['Head'],
  torso: ['Spine01', 'Spine02', 'Waist'],
  handL: ['L_Hand'], handR: ['R_Hand'],
  footL: ['L_Foot', 'L_ToeBase', 'L_CalfTwist02'], footR: ['R_Foot', 'R_ToeBase', 'R_CalfTwist02'],
};
/** The bone each part's gear follows through the animation. */
const PART_ANCHOR: Record<Part, string> = { head: 'Head', torso: 'Spine02', handL: 'L_Hand', handR: 'R_Hand', footL: 'L_Foot', footR: 'R_Foot' };

interface Measured { box: Box3; anchor: Object3D; bind: Matrix4; elbow?: Vector3 }

/**
 * Rigid gear on the Tripo hero's bones. The body is measured once in its bind
 * pose: vertices are grouped by their strongest bone, so every fit follows the
 * real head, torso, hand and foot shapes instead of guessed offsets. Gear
 * models are authored +Y up and +Z front (the hero's forward), metres.
 */
export class WornGear {
  private readonly parts = new Map<Part, Measured>();
  private readonly mounted = new Map<WornKind, { id: string; nodes: Object3D[]; fitted?: boolean }>();
  private body?: SkinnedMesh;
  /** The plain body as one mesh per region (head, chest, gloves, legs, boots). */
  private readonly bodyRegions = new Map<string, SkinnedMesh>();
  private amuletSource?: Object3D;
  /** Bind-pose body points near the chest front, hero space (for seating pendants). */
  private readonly chestFront: Vector3[] = [];
  private readonly bodyToHero = new Matrix4();
  private readonly toHero = new Matrix4();

  constructor(hero: Object3D) {
    const skinned: SkinnedMesh[] = [];
    hero.traverse(node => { if (node instanceof SkinnedMesh && node.userData.sourcePart !== 'cape') skinned.push(node); });
    if (!skinned.length) return;
    for (const mesh of skinned) if (typeof mesh.userData.bodyRegion === 'string') this.bodyRegions.set(mesh.userData.bodyRegion, mesh);
    this.body = skinned.find(mesh => mesh.userData.sourcePart === 'base_body') ?? skinned.reduce((a, b) => a.geometry.getAttribute('position').count >= b.geometry.getAttribute('position').count ? a : b);
    // Bind-pose geometry is the raw vertex data; no pose is applied to the live skeleton.
    hero.updateMatrixWorld(true);
    this.toHero.copy(hero.matrixWorld).invert();
    if (this.body) this.bodyToHero.copy(this.toHero).multiply(this.body.matrixWorld);
    const owner = new Map<string, Part>();
    for (const [part, bones] of Object.entries(PART_BONES) as [Part, readonly string[]][]) for (const bone of bones) owner.set(bone, part);
    const boxes = new Map<Part, Box3>(), binds = new Map<string, Matrix4>(), point = new Vector3();
    const anchors = { ...PART_ANCHOR }, rigidParts: { bone: string; box: Box3 }[] = [];
    for (const mesh of skinned) {
      const toHero = this.toHero.clone().multiply(mesh.matrixWorld);
      // bindMatrixInverse follows matrixWorld in attached mode; invert the stored bind instead.
      const unbind = toHero.clone().multiply(mesh.bindMatrix.clone().invert());
      mesh.skeleton.bones.forEach((bone, k) => {
        if (!binds.has(bone.name)) binds.set(bone.name, unbind.clone().multiply(mesh.skeleton.boneInverses[k].clone().invert()));
      });
      const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
      if (!positions || !indices || !weights) continue;
      const whole = new Box3(); let only: number | undefined = -1;
      for (let i = 0; i < positions.count; i++) {
        let best = 0, bone = -1;
        for (let c = 0; c < 4; c++) { const w = weights.getComponent(i, c); if (w > best) { best = w; bone = indices.getComponent(i, c); } }
        point.fromBufferAttribute(positions, i).applyMatrix4(toHero); whole.expandByPoint(point);
        if (mesh === this.body && i % 3 === 0) this.chestFront.push(point.clone());
        only = only === -1 || only === bone ? bone : undefined;
        const part = owner.get(mesh.skeleton.bones[bone]?.name ?? '');
        if (!part) continue;
        let box = boxes.get(part); if (!box) boxes.set(part, box = new Box3());
        box.expandByPoint(point);
      }
      if (only !== undefined && only >= 0) rigidParts.push({ bone: mesh.skeleton.bones[only].name, box: whole });
    }
    // The sword hand is a separate rigid part on the forearm twist, not on R_Hand.
    const swordHand = rigidParts.find(part => /^R_Forearm/.test(part.bone));
    if (!boxes.has('handR') && swordHand) { boxes.set('handR', swordHand.box); anchors.handR = swordHand.bone; }
    for (const [part, box] of boxes) {
      const anchor = hero.getObjectByName(anchors[part]), bind = binds.get(anchors[part]);
      const elbow = part === 'handL' ? binds.get('L_Forearm') : part === 'handR' ? binds.get('R_Forearm') : undefined;
      if (anchor && bind) this.parts.set(part, { box, anchor, bind, elbow: elbow && new Vector3().setFromMatrixPosition(elbow) });
    }
  }

  get ready(): boolean { return this.parts.size === 6; }

  /** Wear `source` (a loaded gear GLB scene) in `kind`, or remove it. */
  /**
   * Wear a fitted piece: a skinned shell built on this hero's body
   * (scripts/blender/worn/build_worn.py). It binds to the hero's own skeleton,
   * so it follows every clip exactly. Returns false when it cannot bind.
   */
  wearFitted(kind: WornKind, id: string, source: Object3D): boolean {
    if (this.mounted.get(kind)?.id === id && this.mounted.get(kind)?.fitted) return true;
    const body = this.body;
    if (!body) return false;
    const meshes: SkinnedMesh[] = [];
    // A set file holds several pieces; each mesh names its gear base.
    source.traverse(node => { if (node instanceof SkinnedMesh && (node.userData.wornGear ?? id) === id) meshes.push(node); });
    if (!meshes.length) return false;
    source.updateMatrixWorld(true);
    const heroSlot = new Map(body.skeleton.bones.map((bone, i) => [bone.name, i]));
    const nodes: Object3D[] = [];
    for (const mesh of meshes) {
      const bones = mesh.skeleton.bones;
      const remap = bones.map(bone => heroSlot.get(bone.name));
      const anchor = bones.findIndex(bone => bone.name === 'Hip' || bone.name === 'Root');
      if (remap.some(slot => slot === undefined) || anchor < 0) return false;
      // Same rest skeleton in both files: carry the source's bind space over through one bone.
      const toHero = body.bindMatrix.clone().invert()
        .multiply(body.skeleton.boneInverses[remap[anchor]!].clone().invert())
        .multiply(mesh.skeleton.boneInverses[anchor]).multiply(mesh.bindMatrix);
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(toHero);
      const index = geometry.getAttribute('skinIndex');
      for (let i = 0; i < index.count; i++) for (let c = 0; c < 4; c++) index.setComponent(i, c, remap[index.getComponent(i, c)]!);
      index.needsUpdate = true;
      const worn = new SkinnedMesh(geometry, mesh.material);
      worn.name = `Worn_${kind}`; worn.castShadow = true; worn.frustumCulled = false;
      worn.userData.wornOwnsGeometry = true; worn.userData.bodyRegion = mesh.userData.bodyRegion;
      worn.position.copy(body.position); worn.quaternion.copy(body.quaternion); worn.scale.copy(body.scale);
      body.parent?.add(worn);
      worn.bind(body.skeleton, body.bindMatrix);
      nodes.push(worn);
    }
    this.remove(kind);
    this.mounted.set(kind, { id, nodes, fitted: true });
    this.resolveRegions();
    if (kind === 'chest') this.refitAmulet();
    return true;
  }

  wear(kind: WornKind, id: string | undefined, source?: Object3D): void {
    if (this.mounted.get(kind)?.id === (source ? id : undefined) && !this.mounted.get(kind)?.fitted) return;
    this.remove(kind);
    if (kind === 'amulet') this.amuletSource = source;
    if (!source || !id || !this.ready) return;
    const nodes: Object3D[] = [];
    const place = (part: Part, piece: Piece, fit: Fit) => {
      const measured = this.parts.get(part)!;
      const mount = new Group(); mount.name = `Worn_${kind}`; mount.matrixAutoUpdate = false;
      // Hero-space placement expressed in the anchor bone's bind frame.
      mount.matrix.copy(measured.bind).invert().multiply(fit(measured.box, piece.box, piece.origin));
      mount.add(piece.mesh); measured.anchor.add(mount); nodes.push(mount);
    };
    if (kind === 'gloves' || kind === 'boots') {
      const halves = pairHalves(source);
      if (!halves) return;
      const middle = this.parts.get('torso')?.box.getCenter(new Vector3()).x ?? 0;
      const fit = (part: Part): Fit => kind === 'boots' ? fitBoot : (body, item, origin) =>
        fitGlove(body, item, origin, this.parts.get(part)!, new Vector3(Math.sign(body.getCenter(new Vector3()).x - middle) || 1, 0, 0));
      const [left, right]: [Part, Part] = kind === 'gloves' ? ['handL', 'handR'] : ['footL', 'footR'];
      place(left, halves[0], fit(left)); place(right, halves[1], fit(right));
    } else {
      const geometry = gearGeometry(source);
      if (!geometry) return;
      const piece = { mesh: geometry.mesh, box: new Box3().setFromObject(geometry.mesh), origin: geometry.origin };
      place(kind === 'helm' ? 'head' : 'torso', piece, kind === 'helm' ? fitHelm : kind === 'chest' ? fitChest : (body, item, origin) => this.seatPendant(fitAmulet(body, item, origin), piece.mesh));
    }
    this.mounted.set(kind, { id, nodes });
    if (kind === 'chest') this.refitAmulet();
  }

  /**
   * A worn piece is whole body regions of a dressed hero. Each region shows the
   * highest-priority piece that covers it, or the plain body when none does.
   */
  private resolveRegions(): void {
    const best = new Map<string, { node: Object3D; rank: number }>();
    for (const [kind, worn] of this.mounted) {
      if (!worn.fitted) continue;
      for (const node of worn.nodes) {
        const region = node.userData.bodyRegion as string | undefined;
        if (!region) continue;
        const rank = regionPriority(region, kind, worn.id), current = best.get(region);
        if (!current || rank > current.rank) best.set(region, { node, rank });
      }
    }
    for (const worn of this.mounted.values()) for (const node of worn.nodes) {
      const region = node.userData.bodyRegion as string | undefined;
      if (region) node.visible = best.get(region)?.node === node;
    }
    for (const [region, mesh] of this.bodyRegions) mesh.visible = !best.has(region);
  }

  /**
   * Rest the pendant on whatever is in front of the chest (worn armour or the
   * shirt): the lowest part of the amulet moves until its back just touches it.
   */
  private seatPendant(fit: Matrix4, mesh: Mesh): Matrix4 {
    const positions = mesh.geometry.getAttribute('position');
    const toHero = fit.clone().multiply(mesh.matrix), points: Vector3[] = [];
    for (let i = 0; i < positions.count; i += 2) points.push(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(toHero));
    const low = Math.min(...points.map(p => p.y)), pendant = points.filter(p => p.y < low + .025);
    if (!pendant.length) return fit;
    const centre = pendant.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(pendant.length);
    const back = Math.min(...pendant.map(p => p.z));
    // The surface in front of the chest at the pendant: the worn chest piece when there is one.
    const surface: Vector3[] = [...this.chestFront];
    const chest = this.mounted.get('chest');
    if (chest?.fitted) for (const node of chest.nodes) {
      if (!(node instanceof Mesh) || !node.visible) continue;
      const attr = node.geometry.getAttribute('position');
      for (let i = 0; i < attr.count; i += 2) surface.push(new Vector3().fromBufferAttribute(attr, i).applyMatrix4(this.bodyToHero));
    } else if (chest) for (const node of chest.nodes) {
      node.updateMatrixWorld(true);
      node.traverse(child => {
        if (!(child instanceof Mesh)) return;
        const attr = child.geometry.getAttribute('position'), m = this.toHero.clone().multiply(child.matrixWorld);
        for (let i = 0; i < attr.count; i += 2) surface.push(new Vector3().fromBufferAttribute(attr, i).applyMatrix4(m));
      });
    }
    const near = surface.filter(p => Math.abs(p.y - centre.y) < .03 && Math.abs(p.x - centre.x) < .03);
    if (!near.length) return fit;
    const front = Math.max(...near.map(p => p.z));
    return new Matrix4().makeTranslation(0, 0, front + .004 - back).multiply(fit);
  }

  /** An amulet hangs over the chest piece when one is worn. */
  private refitAmulet(): void {
    const amulet = this.mounted.get('amulet');
    if (amulet && this.amuletSource) { const { id } = amulet; this.remove('amulet'); this.wear('amulet', id, this.amuletSource); }
  }

  remove(kind: WornKind): void {
    const worn = this.mounted.get(kind); if (!worn) return;
    // Materials stay owned by the gear model cache; fitted pieces own their bound geometry.
    for (const node of worn.nodes) {
      node.removeFromParent();
      if (node instanceof Mesh && node.userData.wornOwnsGeometry) node.geometry.dispose();
    }
    this.mounted.delete(kind);
    this.resolveRegions();
    if (kind === 'chest') this.refitAmulet();
  }

  clear(): void { for (const kind of [...this.mounted.keys()]) this.remove(kind); }
  worn(): Partial<Record<WornKind, string>> { return Object.fromEntries([...this.mounted].map(([kind, value]) => [kind, value.id])); }
}

/** Kinds with a body-fitted model (gear/worn/<id>.glb); amulets stay rigid. */
export const FITTED_KINDS: readonly WornKind[] = ['helm', 'chest', 'gloves', 'pants', 'boots'];

/** Wear the fitted model when there is one, else the free-standing gear model. */
export async function wearGear(target: WornGear, kind: WornKind, baseId: string,
  load: (baseId: string, fitted: boolean) => Promise<Object3D | undefined>, current: () => boolean): Promise<void> {
  if (FITTED_KINDS.includes(kind)) {
    const fitted = await load(baseId, true);
    if (!current()) return;
    if (fitted && target.wearFitted(kind, baseId, fitted)) return;
  }
  const rigid = await load(baseId, false);
  if (current() && rigid) target.wear(kind, baseId, rigid);
}

function gearGeometry(source: Object3D): { mesh: Mesh; origin: Vector3 } | undefined {
  let found: Mesh | undefined;
  source.traverse(node => { if (!found && node instanceof Mesh) found = node; });
  if (!found) return undefined;
  source.updateMatrixWorld(true);
  const mesh = new Mesh(found.geometry, found.material);
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(found.matrixWorld);
  mesh.castShadow = true; mesh.name = found.name;
  return { mesh, origin: sourceOrigin(found) };
}

/** Gloves and boots ship as two meshes: the authored side ('original', a left
 * glove or boot) and its mirrored copy, which is turned for the icon layout. Both
 * sides wear the original geometry; the right one is a reflection of it. */
export function pairHalves(source: Object3D): [Piece, Piece] | undefined {
  let original: Mesh | undefined;
  source.traverse(node => { if (!original && node instanceof Mesh && node.userData.gearSide === 'original') original = node; });
  if (!original) return undefined;
  source.updateMatrixWorld(true);
  const side = (mirror: boolean) => {
    const mesh = new Mesh(original!.geometry, original!.material); mesh.matrixAutoUpdate = false; mesh.castShadow = true;
    mesh.matrix.copy(original!.matrixWorld);
    if (mirror) {
      const box = new Box3().setFromObject(original!), x = box.getCenter(new Vector3()).x;
      // Reflect across the item's own centre plane; three flips the winding for negative scale.
      mesh.matrix.premultiply(new Matrix4().makeTranslation(x, 0, 0).multiply(new Matrix4().makeScale(-1, 1, 1)).multiply(new Matrix4().makeTranslation(-x, 0, 0)));
    }
    mesh.name = `${original!.name}_${mirror ? 'right' : 'left'}`;
    original!.geometry.computeBoundingBox();
    return { mesh, box: original!.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix), origin: sourceOrigin(original!).applyMatrix4(mirror ? mesh.matrix.clone().multiply(original!.matrixWorld.clone().invert()) : new Matrix4()) };
  };
  return [side(false), side(true)];
}

/** The authored origin (brow band, waist, palm) in glTF axes; build_gear.py stores it in Blender axes. */
export function sourceOrigin(mesh: Object3D): Vector3 {
  const [x, y, z] = Array.isArray(mesh.userData.sourceOrigin) ? mesh.userData.sourceOrigin as number[] : [0, 0, 0];
  return new Vector3(x, z, -y).applyMatrix4(mesh.matrixWorld);
}

const size = (box: Box3) => box.getSize(new Vector3());
const centre = (box: Box3) => box.getCenter(new Vector3());
/** Hero-space matrix that scales the item by `scale` and moves item point `from` to `to`. */
const placeAt = (scale: number, from: Vector3, to: Vector3, rotation = new Quaternion()) =>
  new Matrix4().compose(to.clone().sub(from.clone().multiplyScalar(scale).applyQuaternion(rotation)), rotation, new Vector3(scale, scale, scale));

// Fit factors were tuned against the in-game camera; each item stays a little proud of the body.
// Helms share a brow band at the origin (radius about .14); chests share one torso
// profile (.32 wide, neck at y=.25); amulets hang from a chain loop.
function fitHelm(body: Box3, item: Box3, origin: Vector3): Matrix4 {
  const b = size(body), band = Math.min(size(item).x / 2, .15), scale = b.x * .5 * 1.1 / band;
  const c = centre(body);
  // A thin band (circlet) sits on the brow; a full helm's band is a little higher, over the hood.
  const brow = size(item).y < .14 ? .78 : .87;
  return placeAt(scale, origin, new Vector3(c.x, body.min.y + b.y * brow, c.z));
}

function fitChest(body: Box3, _item: Box3, origin: Vector3): Matrix4 {
  // Width and height follow the shoulders; depth follows the chest, so the body never shows through.
  const b = size(body), wide = b.x * 1.25 / .32, deep = b.z * 1.18 / .216;
  const c = centre(body), scale = new Vector3(wide, wide, deep);
  const neck = origin.clone().setY(origin.y + .25).multiply(scale);
  return new Matrix4().compose(new Vector3(c.x, body.max.y + b.y * .02, c.z).sub(neck), new Quaternion(), scale);
}

/** Amulets hang from a chain loop drawn upright around the authored origin (+.1 up).
 * Tilting the loop back lays it around the neck, with the pendant on the chest. */
function fitAmulet(body: Box3, _item: Box3, origin: Vector3): Matrix4 {
  const b = size(body), scale = b.x * .6 / .15, c = centre(body);
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -55 * Math.PI / 180);
  return placeAt(scale, origin.clone().setY(origin.y + .1), new Vector3(c.x, body.max.y - b.y * .03, c.z + b.z * .08), tilt);
}

function fitBoot(body: Box3, item: Box3): Matrix4 {
  const b = size(body), i = size(item), scale = b.z * 1.12 / i.z;
  const c = centre(body), from = new Vector3(centre(item).x, item.min.y, centre(item).z);
  return placeAt(scale, from, new Vector3(c.x, body.min.y - .005, c.z));
}

/** Fingers (+Y) run from the wrist into the hand; the back of the hand (+Z) faces away from the body. */
function fitGlove(body: Box3, _item: Box3, origin: Vector3, hand: Measured, outward: Vector3): Matrix4 {
  // Fingers continue the forearm, from the elbow through the wrist.
  const wrist = new Vector3().setFromMatrixPosition(hand.bind);
  const along = (hand.elbow ? wrist.clone().sub(hand.elbow) : centre(body).sub(wrist)).normalize();
  const back = outward.clone().addScaledVector(along, -outward.dot(along)).normalize();
  const side = new Vector3().crossVectors(along, back).normalize();
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, along, back));
  const extent = size(body), reach = Math.max(extent.x, extent.y, extent.z);
  // The hero makes a fist, so the glove's palm sits just short of the fist's centre and
  // its fingers wrap past the knuckles instead of hanging below them.
  const scale = reach * 1.75 / .19;
  return placeAt(scale, origin, wrist.lerp(centre(body), .9), rotation);
}
