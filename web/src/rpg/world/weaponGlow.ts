import * as THREE from 'three';
import type { RpgWeaponGlow } from '@institute/shared';

const MOTES = 72;
const WHITE = new THREE.Color(1, 1, 1);
/** Motes born each second, by how the glow moves; sparks are quick and many. */
const RATE: Record<RpgWeaponGlow['motion'], number> = { rise: 26, drift: 16, spark: 42, twinkle: 18, swirl: 30 };
const LIFE: Record<RpgWeaponGlow['motion'], number> = { rise: .9, drift: 1.5, spark: .22, twinkle: 1.3, swirl: 1.1 };

/**
 * The merchant's weapon glow: a soft light sheath along the held blade and
 * motes that leave it in the glow's own way (embers rise, frost drifts, sparks
 * jump, stars twinkle, a swirl circles the blade). A hand relic without a
 * blade glows round the hand instead. Allocates nothing per frame.
 */
export class WeaponGlow {
  readonly group = new THREE.Group();
  private glow?: RpgWeaponGlow;
  private readonly sheath: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Lights the hero's hand and the floor in the glow's colour. Always in the scene, so turning it on never recompiles a shader. */
  readonly light = new THREE.PointLight(0xffffff, 0, 3.4, 1.8);
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly corners = new Float32Array(12);
  private readonly position = new Float32Array(MOTES * 3);
  private readonly tint = new Float32Array(MOTES * 3);
  private readonly fade = new Float32Array(MOTES);
  private readonly size = new Float32Array(MOTES);
  private readonly velocity = new Float32Array(MOTES * 3);
  private readonly age = new Float32Array(MOTES).fill(Infinity);
  /** Swirl motes keep a place on the blade and an angle round it, instead of a velocity. */
  private readonly along = new Float32Array(MOTES);
  private readonly turn = new Float32Array(MOTES);
  private next = 0; private owed = 0;
  private readonly axis = new THREE.Vector3(); private readonly side = new THREE.Vector3(); private readonly normal = new THREE.Vector3();
  private readonly view = new THREE.Vector3(); private readonly point = new THREE.Vector3(); private readonly color = new THREE.Color();
  private readonly lastGrip = new THREE.Vector3(); private readonly lastTip = new THREE.Vector3();

