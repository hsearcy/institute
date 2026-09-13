import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { SkinnedEnemyAnimator } from './SkinnedEnemyAnimator';
import { solvePlanarLeg } from './legSupport';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { AuthoredEnemyGuard, type AuthoredGuardSupport } from './AuthoredEnemyGuard';
const supportCache = new WeakMap<BufferGeometry, Vector3[]>();
function spectralFoldPoint(point: Vector3): Vector3 {
  const radius = 1.6 / 1.35, angle = Math.max(0, point.y - .06) / radius, z = point.z;
  point.y = .06 + radius * Math.sin(angle) - z * Math.sin(angle);
  point.z = radius * (1 - Math.cos(angle)) + z * Math.cos(angle);
  point.x -= .10 * Math.sin(angle);
  return point;
}
const spectralStaffAnchor = new Vector3(.43951, 1.29083, .31233);
const spectralHeadAnchor = new Vector3(0, 1.51, .02);
function spectralRigidFold(point: Vector3, anchor: Vector3): Vector3 {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (anchor.y - .06) / (1.6 / 1.35));
  return point.sub(anchor).applyQuaternion(rotation).add(spectralFoldPoint(anchor.clone()));
}
const spectralMotionCache = new WeakMap<BufferGeometry, BufferGeometry>();
/** All seven cuts use the same source-coordinate field, so their seams agree. */
function spectralMotionGeometry(source: BufferGeometry): BufferGeometry {
  const cached = spectralMotionCache.get(source); if (cached) return cached;
  const geometry = source.clone(), position = source.getAttribute('position');
  geometry.userData.enemySourceGeometry = source.uuid;
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = []; geometry.morphAttributes.normal = [];
  for (const layer of [0, 1, 2]) {
    const target = source.clone(), attribute = target.getAttribute('position');
    const delta = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      // Keep the hand and the complete staff rigid. The field tapers continuously
      // across every cut, including cloth sections assigned to arm groups.
      const center = 1 - smooth((Math.abs(x) - .16) / .15);
      const chest = smooth((y - .72) / .3) * (1 - smooth((y - 1.38) / .18)) * center;
      const hem = (1 - smooth((y - .10) / .95)) * (1 - smooth((x - .18) / .13));
      let dx = layer === 0 ? x * .030 * chest : .048 * Math.sin(y * 4 + z * 3) * hem;
      let dy = layer === 0 ? .008 * chest : .020 * hem;
      let dz = layer === 0 ? .020 * chest : .045 * Math.cos(y * 3 + x * 4) * hem;
      if (layer === 2) {
        const original = new Vector3(x, y, z), bent = spectralFoldPoint(original.clone());
        // The head and staff keep their solid shape. Blend through surrounding
        // cloth in source space, identically on each side of every mesh cut.
        const head = smooth((y - 1.40) / .14) * (1 - smooth((Math.abs(x) - .16) / .10));
        bent.lerp(spectralRigidFold(original.clone(), spectralHeadAnchor), head);
        const staffDistance = Math.hypot(x - (.24 + .10 * y), z - (.18 + .07 * y));
        const staff = 1 - smooth((staffDistance - .105) / .085);
        bent.lerp(spectralRigidFold(original.clone(), spectralStaffAnchor), staff);
        dx = bent.x - x; dy = bent.y - y; dz = bent.z - z;
      }
      delta.set([dx, dy, dz], i * 3); attribute.setXYZ(i, x + dx, y + dy, z + dz);
    }
    target.computeVertexNormals();
    const normal = geometry.getAttribute('normal'), targetNormal = target.getAttribute('normal');
    const normalDelta = new Float32Array(position.count * 3);
    if (normal) for (let i = 0; i < position.count; i++) for (let axis = 0; axis < 3; axis++) normalDelta[i * 3 + axis] = targetNormal.getComponent(i, axis) - normal.getComponent(i, axis);
    geometry.morphAttributes.position.push(new Float32BufferAttribute(delta, 3));
    geometry.morphAttributes.normal.push(new Float32BufferAttribute(normalDelta, 3));
    target.dispose();
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); spectralMotionCache.set(source, geometry); return geometry;
}
function supportVertices(mesh: Mesh): Vector3[] {
  const cached = supportCache.get(mesh.geometry); if (cached) return cached;
  const position = mesh.geometry.getAttribute('position'); if (!position) return [];
  const points = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
  const hull = new ConvexHull().setFromPoints(points), unique = new Set<Vector3>();
  for (const face of hull.faces) { let edge = face.edge; do { unique.add(edge.head().point); edge = edge.next; } while (edge !== face.edge); }
  const result = unique.size ? [...unique] : points; supportCache.set(mesh.geometry, result); return result;
}

