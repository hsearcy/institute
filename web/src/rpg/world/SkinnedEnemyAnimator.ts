import { Bone, BufferGeometry, Euler, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three';
import type { EnemyPoseState } from './EnemyAnimator';
import { solveTwoBoneWorld } from './skeletalLegIK';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const supportIndices = new WeakMap<BufferGeometry, Map<string, number[]>>();
type Joint = { bone: Bone; position: Vector3; rotation: Quaternion; frame: Quaternion; point: Vector3; worldRotation: Quaternion; previousPosition: Vector3; previousRotation: Quaternion };

/** Poses the approved meshes through their own skin weights, in model-space axes. */
export class SkinnedEnemyAnimator {
  private hasLivingPose = false;
  private readonly joints = new Map<string, Joint>();
  private readonly meshes: SkinnedMesh[] = [];
  private readonly surfaceSamples: { mesh: SkinnedMesh; index: number }[] = [];
  private readonly contacts = new Map<string, Vector3[]>();
  private readonly angles = new Euler();
  private readonly turn = new Quaternion();
  private readonly point = new Vector3();
  private readonly height: number;
  private readonly heavy: boolean;
  private readonly boss: boolean;
  private readonly armored: boolean;
  private readonly modelScale: number;

  static create(root: Object3D, kind: string, phase: number): SkinnedEnemyAnimator | undefined {
    let found = false;
    root.traverse(o => { if (o instanceof SkinnedMesh && o.skeleton.bones.some(b => b.name === 'Pelvis')) found = true; });
    return found ? new SkinnedEnemyAnimator(root, kind, phase) : undefined;
  }

  private constructor(private readonly root: Object3D, kind: string, private readonly phase: number) {
    this.heavy = kind === 'guardian' || kind === 'vault-guardian-boss';
    this.boss = kind === 'vault-guardian-boss'; this.armored = kind === 'revenant';
    this.updateMatrices();
    const rootRotation = root.getWorldQuaternion(new Quaternion()).invert();
    root.traverse(o => {
      if (o instanceof Bone) this.joints.set(o.name, { bone: o, position: o.position.clone(), rotation: o.quaternion.clone(),
        frame: rootRotation.clone().multiply(o.parent!.getWorldQuaternion(new Quaternion())),
        point: root.worldToLocal(o.getWorldPosition(new Vector3())),
        worldRotation: rootRotation.clone().multiply(o.getWorldQuaternion(new Quaternion())), previousPosition: o.position.clone(), previousRotation: o.quaternion.clone() });
      if (o instanceof SkinnedMesh) this.meshes.push(o);
    });
    this.height = Math.max(.1, (this.joints.get('Head')?.point.y ?? 1) * 1.15);
    this.modelScale = this.joints.get('Pelvis')!.bone.parent!.getWorldScale(new Vector3()).y / root.getWorldScale(new Vector3()).y;
    if (this.meshes.every(mesh => supportIndices.has(mesh.geometry))) {
      for (const mesh of this.meshes) for (const [name, indices] of supportIndices.get(mesh.geometry)!) {
        const bone = this.joints.get(name)!.bone;
        const points = indices.map(index => {
          this.surfaceSamples.push({ mesh, index });
          return bone.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(index, new Vector3())));
        });
        this.contacts.set(name, [...(this.contacts.get(name) ?? []), ...points]);
      }
      return;
    }
    for (const mesh of this.meshes) supportIndices.set(mesh.geometry, new Map());
    // Cache extremal surface points around each support joint. Ground contact
    // uses the mesh surface, not the ankle or wrist origin.
    const samples = new Map<string, Vector3[]>();
    const indices = new WeakMap<Vector3, { mesh: SkinnedMesh; index: number }>();
    for (const mesh of this.meshes) {
      const ids = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
      for (let i = 0; i < ids.count; i++) {
        let slot = 0; for (let j = 1; j < 4; j++) if (weights.getComponent(i,j) > weights.getComponent(i,slot)) slot = j;
        const bone = mesh.skeleton.bones[ids.getComponent(i,slot)];
        const point = bone.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i, new Vector3())));
        indices.set(point, { mesh, index: i });
        if (!samples.has(bone.name)) samples.set(bone.name, []);
        samples.get(bone.name)!.push(point);
      }
    }
    for (const [name, points] of samples) {
      const extreme = new Set<Vector3>();
      for (let i = 0; i < 48; i++) {
        const y = 1 - 2 * i / 47, r = Math.sqrt(1 - y*y), theta = i * 2.399963;
        const direction = new Vector3(r * Math.cos(theta), y, r * Math.sin(theta));
        extreme.add(points.reduce((best, p) => p.dot(direction) > best.dot(direction) ? p : best));
      }
      this.contacts.set(name, [...extreme]);
      for (const point of extreme) {
        const sample = indices.get(point)!; this.surfaceSamples.push(sample);
        const cache = supportIndices.get(sample.mesh.geometry)!;
        if (!cache.has(name)) cache.set(name, []);
        cache.get(name)!.push(sample.index);
      }
    }
  }

  private updateMatrices(): void {
    // SkinnedMesh updates its bind inverse in updateMatrixWorld, not in
    // Object3D.updateWorldMatrix. Refresh parents first, then invoke that hook.
    this.root.updateWorldMatrix(true, false);
    this.root.updateMatrixWorld(true);
  }

  private blendFromLiving(deathAge: number): void {
    const transition = ease(deathAge / .12);
    if (!this.hasLivingPose || transition >= 1) return;
    for (const joint of this.joints.values()) {
      joint.bone.position.lerp(joint.previousPosition, 1 - transition);
      joint.bone.quaternion.slerp(joint.previousRotation, 1 - transition);
    }
    this.updateMatrices();
    for (const mesh of this.meshes) mesh.skeleton.update();
  }

  private rotate(name: string, x: number, y = 0, z = 0): void {
    const joint = this.joints.get(name); if (!joint) return;
    this.turn.setFromEuler(this.angles.set(x, y, z));
    joint.bone.quaternion.copy(joint.frame).invert().multiply(this.turn).multiply(joint.frame).multiply(joint.rotation);
  }

  private floorHeight(joint: Joint, rotation: Quaternion): number {
    const scale = joint.bone.getWorldScale(new Vector3());
    let minimum = Infinity;
    for (const p of this.contacts.get(joint.bone.name) ?? []) minimum = Math.min(minimum, this.point.copy(p).multiply(scale).applyQuaternion(rotation).y);
    return this.root.getWorldPosition(new Vector3()).y - (Number.isFinite(minimum) ? minimum : 0);
  }

  private restWeaponOnFloor(blend: number): void {
    const weapon = this.joints.get('WeaponR'); if (!weapon || blend <= 0) return;
    const current = weapon.bone.getWorldQuaternion(new Quaternion());
    const along = new Vector3(0,1,0).applyQuaternion(current), actor = this.root.getWorldQuaternion(new Quaternion());
    const height = weapon.bone.getWorldPosition(new Vector3()).y;
    let low = 0, high = 1.5;
    for (let i = 0; i < 10; i++) {
      const slope = (low + high) / 2;
      const direction = new Vector3(-.6,-slope,.8).normalize().applyQuaternion(actor);
      const rotation = new Quaternion().setFromUnitVectors(along,direction).multiply(current);
      if (height >= this.floorHeight(weapon,rotation)) low = slope; else high = slope;
    }
    const direction = new Vector3(-.6,-low,.8).normalize().applyQuaternion(actor);
    const desired = new Quaternion().setFromUnitVectors(along,direction).multiply(current);
    weapon.bone.quaternion.slerp(weapon.bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(desired),blend);
  }

  private rigidFall(state: EnemyPoseState): void {
    const age = state.deathAge!, recoil = clamp(state.recoil ?? 0);
    const fall = ease((age - .20) / (this.boss ? 1.04 : .86));
    const yieldBody = ease((age - .12) / .55), side = state.impactSide ?? 1;
    const pelvis = this.joints.get('Pelvis')!;
    this.point.set(0, -this.height * .2 * yieldBody, this.height * .18 * fall).divideScalar(this.modelScale).applyQuaternion(pelvis.frame.clone().invert());
    pelvis.bone.position.add(this.point);
    this.rotate('Pelvis', (this.armored ? .55 : this.boss ? 1.40 : 1.50) * fall, 0, (this.armored ? -1.50 : (this.boss ? .09 : -.04) * side) * fall);
    this.rotate('Spine', -.10 * recoil + .12 * fall);
    this.rotate('Chest', -.18 * recoil + .08 * fall, -.05 * recoil * side);
    this.rotate('Head', .08 * fall);
    for (const [s, sign] of [['L', -1], ['R', 1]] as const) {
      const lag = this.boss && s === 'L' ? ease((age - .30) / 1.0) : fall;
      const reach = Math.sin(lag * Math.PI) * (this.armored ? .25 : .65);
      this.rotate(`UpperArm${s}`, -.16 * recoil - reach - .25 * lag, 0, this.armored && s === 'R' ? .25 * lag : sign * .08 * lag);
      this.rotate(`Forearm${s}`, .28 * lag, 0, this.armored && s === 'R' ? .7 * lag : 0);
      this.rotate(`Hand${s}`, -.06 * lag);
      this.rotate(`Thigh${s}`, -.20 * fall, 0, this.armored && s === 'R' ? .4 * fall : 0);
      this.rotate(`Shin${s}`, .42 * fall);
      this.rotate(`Foot${s}`, -.15 * fall);
    }
    this.updateMatrices();
    const weapon = this.joints.get('WeaponR');
    if (weapon && fall > 0) {
      const current = weapon.bone.getWorldQuaternion(new Quaternion());
      const along = new Vector3(0,1,0).applyQuaternion(current);
      const target = new Vector3(-.6,0,.8).applyQuaternion(this.root.getWorldQuaternion(new Quaternion()));
      const desired = new Quaternion().setFromUnitVectors(along,target).multiply(current);
      weapon.bone.quaternion.slerp(weapon.bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(desired), ease((fall-.05)/.6));
      this.updateMatrices();
    }
    // Once the legs yield, support transfers to the continuous stone shell.
    // Shallow hinge angles preserve its fused surfaces through the prone fall.
    let floor = Infinity;
    for (const mesh of this.meshes) mesh.skeleton.update();
    for (const sample of this.surfaceSamples) {
      sample.mesh.getVertexPosition(sample.index, this.point).applyMatrix4(sample.mesh.matrixWorld);
      floor = Math.min(floor, this.point.y);
    }
    const worldFloor = this.root.getWorldPosition(new Vector3()).y;
    if (Number.isFinite(floor)) {
      const correction = (worldFloor - floor) / this.root.getWorldScale(new Vector3()).y;
      this.point.set(0, correction, 0).divideScalar(this.modelScale).applyQuaternion(pelvis.frame.clone().invert());
      pelvis.bone.position.add(this.point);
    }
    this.updateMatrices();
    if (this.armored) { this.restWeaponOnFloor(ease((fall-.4)/.6)); this.updateMatrices(); }
    for (const mesh of this.meshes) mesh.skeleton.update();
  }

  update(seconds: number, state: EnemyPoseState): void {
    for (const j of this.joints.values()) { j.bone.position.copy(j.position); j.bone.quaternion.copy(j.rotation); }
    const pelvis = this.joints.get('Pelvis'); if (!pelvis) return;
    if ((this.heavy || this.armored) && state.deathAge !== undefined) {
      this.rigidFall(state);
      this.blendFromLiving(state.deathAge);
      return;
    }
    const t = seconds + this.phase, death = state.deathAge;
    const recoil = clamp(state.recoil ?? 0), brace = clamp(state.brace ?? 0);
    const calm = (1 - Math.max(recoil, brace)) * (death === undefined ? 1 : 1 - ease(death / .25)), rate = this.boss ? .65 : this.heavy ? .8 : this.armored ? 1.05 : 1.3;
    const breathe = Math.sin(t * rate), glance = Math.sin(t * .37);
    const weight = this.heavy ? .8 : this.armored ? .85 : 1;
    const side = state.impactSide ?? (Math.sin(this.phase * 2.37) < 0 ? -1 : 1);
    let drop = this.height * (.006 + .003 * breathe) * calm + this.height * .035 * brace;
    let back = this.height * .012 * brace;
    let fold = 0, settle = 0;
    if (death !== undefined) {
      const speed = this.boss ? 1.2 : this.heavy ? 1.05 : this.armored ? .95 : .8;
      fold = ease((death - .12) / speed);
      settle = ease((death - speed * .85) / .48);
      drop = this.height * (this.boss ? .23 : this.heavy ? .243 : this.armored ? .242 : .29) * fold + this.height * .035 * settle;
      back = this.height * (this.heavy ? -.035 : .02) * fold;
    }
    // Convert model-space translation into the pelvis parent's rest axes.
    this.point.set(this.heavy ? this.height * .009 * Math.sin(t * rate * .5) * calm : 0, -drop, -back).divideScalar(this.modelScale).applyQuaternion(pelvis.frame.clone().invert());
    pelvis.bone.position.add(this.point);
    this.rotate('Pelvis', .02 * breathe * calm + (this.heavy ? .1 : .3) * fold, 0, (death === undefined ? .008 * breathe : (this.boss ? .14 : this.heavy ? .02 : .10) * side * fold));
    this.rotate('Spine', .018 * breathe * calm - .12 * recoil * weight - .08 * brace + fold * .80 + .12 * settle, -.07 * recoil * side, .04 * recoil * side);
    this.rotate('Chest', .022 * breathe * calm - .22 * recoil * weight - .12 * brace + fold * (this.heavy ? .18 : .28), .025 * glance * calm - .14 * recoil * side, .045 * recoil * side);
    this.rotate('Head', -.02 + .02 * Math.sin(t * .9) * calm - .15 * recoil + .22 * fold + (this.boss ? .5 : .28) * settle, (this.armored ? .065 : this.heavy ? .04 : .14) * glance * calm, -.055 * recoil * side);
    for (const [s, sign] of [['L', -1], ['R', 1]] as const) {
      const shield = this.armored && s === 'L';
      const follow = this.boss ? clamp(state.catchStep ?? 0) : brace;
      this.rotate(`UpperArm${s}`, (shield ? -.12 : -.035) + .02 * Math.sin(t * rate + sign) * calm - recoil * (this.boss ? .12 : .18) - .25 * follow + (this.armored && shield ? .09 * breathe * calm : this.heavy ? .045 * sign * Math.sin(t * rate * .5) * calm : 0) + fold * (shield ? -.8 : this.heavy ? -.9 : -.65), 0, sign * (.025 + .06 * recoil));
      this.rotate(`Forearm${s}`, (shield ? -.20 : -.06) - .16 * recoil - .18 * follow + fold * (shield ? -.3 : .12));
      this.rotate(`Hand${s}`, .025 * breathe * calm + .06 * fold);
    }
    this.rotate('Cloth', .025 * Math.sin(t * rate - .5) * calm, .015 * glance * calm, .025 * breathe * calm);
    // Feet remain at their rest contacts while the hips shift and knees flex.
    this.updateMatrices();
    const cloth = this.joints.get('Cloth');
    if (cloth && fold > 0) {
      let low = 0, high = 1.5;
      for (let i = 0; i < 9; i++) {
        const angle = (low + high) / 2;
        this.rotate('Cloth', angle); cloth.bone.updateWorldMatrix(true, false);
        if (cloth.bone.getWorldPosition(new Vector3()).y < this.floorHeight(cloth, cloth.bone.getWorldQuaternion(new Quaternion())) + .008) low = angle;
        else high = angle;
      }
      this.rotate('Cloth', high); this.updateMatrices();
    }
    const worldScale = this.root.getWorldScale(this.point).y;
    for (const s of ['L', 'R']) {
      const hip = this.joints.get(`Thigh${s}`), shin = this.joints.get(`Shin${s}`), foot = this.joints.get(`Foot${s}`);
      if (!hip || !shin || !foot) continue;
      const catchSide = (side < 0 ? 'L' : 'R') === s;
      const lift = death === undefined && catchSide ? (state.footLift ?? 0) / worldScale : 0;
      const travel = (state.supportTravel ?? 0) / worldScale;
      const offset = death === undefined && catchSide ? (state.footOffset ?? 0) / worldScale * .35 : 0;
      const kneel = ease((fold - (this.boss && s === 'R' ? .36 : .15)) / (this.boss && s === 'R' ? .6 : .75));
      const target = this.root.localToWorld(foot.point.clone().add(new Vector3(0, lift, travel + offset - this.height * .18 * kneel)));
      const pole = this.root.localToWorld(hip.point.clone().add(new Vector3(0, -this.height * 1.5 * kneel, this.height)));
      const rotation = this.root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .85 * kneel)).multiply(foot.worldRotation);
      target.y = this.floorHeight(foot, rotation) + lift * worldScale;
      solveTwoBoneWorld(hip.bone, shin.bone, foot.bone, target, pole, rotation);
    }
    this.updateMatrices();
    if (!this.armored && fold > 0) {
      for (const s of ['L', 'R']) {
        if (!this.heavy && s === 'R') continue;
        const upper = this.joints.get(`UpperArm${s}`), lower = this.joints.get(`Forearm${s}`), hand = this.joints.get(`Hand${s}`);
        if (!upper || !lower || !hand) continue;
        const contact = ease((fold - (this.boss && s === 'L' ? .36 : .12)) / .62);
        const target = this.root.localToWorld(new Vector3(hand.point.x, this.height * .13, this.height * (this.heavy ? .25 : .12)));

        const pole = this.root.localToWorld(new Vector3(hand.point.x * 1.3, this.height * .6, -this.height * .3));
        const rotation = this.root.getWorldQuaternion(new Quaternion()).multiply(hand.worldRotation);
        target.y = this.floorHeight(hand, rotation);
        target.lerp(hand.bone.getWorldPosition(new Vector3()), 1 - contact);
        solveTwoBoneWorld(upper.bone, lower.bone, hand.bone, target, pole, rotation);
      }
    }
    const weapon = this.joints.get('WeaponR');
    if (weapon && fold > 0) {
      const parent = weapon.bone.parent!.getWorldQuaternion(new Quaternion());
      const current = weapon.bone.getWorldQuaternion(new Quaternion());
      const along = new Vector3(0, 1, 0).applyQuaternion(current);
      const actorRotation = this.root.getWorldQuaternion(new Quaternion());
      const height = weapon.bone.getWorldPosition(new Vector3()).y;
      let low = 0, high = .95;
      for (let i = 0; i < 9; i++) {
        const slope = (low + high) / 2;
        const direction = new Vector3(-.6, -slope, .8).normalize().applyQuaternion(actorRotation);
        const rotation = new Quaternion().setFromUnitVectors(along, direction).multiply(current);
        if (height >= this.floorHeight(weapon, rotation)) low = slope; else high = slope;
      }
      const target = new Vector3(-.6, -low * settle, .8).normalize().applyQuaternion(actorRotation);
      const desired = new Quaternion().setFromUnitVectors(along, target).multiply(current);
      weapon.bone.quaternion.slerp(parent.invert().multiply(desired), ease((fold - .12) / .65));
      this.updateMatrices();
    }
    for (const mesh of this.meshes) mesh.skeleton.update();
    if (death === undefined) {
      this.hasLivingPose = true;
      for (const joint of this.joints.values()) { joint.previousPosition.copy(joint.bone.position); joint.previousRotation.copy(joint.bone.quaternion); }
    } else this.blendFromLiving(death);
  }
}