  constructor() {
    this.group.name = 'WeaponGlow'; this.group.visible = false;
    const sheath = new THREE.BufferGeometry();
    sheath.setAttribute('position', new THREE.BufferAttribute(this.corners, 3).setUsage(THREE.DynamicDrawUsage));
    sheath.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    sheath.setIndex([0, 1, 2, 0, 2, 3]);
    this.sheath = new THREE.Mesh(sheath, new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color() }, time: { value: 0 }, rainbow: { value: 0 }, strength: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform vec3 color; uniform float time; uniform float rainbow; uniform float strength; varying vec2 vUv;
        vec3 hue(float h) { return clamp(abs(mod(h * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }
        void main() {
          float d = abs(vUv.x - .5) * 2., ends = smoothstep(0., .16, vUv.y) * smoothstep(1., .8, vUv.y);
          float soft = exp(-d * d * 3.5), core = exp(-d * d * 45.);
          float ripple = .82 + .18 * sin(vUv.y * 18. - time * 5.);
          vec3 tone = mix(color, hue(fract(vUv.y * .8 - time * .35)), rainbow);
          gl_FragColor = vec4(mix(tone, vec3(1.), core * .5), (soft * .62 * ripple + core * .95) * ends * strength);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.sheath.frustumCulled = false; this.sheath.renderOrder = 3;
    const motes = new THREE.BufferGeometry();
    motes.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    motes.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    motes.setAttribute('fade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    motes.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.motes = new THREE.Points(motes, new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 }, star: { value: 0 } },
      vertexShader: `attribute vec3 tint; attribute float fade; attribute float size; uniform float scale; varying vec3 vTint; varying float vFade;
        void main() { vTint = tint; vFade = fade; vec4 view = modelViewMatrix * vec4(position, 1.); gl_PointSize = size * scale / -view.z; gl_Position = projectionMatrix * view; }`,
      // A round soft mote, or a four-pointed star for the twinkling glows.
      fragmentShader: `uniform float star; varying vec3 vTint; varying float vFade;
        void main() {
          vec2 p = gl_PointCoord * 2. - 1.; float r = length(p);
          float dot = smoothstep(1., 0., r), rays = max(0., 1. - abs(p.x) * 7.) * smoothstep(1., 0., abs(p.y)) + max(0., 1. - abs(p.y) * 7.) * smoothstep(1., 0., abs(p.x));
          float shape = mix(dot * dot, max(rays, smoothstep(.35, 0., r)), star);
          if (shape * vFade < .004) discard;
          gl_FragColor = vec4(mix(vTint, vec3(1.), smoothstep(.3, 0., r) * .6), shape * vFade);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.motes.frustumCulled = false; this.motes.renderOrder = 3;
    this.group.add(this.sheath, this.motes);
  }

  /** Shows a glow, or none. Motes already in the air fade out on their own. */
  set(glow?: RpgWeaponGlow): void {
    this.glow = glow; this.group.visible = !!glow;
    if (!glow) { this.age.fill(Infinity); this.light.intensity = 0; return; }
    this.light.color.set(glow.color);
    this.sheath.material.uniforms.color.value.set(glow.color);
    this.sheath.material.uniforms.rainbow.value = glow.rainbow ? 1 : 0;
    this.motes.material.uniforms.star.value = glow.motion === 'twinkle' ? 1 : 0;
  }

  /**
   * One frame. `grip`/`tip` are the blade's world ends; with no blade, pass
   * the hand for both. `eye` is the camera position; `pixels` the canvas height.
   */
  update(delta: number, time: number, grip: THREE.Vector3, tip: THREE.Vector3, eye: THREE.Vector3, pixels: number): void {
    const glow = this.glow;
    if (!glow) return;
    const bladeless = grip.distanceToSquared(tip) < 1e-6;
    // A bare hand gets a short upright sheath, like a lantern of the glow's light.
    if (bladeless) { this.lastGrip.copy(grip).y -= .16; this.lastTip.copy(grip).y += .2; }
    else { this.lastGrip.copy(grip); this.lastTip.copy(tip); }
    this.axis.subVectors(this.lastTip, this.lastGrip);
    const length = this.axis.length() || 1;
    this.axis.divideScalar(length);
    this.view.copy(eye).sub(this.lastGrip).normalize();
    this.side.crossVectors(this.axis, this.view).normalize();
    this.normal.crossVectors(this.side, this.axis);
    // The sheath reaches a little past both ends so its soft tips never cut off.
    const width = bladeless ? .32 : .2 + length * .06, reach = .12;
    const corner = (index: number, end: THREE.Vector3, along: number, across: number) => {
      this.point.copy(end).addScaledVector(this.axis, along).addScaledVector(this.side, across);
      this.corners[index * 3] = this.point.x; this.corners[index * 3 + 1] = this.point.y; this.corners[index * 3 + 2] = this.point.z;
    };
    corner(0, this.lastGrip, -reach, -width); corner(1, this.lastGrip, -reach, width); corner(2, this.lastTip, reach, width); corner(3, this.lastTip, reach, -width);
    this.sheath.geometry.attributes.position!.needsUpdate = true;
    const uniforms = this.sheath.material.uniforms;
    uniforms.time.value = time; uniforms.strength.value = .85 + Math.sin(time * 3.1) * .1;
    this.light.position.lerpVectors(this.lastGrip, this.lastTip, .6);
    this.light.intensity = 2.2 * uniforms.strength.value;
    if (glow.rainbow) this.light.color.setHSL((time * .3) % 1, .8, .6);
    this.motes.material.uniforms.scale.value = pixels * .5;
    this.owed += delta * RATE[glow.motion];
    while (this.owed >= 1) { this.owed--; this.spawn(glow, time); }
    const life = LIFE[glow.motion];
    for (let i = 0; i < MOTES; i++) {
      const age = this.age[i]! += delta;
      if (age >= life) { this.fade[i] = 0; continue; }
      const k = i * 3, t = age / life;
      if (glow.motion === 'swirl') {
        // Circles the blade where it was born, rising a little as it fades.
        const angle = this.turn[i]! + age * 4.2, radius = .07 + t * .09;
        this.point.copy(this.lastGrip).addScaledVector(this.axis, this.along[i]! * length)
          .addScaledVector(this.side, Math.cos(angle) * radius).addScaledVector(this.normal, Math.sin(angle) * radius);
        this.position[k] = this.point.x; this.position[k + 1] = this.point.y + t * .18; this.position[k + 2] = this.point.z;
      } else {
        const drag = glow.motion === 'spark' ? .86 : .97;
        this.velocity[k] *= drag; this.velocity[k + 2] *= drag;
        if (glow.motion === 'drift') { this.velocity[k] += Math.sin(time * 2 + i) * delta * .3; this.velocity[k + 2] += Math.cos(time * 1.7 + i) * delta * .3; }
        this.position[k] += this.velocity[k]! * delta; this.position[k + 1] += this.velocity[k + 1]! * delta; this.position[k + 2] += this.velocity[k + 2]! * delta;
      }
      const twinkle = glow.motion === 'twinkle' ? .55 + .45 * Math.sin(age * 17 + i * 3) : 1;
      this.fade[i] = Math.min(1, t * 6) * (1 - t) * (1 - t * .3) * twinkle;
      if (glow.rainbow) { this.color.setHSL((time * .3 + i * .13) % 1, .9, .62); this.tint[k] = this.color.r; this.tint[k + 1] = this.color.g; this.tint[k + 2] = this.color.b; }
    }
    const attributes = this.motes.geometry.attributes;
    attributes.position!.needsUpdate = true; attributes.fade!.needsUpdate = true; attributes.size!.needsUpdate = true;
    if (glow.rainbow) attributes.tint!.needsUpdate = true;
  }

  private spawn(glow: RpgWeaponGlow, time: number): void {
    const i = this.next, k = i * 3; this.next = (this.next + 1) % MOTES;
    const along = glow.motion === 'spark' ? Math.random() : .15 + Math.random() * .9;
    this.point.lerpVectors(this.lastGrip, this.lastTip, along);
    const spread = glow.motion === 'spark' ? .05 : .08;
    this.point.addScaledVector(this.side, (Math.random() - .5) * spread * 2).addScaledVector(this.normal, (Math.random() - .5) * spread * 2);
    this.position[k] = this.point.x; this.position[k + 1] = this.point.y; this.position[k + 2] = this.point.z;
    this.age[i] = 0; this.along[i] = along; this.turn[i] = Math.random() * Math.PI * 2;
    const r = () => Math.random() - .5;
    switch (glow.motion) {
      case 'rise': this.velocity.set([r() * .2, .55 + Math.random() * .35, r() * .2], k); break;
      case 'drift': this.velocity.set([r() * .25, .05 + r() * .15, r() * .25], k); break;
      case 'spark': this.velocity.set([r() * 1.8, r() * 1.4, r() * 1.8], k); break;
      default: this.velocity.set([r() * .08, .06 + Math.random() * .08, r() * .08], k);
    }
    this.size[i] = glow.motion === 'spark' ? .16 + Math.random() * .1 : glow.motion === 'twinkle' ? .34 + Math.random() * .2 : .2 + Math.random() * .16;
    // Most motes take the glow's colour; a few run white-hot so it sparkles.
    this.color.set(glow.color);
    if (glow.rainbow) this.color.setHSL((time * .3 + i * .13) % 1, .9, .62);
    else if (Math.random() < .25) this.color.lerp(WHITE, .6);
    this.tint[k] = this.color.r; this.tint[k + 1] = this.color.g; this.tint[k + 2] = this.color.b;
    this.motes.geometry.attributes.tint!.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent(); this.light.removeFromParent();
    this.sheath.geometry.dispose(); this.sheath.material.dispose();
    this.motes.geometry.dispose(); this.motes.material.dispose();
  }
}
