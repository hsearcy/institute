import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CHAIN_FIRST_CONTACT = .35;
export const CHAIN_CONTACT_SPAN = .52;
export const CHAIN_ECHO_DELAY = .45;
export const CHAIN_BOLT_LIFETIME = .22;

/** A single leading flash and decisive decay keep the next jump dominant. */
export function chainLightningMaterial(charge = false): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { progress: { value: 0 }, opacity: { value: 1 }, charge: { value: charge ? 1 : 0 } },
    vertexShader: `attribute float strength;varying vec2 vUv;varying float vStrength;
      void main(){vUv=uv;vStrength=strength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vStrength;uniform float progress;uniform float opacity;uniform float charge;
      void main(){float d=abs(vUv.y-.5)*2.,aa=max(fwidth(d),.045);
        float core=1.-smoothstep(.11,.21+aa,d);
        float envelope=exp(-d*d*3.2)*.42;
        float front=.68+progress*1.8;
        float impulse=exp(-pow((vUv.x-front)/.2,2.));
        float flash=charge>.5?(.8+.2*pow(sin(progress*29.),2.)):(1.-smoothstep(.2,1.,progress));
        float ends=smoothstep(0.,.012,vUv.x)*(1.-smoothstep(.97,1.,vUv.x));
        float strength=vStrength*(.72+.28*impulse);
        vec3 color=vec3(1.6,1.85,2.2)*core+vec3(.2,.5,1.4)*envelope;
        gl_FragColor=vec4(color,clamp((core+envelope)*flash*strength*ends*opacity,0.,1.));}`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, forceSinglePass: true, toneMapped: false,
  });
}

/** Uneven kinks, width, and short branches avoid equally thin straight wires.
 * All construction happens once per discharge; the endpoints remain exact. */