export type EnemyPoseState = {
  /** Cosmetic step intensity, 0..1. Never determines travel or combat. */
  moving?: number;
  /** Enables the periodic sword/arm warning gesture; 0 disables it. */
  threat?: number;
  /** Optional short recoil envelope, 0..1. */
  recoil?: number;
  /** Which shoulder takes the impact, -1..1. */
  impactSide?: number;
  /** Supported catch/recovery envelope. */
  brace?: number;
  /** Delayed support-foot step, after shoulder and hip displacement. */
  catchStep?: number;
  footOffset?: number;
  footLift?: number;
  supportTravel?: number;
  /** Persistent guarded posture proportional to missing health. */
  injury?: number;
  /** Seconds since defeat; omitted while alive. */
  deathAge?: number;
  /** Element-specific presentation; never changes hit or cleanup timing. */
  collapse?: 'electric' | 'grounded';
};
type Joint = { object: Object3D; position: Vector3; rotation: Quaternion; index: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Rigid articulated poses. Shared geometry/materials remain suitable for instancing. */
export class EnemyAnimator {
  readonly articulated: boolean;
  private readonly skinned?: SkinnedEnemyAnimator;
  private readonly joints = new Map<string, Joint>();
  private readonly euler = new Euler();
  private readonly offset = new Quaternion();
  private readonly brute: boolean;
  private readonly armored: boolean;
  private readonly spectral: boolean;
  private readonly phase: number;
  private readonly footSupports: { node: Object3D; point: Vector3 }[] = [];
  private supportParent?: Object3D;
  private supportHeight = 0;
  private readonly supportPoint = new Vector3();
  private readonly garments: Mesh[] = [];
  private readonly spectralParentInverse = new Matrix4();
  private readonly legSupports = new Map<string, { foot: Vector3; center: Vector3; sole: readonly Vector3[]; limb: readonly { node: Object3D; point: Vector3 }[] }>();
  private readonly authoredGuard?: AuthoredEnemyGuard;
  private readonly authoredGuardSupport?: AuthoredGuardSupport;

  /** Authored foot support owns the visual pose, including its ground height. */
  get ownsGroundedPose(): boolean { return this.skinned !== undefined || this.authoredGuard !== undefined; }
  private readonly armSupports = new Map<string, { node: Object3D; point: Vector3 }[]>();
  private readonly capeSupports: { node: Object3D; point: Vector3 }[] = [];
  private readonly settledArmAngles = new Map<string, number>();

  constructor(visual: Object3D, options: { kind: string; phase: number }) {
    this.brute = (options.kind === 'guardian' || options.kind === 'vault-guardian-boss'); this.armored = options.kind === 'revenant'; this.spectral = options.kind === 'wraith'; this.phase = options.phase;
    this.skinned = SkinnedEnemyAnimator.create(visual, options.kind, options.phase);
    if (this.skinned) { this.articulated = true; return; }
    visual.traverse(object => {
      const name = typeof object.userData.enemyJoint === 'string'
        ? object.userData.enemyJoint : /^Joint_(\w+)/.exec(object.name)?.[1];
      if (name) this.joints.set(name, { object, position: object.position.clone(), rotation: object.quaternion.clone(), index: this.joints.size });
    });
    if (this.spectral) {
      visual.traverse(object => { if (object instanceof Mesh) this.garments.push(object); });
      for (const garment of this.garments) { garment.geometry = spectralMotionGeometry(garment.geometry); garment.updateMorphTargets(); }
    }
    this.articulated = this.joints.has('ArmUpperR') && (this.joints.has('LegUpperL') || (this.spectral && this.joints.has('Body')));
    this.supportParent = this.joints.get('LegUpperL')?.object.parent ?? undefined;
    if (this.supportParent) for (const side of ['L', 'R']) {
      this.joints.get(`LegLower${side}`)?.object.traverse(node => {
        if (node instanceof Mesh) for (const point of supportVertices(node)) this.footSupports.push({ node, point });
      });
      const points: { node: Object3D; point: Vector3 }[] = [];
      this.joints.get(`ArmUpper${side}`)?.object.traverse(node => {
        if (node instanceof Mesh) for (const point of supportVertices(node)) points.push({ node, point });
      });
      this.armSupports.set(side, points);
    }
    if (this.footSupports.length) this.supportHeight = this.lowestSupport();
    if (this.armored) this.joints.get('Cape')?.object.traverse(node => { if (node instanceof Mesh) for (const point of supportVertices(node)) this.capeSupports.push({ node, point }); });
    for (const side of ['L', 'R']) {
      const lower = this.joints.get(`LegLower${side}`)?.object; if (!lower) continue;
      const points = this.footSupports.filter(p => { for (let node: Object3D | null = p.node; node; node = node.parent) if (node === lower) return true; return false; });
      const low = Math.min(...points.map(p => this.inSupportSpace(p.node, this.supportPoint.copy(p.point)).y));
      const sole = points.filter(p => this.inSupportSpace(p.node, this.supportPoint.copy(p.point)).y < low + .075);
      if (!sole.length) continue;
      const center = new Vector3(), foot = new Vector3(), soleLocal: Vector3[] = [];
      for (const p of sole) {
        center.add(this.inSupportSpace(p.node, this.supportPoint.copy(p.point)));
        const local = p.point.clone();
        for (let node: Object3D | null = p.node; node && node !== lower; node = node.parent) { node.updateMatrix(); local.applyMatrix4(node.matrix); }
        foot.add(local);
        soleLocal.push(local);
      }
      this.legSupports.set(side, { foot: foot.divideScalar(sole.length), center: center.divideScalar(sole.length), sole: soleLocal, limb: points });
    }
    this.authoredGuard = AuthoredEnemyGuard.create(visual, this.joints);
    if (this.authoredGuard) this.authoredGuardSupport = {
      legs: this.legSupports, arms: this.armSupports, floor: this.supportHeight,
      toSpace: (node, point) => this.inSupportSpace(node, point),
      lowest: () => this.lowestSupport(),
    };
  }

  /** Updates local joint transforms only; caller updates matrixWorld before batching. */
  update(seconds: number, state: EnemyPoseState = {}): void {
    if (this.skinned) { this.skinned.update(seconds, state); return; }
    if (!this.articulated) return;
    for (const garment of this.garments) garment.morphTargetInfluences!.fill(0);
    for (const joint of this.joints.values()) {
      joint.object.position.copy(joint.position); joint.object.quaternion.copy(joint.rotation);
    }
    if (this.spectral) { this.spectralMotion(seconds, state); return; }
    const t = seconds + this.phase, pace = this.spectral ? 1.15 : this.brute ? 2.2 : this.armored ? 2.65 : 3.3;
    const step = Math.sin(t * pace), stride = clamp(state.moving ?? .35) * (this.spectral ? .25 : 1);
    const breathe = Math.sin(t * 1.35), bodyTwist = Math.sin(t * .83);
    const weight = this.brute ? .65 : this.armored ? .82 : 1;
    this.rotate('Body', .025 + breathe * .015, bodyTwist * .045, step * .025);
    this.rotate('Head', -.025 + Math.sin(t * 1.1) * .025, -bodyTwist * .08, 0);
    for (const [side, sign] of [['L', -1], ['R', 1]] as const) {
      const leg = step * sign;
      this.rotate(`LegUpper${side}`, leg * .24 * stride, 0, sign * .025);
      this.rotate(`LegLower${side}`, Math.max(0, -leg) * .31 * stride, 0, 0);
      this.rotate(`ArmUpper${side}`, -.08 - leg * .14 * stride, sign * .035, sign * .07);
      this.rotate(`ArmLower${side}`, -.13 - Math.max(0, leg) * .10, 0, sign * .025);
    }
    if (this.armored) {
      // Keep the broken shield braced in front of the heavy soldier while the
      // sword arm retains its independent windup. This is a cosmetic pose only.
      this.rotate('ArmUpperL', -.34 - Math.max(0, step) * .045, -.08, -.12);
      this.rotate('ArmLowerL', -.48, -.06, -.04);
    }
    this.rotate('Cape', .06 + Math.sin(t * 1.7) * .05, Math.sin(t * 1.1) * .035, -bodyTwist * .05);
    // A readable windup, sweep, and recover. This never produces a gameplay hit.
    const cycle = ((t % 5.7) + 5.7) % 5.7;
    const windup = smooth((cycle - 3.4) / .65) * (1 - smooth((cycle - 4.08) / .28));
    const sweep = smooth((cycle - 4.06) / .23) * (1 - smooth((cycle - 4.34) / .8));
    const threat = clamp(state.threat ?? 1) * weight * (this.spectral ? .4 : 1);
    if (threat > 0 && windup + sweep > 0) {
      this.rotate('ArmUpperR', (-.75 * windup + .25 * sweep) * threat, (-.30 * windup + .62 * sweep) * threat, (-.55 * windup + .22 * sweep) * threat);
      this.rotate('ArmLowerR', (-.75 * windup - .15 * sweep) * threat, 0, 0);
      this.rotate('ArmUpperL', (this.armored ? -.34 : -.12) - .27 * sweep * threat, this.armored ? -.08 : 0, -.18 * windup * threat);
      this.rotate('Body', .02, (-.16 * windup + .19 * sweep) * threat, -.045 * sweep);
      this.rotate('Head', -.025, (.13 * windup - .14 * sweep) * threat, 0);
    }
    const death = state.deathAge;
    const recoil = Math.max(clamp(state.recoil ?? 0), death === undefined ? 0 : Math.sin(clamp(death / .22) * Math.PI) * .9);
    if (recoil > 0) {
      const side = state.impactSide ?? 1;
      if (this.brute && state.collapse !== 'electric') { const body = this.joints.get('Body'); if (body) { body.object.position.z -= .18 * recoil; body.object.position.x += .10 * recoil * side; } }
      this.rotate('Body', -.40 * recoil, -.23 * recoil * side, -.10 * recoil * side);
      this.rotate('Head', -.30 * recoil, .16 * recoil * side, .13 * recoil * side);
      this.rotate('ArmUpperL', -.42 * recoil, -.14 * recoil, -.26 * recoil);
      this.rotate('ArmUpperR', -.22 * recoil, .15 * recoil, .28 * recoil);
    }
    if (death === undefined) {
      const brace = clamp(state.brace ?? 0), stepCatch = clamp(state.catchStep ?? state.brace ?? 0), injury = clamp(state.injury ?? 0);
      if (brace > 0 || injury > 0) {
        // The shield/free arm catches the torso; the sword stays attached and
        // returns to a lower guarded stance. No leg separation or root bounce.
        this.rotate('ArmUpperL', -.28 - brace * .3 - injury * .10, -.08, -.12);
        this.rotate('ArmLowerL', -.38 - brace * .35, -.04, -.025);
        this.rotate('ArmLowerR', -.18 - injury * .14, 0, .025);
        if (recoil < .05) this.rotate('Body', .035 + brace * .12 + injury * .06, bodyTwist * .025, -brace * .035);
        if (!this.spectral) {
          const rear = (state.impactSide ?? (Math.sin(this.phase * 2.37) < 0 ? -1 : 1)) < 0 ? 'L' : 'R';
          const scale = this.supportParent?.getWorldScale(this.supportPoint).y ?? 1;
          const drop = .11 * brace + .045 * injury;
          const body = this.joints.get('Body'); if (body) body.object.position.y -= drop;
          for (const side of ['L', 'R']) {
            const upper = this.joints.get(`LegUpper${side}`), lower = this.joints.get(`LegLower${side}`), support = this.legSupports.get(side);
            if (!upper || !lower || !support) continue;
            const catches = side === rear;
            upper.object.position.y -= drop;
            const travel = (state.supportTravel ?? 0) / scale;
            const offset = catches ? (state.footOffset ?? -.24 * stepCatch) / scale - .07 * injury : 0;
            const targetY = support.center.y + (catches ? state.footLift ?? 0 : 0) / scale - upper.object.position.y;
            const targetZ = support.center.z + travel + offset - upper.object.position.z;
            const pose = solvePlanarLeg(lower.position.y, lower.position.z, support.foot.y, support.foot.z, targetY, targetZ);
            this.rotate(`LegUpper${side}`, pose.upper, 0, catches ? (side === 'L' ? -.11 : .11) * Math.min(1, Math.abs(state.footOffset ?? 0) / .38) : 0);
            this.rotate(`LegLower${side}`, pose.lower, 0, 0);
          }
          if (this.footSupports.length) {
            const floorAdjust = this.lowestSupport() - this.supportHeight;
            for (const name of ['Body', 'LegUpperL', 'LegUpperR']) { const joint = this.joints.get(name); if (joint) joint.object.position.y -= floorAdjust; }
          }
          if (recoil < .18) this.rotate('Body', .08 + brace * .22 + injury * .10, (rear === 'L' ? .24 : -.24) * brace, (rear === 'L' ? -.08 : .08) * brace);
          if (recoil < .18) this.rotate('Head', -.03, (rear === 'L' ? -.12 : .12) * brace, 0);
        }
      }
    }
    if (death !== undefined) {
      if (state.collapse === 'electric' || state.collapse === 'grounded') this.electricalCollapse(Math.max(0, death));
      else this.breakApart(Math.max(0, death));
      if (state.collapse === 'grounded' && !this.brute && !this.spectral) this.groundedSkeleton(Math.max(0, death));
      if (state.collapse === 'grounded' && this.brute) this.groundedGuardian(Math.max(0, death), recoil, state.impactSide ?? 1);
      if ((state.collapse === 'electric' || state.collapse === 'grounded') && death < .18 && (state.recoil ?? 0) > 0) {
        const hit = clamp(state.recoil ?? 0), side = state.impactSide ?? 1;
        this.rotate('Body', -.4 * hit, -.23 * hit * side, -.10 * hit * side);
        this.rotate('Head', -.3 * hit, .16 * hit * side, .13 * hit * side);
      }
    }
    if (this.authoredGuard && this.authoredGuardSupport) this.authoredGuard.apply(state, this.authoredGuardSupport);
  }

  private inSupportSpace(node: Object3D, point: Vector3): Vector3 {
    for (let current: Object3D | null = node; current && current !== this.supportParent; current = current.parent) {
      current.updateMatrix(); point.applyMatrix4(current.matrix);
    }
    return point;
  }

  private lowestSupport(): number {
    let lowest = Infinity;
    for (const support of this.footSupports) lowest = Math.min(lowest, this.inSupportSpace(support.node, this.supportPoint.copy(support.point)).y);
    return lowest;
  }

  private electricalCollapse(age: number): void {
    // The initial contraction reads as a strike; weight then settles through
    // bent knees. Joint attachments remain intact instead of exploding apart.
    const recoil = Math.sin(clamp(age / .24) * Math.PI);
    const fold = smooth((age - .08) / .44);
    const side = Math.sin(this.phase) * .045;
    const braced = Math.sin(this.phase * 1.7) > 0;
    // Sole-checked against the exported leg meshes: the deeper bend raises
    // the soles nonlinearly. Match that lift instead of adding a root shove.
    // The fold settles at .52s, before the existing .638s erosion onset.
    const soleLift = braced ? (this.brute ? .37 : .377) : (this.brute ? .404 : .45);
    const drop = this.spectral ? fold * .34 : Math.pow(fold, this.brute && !braced ? 1.95 : 1.65) * soleLift;
    for (const name of ['Body', 'LegUpperL', 'LegUpperR']) {
      const joint = this.joints.get(name);
      if (joint) joint.object.position.y -= drop;
    }
    this.rotate('Body', -.13 * recoil + fold * (this.spectral ? .18 : braced ? 1.12 : .91), side * fold, (this.spectral ? side : braced ? -.12 : .15) * fold);
    this.rotate('Head', -.18 * recoil + .19 * fold, -.05 * fold, side);
    this.rotate('LegUpperL', -(braced ? 1.56 : 1.2) * fold, -.025 * fold, -.035 * fold);
    this.rotate('LegUpperR', -(braced ? 1.35 : 1.65) * fold, .025 * fold, .035 * fold);
    this.rotate('LegLowerL', (braced ? 2.27 : 2.42) * fold, 0, 0);
    this.rotate('LegLowerR', (braced ? 2.05 : 2.15) * fold, 0, 0);
    for (const [sideName, sign] of [['L', -1], ['R', 1]] as const) {
      this.rotate(`ArmUpper${sideName}`, -.3 * recoil + .07 * fold, sign * .025, sign * (.035 + .055 * recoil));
      this.rotate(`ArmLower${sideName}`, -.4 * recoil - .07 * fold, 0, sign * .02);
    }
    if (!this.spectral && braced) {
      // The leading hand (or the revenant's shield) takes some weight while
      // the other arm drops. This is distinct from the lower-knee variant.
      this.rotate('ArmUpperL', -.3 * recoil - .8 * fold, -.08 * fold, -.11 * fold);
      this.rotate('ArmLowerL', -.4 * recoil - .4 * fold, 0, -.02 * fold);
    }
    this.rotate('Cape', .04 + .11 * fold, side, 0);
    this.rotate('Sword', .09 * fold, 0, 0);
  }

  private groundedSkeleton(age: number): void {
    const land = smooth((age - .22) / .48), side = -1;
    const braced = Math.sin(this.phase * 1.7) > 0;
    const body = this.joints.get('Body');
    if (body) body.object.position.y -= (.35 - (braced ? 0 : .073)) * land;
    // The rib cage moves beyond the knees and rests low, opening the former
    // compact squat into a directional fall with a visible shoulder support.
    this.rotate('Body', 1.58 * land, -.12 * side * land, .34 * side * land);
    this.rotate('Head', .10 * land, .18 * side * land, .12 * side * land);
    if (this.armored) {
      let low = -1.3, high = .15;
      const cached = land >= .9999 ? this.settledArmAngles.get('Cape') : undefined;
      for (let step = 0; cached === undefined && step < 8; step++) {
        const angle = (low + high) / 2; this.rotate('Cape', angle * land, -.10 * land, .12 * land);
        let minimum = Infinity;
        for (const p of this.capeSupports) minimum = Math.min(minimum, this.inSupportSpace(p.node, this.supportPoint.copy(p.point)).y);
        if (minimum < .02) low = angle; else high = angle;
      }
      if (land >= .9999 && cached === undefined) this.settledArmAngles.set('Cape', high);
      this.rotate('Cape', (cached ?? high) * land, -.10 * land, .12 * land);
    }
    this.rotate('ArmUpperL', .45 * land, -.15 * land, -.20 * land);
    this.rotate('ArmLowerL', .1 * land, 0, -.06 * land);
    this.rotate('ArmUpperR', .35 * land, .10 * land, .22 * land);
    this.rotate('ArmLowerR', .15 * land, 0, .06 * land);
    const slack = smooth((age - .62) / .16);
    if (slack > 0) for (const sideName of ['L', 'R']) {
      const left = sideName === 'L', points = this.armSupports.get(sideName);
      const apply = (upper: number, lower = -upper) => {
        this.rotate(`ArmUpper${sideName}`, upper, (left ? -.15 : .10) * land, (left ? -.20 : .22) * land);
        this.rotate(`ArmLower${sideName}`, lower, 0, (left ? -.06 : .06) * land);
        if (!left) { this.rotate('Sword', 0, 0, 0); this.layWeapon(); }
      };
      let low = -1.15, high = .65;
      const cached = land >= .9999 ? this.settledArmAngles.get(sideName) : undefined;
      if (cached === undefined && points?.length) for (let iteration = 0; iteration < 9; iteration++) {
        const middle = (low + high) / 2; apply(middle);
        let minimum = Infinity;
        for (const support of points) minimum = Math.min(minimum, this.inSupportSpace(support.node, this.supportPoint.copy(support.point)).y);
        if (minimum < .018) low = middle; else high = middle;
      }
      const target = cached ?? (points?.length ? high : -.45);
      if (land >= .9999) this.settledArmAngles.set(sideName, target);
      apply((left ? .45 : .35) * land * (1 - slack) + target * slack, (left ? .1 : .15) * land * (1 - slack) - target * slack);
    }
  }

  private layWeapon(): void {
    const sword = this.joints.get('Sword')?.object; if (!sword?.parent) return;
    const parent = sword.parent.getWorldQuaternion(new Quaternion());
    const along = new Vector3(0, 1, 0).applyQuaternion(parent.clone().multiply(sword.quaternion)).setY(0);
    if (along.lengthSq() < 1e-6) along.set(0, 0, 1); else along.normalize();
    const across = new Vector3(0, 1, 0).cross(along).normalize();
    const normal = across.clone().cross(along);
    const world = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across, along, normal));
    sword.quaternion.copy(parent.invert().multiply(world));
  }

  private groundedGuardian(age: number, recoil: number, side: number): void {
    const land = smooth((age - .23) / .5);
    const body = this.joints.get('Body'); if (body) body.object.position.y += -.12 * land + .075 * Math.sin(Math.PI * land);
    this.rotate('Body', 1.10 * land - .35 * recoil, -.24 * land - .18 * recoil * side, .56 * land - .12 * recoil * side);
    this.rotate('Head', .58 * land - .20 * recoil, .24 * land + .12 * recoil * side, .16 * land);
    this.rotate('ArmUpperL', .10 * land, -.08 * land, -.10 * land);
    this.rotate('ArmLowerL', .05 * land, 0, -.02 * land);
    this.rotate('ArmUpperR', -.30 * land, .38 * land, .22 * land);
    this.rotate('ArmLowerR', -1.10 * land, .28 * land, .05 * land);
  }

  private spectralMotion(seconds: number, state: EnemyPoseState): void {
    const body = this.joints.get('Body'); if (!body) return;
    const t = seconds + this.phase, age = state.deathAge;
    const recoil = clamp(state.recoil ?? 0), brace = clamp(state.brace ?? 0), side = state.impactSide ?? 1;
    const dying = age !== undefined, release = dying ? smooth((age - .16) / .95) : 0;
    const calm = dying ? 1 - smooth(age / .16) : 1 - Math.max(recoil, brace);
    const breath = Math.sin(t * .72), sway = Math.sin(t * .57);
    const lift = dying ? .12 * Math.sin(Math.PI * release) : 0;
    const arch = dying ? -.12 * Math.sin(Math.PI * release) : 0;
    // The robe, neck and staff were cut across rigid groups. Keep those groups
    // in their exact shared rest frames; animate the bearing as one form.
    this.rotate('Body', .010 * breath * calm - .115 * recoil + .025 * brace + arch,
      .036 * sway * calm - .07 * recoil * side + .055 * release * side,
      .008 * Math.sin(t * .73) * calm - .05 * recoil * side + .025 * release * side);
    body.object.position.y += lift;
    body.object.position.z -= .065 * recoil;
    // Phase-lagged fabric movement remains continuous through every source cut.
    const flutter = dying ? Math.sin(release * Math.PI * 2) * (1 - release) * 2 : .8 + .8 * Math.sin(t * .72 - 1.15);
    const clothCatch = clamp(state.catchStep ?? state.brace ?? 0);
    for (const garment of this.garments) {
      garment.morphTargetInfluences![0] = (.5 + .5 * breath) * calm + .6 * brace;
      // Catch-step peaks after the chest brace and decays later. This lets the
      // lower cloth pass the recovering torso instead of stopping with it.
      garment.morphTargetInfluences![1] = flutter * (dying ? 1 : calm) + (dying ? 1.7 * brace : 2.8 * clothCatch * side);
      garment.morphTargetInfluences![2] = dying ? release : .11 * brace;
    }
    // Rotating about the chest must not put the trailing hem or staff below
    // the floor. Move the common parent only; joins stay exact.
    body.object.updateWorldMatrix(true, true);
    const parent = body.object.parent;
    if (parent) this.spectralParentInverse.copy(parent.matrixWorld).invert();
    let minimum = Infinity;
    for (const garment of this.garments) {
      const count = garment.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i++) {
        garment.getVertexPosition(i, this.supportPoint).applyMatrix4(garment.matrixWorld);
        if (parent) this.supportPoint.applyMatrix4(this.spectralParentInverse);
        minimum = Math.min(minimum, this.supportPoint.y);
      }
    }
    if (minimum < .06) body.object.position.y += .06 - minimum;
  }

  private rotate(name: string, x: number, y: number, z: number): void {
    const joint = this.joints.get(name); if (!joint) return;
    this.offset.setFromEuler(this.euler.set(x, y, z));
    joint.object.quaternion.copy(joint.rotation).multiply(this.offset);
  }

  private breakApart(age: number): void {
    if (age <= .12) return; // Let the initial shoulder/head recoil read first.
    const release = smooth((age - .12) / .38), fall = Math.max(0, age - .28);
    for (const [name, joint] of this.joints) {
      if (name === 'Body') continue;
      const sign = name.endsWith('L') ? -1 : name.endsWith('R') ? 1 : Math.sin(joint.index * 2.3 + this.phase);
      const isLeg = name.startsWith('Leg'), isLower = name.includes('Lower');
      const lateral = (isLower ? .18 : isLeg ? .16 : .32) * release;
      joint.object.position.x += sign * lateral;
      joint.object.position.y += (name === 'Head' ? .34 : .12) * Math.sin(Math.min(1, age / .8) * Math.PI) - fall * fall * (isLeg ? .55 : .85);
      joint.object.position.z += Math.sin(this.phase + joint.index * 1.7) * .20 * release;
      this.rotate(name, release * (.25 + Math.sin(joint.index + this.phase) * .65), sign * release * .55, sign * release * (isLeg ? .48 : .95));
    }
  }
}