export function chainLightningGeometry(from: Vector3, to: Vector3, view: Vector3, seed: number, branches = true, halfWidth = .065): BufferGeometry {
  let state = seed | 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  const positions: number[] = [], uv: number[] = [], strength: number[] = [], indices: number[] = [];
  const direction = to.clone().sub(from), length = direction.length(); direction.normalize();
  const across = direction.clone().cross(Math.abs(direction.y) < .85 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
  const depth = direction.clone().cross(across).normalize();
  const path = (start: Vector3, end: Vector3, steps: number, scatter: number) => Array.from({ length: steps + 1 }, (_, index) => {
    const t = index === 0 ? 0 : index === steps ? 1 : (index + (random() - .5) * .65) / steps;
    const point = start.clone().lerp(end, t);
    if (index > 0 && index < steps) point.addScaledVector(across, (random() - .5) * scatter).addScaledVector(depth, (random() - .5) * scatter * .45);
    return point;
  });
  const add = (points: Vector3[], power: number) => {
    const offset = positions.length / 3;
    points.forEach((point, index) => {
      const tangent = points[Math.min(points.length - 1, index + 1)].clone().sub(points[Math.max(0, index - 1)]).normalize();
      const side = tangent.cross(view).normalize(); if (side.lengthSq() < .01) side.copy(across);
      const taper = power < 1 ? 1 - index / (points.length - 1) * .85 : 1;
      const t = index / (points.length - 1);
      const peakA = Math.exp(-Math.pow((t - .23) / .105, 2));
      const peakB = Math.exp(-Math.pow((t - .72) / .16, 2));
      const width = halfWidth * power * taper * (.52 + 1.1 * peakA + .65 * peakB) * (.9 + random() * .2);
      const heat = power * (.43 + .72 * peakA + .4 * peakB) * (.92 + random() * .08);
      for (const sign of [-1, 1]) {
        const vertex = point.clone().addScaledVector(side, sign * width);
        positions.push(vertex.x, vertex.y, vertex.z); uv.push(index / (points.length - 1), (sign + 1) / 2); strength.push(heat);
      }
      if (index < points.length - 1) { const k = offset + index * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    });
  };
  if (length > .001) {
    // A few unequal bends own the silhouette; small kinks only roughen them.
    const bends = [0, .16 + random() * .06, .53 + random() * .07, .81 + random() * .05, 1];
    const sign = random() > .5 ? 1 : -1, breadth = Math.min(.65, length * .13);
    const offsets = [0, sign * .7, -sign, sign * .38, 0];
    const depths = [0, -.2, .3, -.12, 0];
    // Only long spans receive a handful of irregular, native-readable kinks.
    // Their unequal spacing/amplitude avoids repeating the old sawtooth.
    const spanKinks = bends.slice(0, -1).map((start, span) => {
      const spanLength = (bends[span + 1] - start) * length;
      if (!branches || spanLength < 1.05) return [[0, 0], [1, 0]];
      const kinkSign = random() > .5 ? 1 : -1;
      const knots = [[0, 0], [.23 + random() * .1, kinkSign * (.09 + random() * .04)], [.59 + random() * .1, -kinkSign * (.07 + random() * .045)]];
      if (spanLength > 1.8) knots.push([.82 + random() * .05, kinkSign * (.055 + random() * .03)]);
      knots.push([1, 0]); return knots;
    });
    const steps = Math.max(12, Math.min(96, Math.ceil(length * 6)));
    const main = Array.from({ length: steps + 1 }, (_, index) => {
      const t = index / steps;
      let span = 0; while (span < bends.length - 2 && t > bends[span + 1]) span++;
      const blend = (t - bends[span]) / (bends[span + 1] - bends[span]);
      const knots = spanKinks[span]; let knot = 0;
      while (knot < knots.length - 2 && blend > knots[knot + 1][0]) knot++;
      const kinkBlend = (blend - knots[knot][0]) / (knots[knot + 1][0] - knots[knot][0]);
      const kink = knots[knot][1] + (knots[knot + 1][1] - knots[knot][1]) * kinkBlend;
      const point = from.clone().lerp(to, t)
        .addScaledVector(across, (offsets[span] + (offsets[span + 1] - offsets[span]) * blend) * breadth + kink)
        .addScaledVector(depth, (depths[span] + (depths[span + 1] - depths[span]) * blend) * breadth);
      if (index > 0 && index < steps) point.addScaledVector(across, (random() - .5) * Math.min(.07, length * .02));
      return point;
    });
    add(main, 1);
    if (branches) for (const [fraction, power] of [[.21, .45], [.53, .31], [.78, .38]]) {
      const start = main[Math.floor((main.length - 1) * fraction)];
      const reach = Math.min(.75, length * (.04 + random() * .055));
      const end = start.clone().addScaledVector(direction, reach * .35).addScaledVector(across, (random() > .5 ? 1 : -1) * reach).addScaledVector(depth, (random() - .5) * reach * .3);
      add(path(start, end, 5, reach * .3), power);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('strength', new Float32BufferAttribute(strength, 1)); geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Three small, open filaments gather at the hand; no solid orb or room flash. */
export function createChainCharge() {
  const view = new Vector3(0, 0, 1);
  const parts = [
    chainLightningGeometry(new Vector3(-.13, -.01, 0), new Vector3(.07, .09, 0), view, 71, false, .016),
    chainLightningGeometry(new Vector3(-.06, .1, .01), new Vector3(.12, -.05, .01), view, 93, false, .018),
    chainLightningGeometry(new Vector3(.12, .015, -.01), new Vector3(-.04, -.105, -.01), view, 117, false, .013),
  ];
  const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose());
  const mesh = new Mesh(geometry, chainLightningMaterial(true)); mesh.frustumCulled = false;
  return mesh;
}

export type ChainTarget = {
  position: Vector3;
  height: number;
  contact: (from: Vector3, arrival: Vector3) => void;
};

/** Preserve the supplied target order and old contact cues. Each visible link
 * starts at the preceding arrival; only the first link samples the live hand.
 * The optional echo is presentation only and never reapplies a receipt.
 */
export function createChainSequence(
  targets: ChainTarget[],
  emit: (from: Vector3, arrival: Vector3, index: number, echo: boolean) => void,
  echo = false,
) {
  const previous = [new Vector3(), new Vector3()], from = new Vector3(), arrival = new Vector3();
  const contacted = targets.map(() => false);
  const cues = targets.flatMap((_, index) => {
    const at = CHAIN_FIRST_CONTACT + index / Math.max(1, targets.length) * CHAIN_CONTACT_SPAN;
    return echo ? [{ at, index, pass: 0 }, { at: at + CHAIN_ECHO_DELAY, index, pass: 1 }] : [{ at, index, pass: 0 }];
  }).sort((a, b) => a.at - b.at);
  let next = 0;

  function deliver(index: number, pass: number, hand: Vector3, visible: boolean) {
    const target = targets[index];
    from.copy(index === 0 ? hand : previous[pass]);
    arrival.copy(target.position).y += Math.min(1.9, Math.max(.65, target.height * .56));
    previous[pass].copy(arrival);
    if (visible) emit(from, arrival, index, pass === 1);
    if (pass === 0 && !contacted[index]) {
      contacted[index] = true;
      target.contact(from, arrival);
    }
  }

  return {
    update(hand: Vector3, age: number) {
      while (next < cues.length && cues[next].at <= age) {
        const cue = cues[next++]; deliver(cue.index, cue.pass, hand, true);
      }
    },
    /** A tab may resume after every visual layer has expired. Reconcile each
     * outstanding authoritative result without spawning a stale bolt train. */
    finish(hand: Vector3) {
      for (let index = 0; index < targets.length; index++) {
        if (!contacted[index]) deliver(index, 0, hand, false);
      }
      next = cues.length;
    },
  };
}
