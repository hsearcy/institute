import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { random, type BreakableKind, type Feature } from './levelGen';

/**
 * Barrels, urns and crates the hero smashes with no problem to solve.
 * Presentation only: whether a break pays forge dust is the server's choice.
 * Models are built once per kind and variant and shared by every chunk.
 */
const VARIANTS = 3;
/** Height of each kind as modelled, in metres. */
export const BREAKABLE_HEIGHT: Record<BreakableKind, number> = { barrel: .95, urn: .92, crate: .78 };
/** Props stand at the same scale as the actors, so a barrel reaches the hero's waist. */
export const PROP_SCALE = 1.2;
/** Height of a placed breakable in the world. */
export const breakableHeight = (feature: Pick<Feature, 'kind' | 'scale'>): number => BREAKABLE_HEIGHT[feature.kind as BreakableKind] * PROP_SCALE * feature.scale;

type Piece = { geometry: THREE.BufferGeometry; material: THREE.Material };

/** A canvas texture drawn once; `draw` paints on a 2D context. */
function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D, rng: () => number) => void, seed: number): THREE.Texture {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  if (g) draw(g, random(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  return texture;
}

/** Grain streaks and a few knots on wood, in the current fill area. */
function grain(g: CanvasRenderingContext2D, rng: () => number, x: number, y: number, w: number, h: number, along: 'x' | 'y'): void {
  for (let n = 0; n < (along === 'y' ? w : h) * .45; n++) {
    const t = rng(), dark = rng() < .6;
    g.strokeStyle = dark ? `rgba(40,22,10,${.12 + rng() * .22})` : `rgba(255,220,170,${.05 + rng() * .08})`;
    g.lineWidth = .6 + rng() * 1.2; g.beginPath();
    if (along === 'y') {
      const cx = x + t * w; g.moveTo(cx, y);
      for (let k = 1; k <= 6; k++) g.lineTo(cx + Math.sin(k * 1.3 + t * 9) * 1.4, y + h * k / 6);
    } else {
      const cy = y + t * h; g.moveTo(x, cy);
      for (let k = 1; k <= 8; k++) g.lineTo(x + w * k / 8, cy + Math.sin(k * 1.1 + t * 9) * 1.2);
    }
    g.stroke();
  }
  for (let n = 0; n < 2; n++) if (rng() < .5) {
    const kx = x + rng() * w, ky = y + rng() * h;
    g.fillStyle = 'rgba(45,24,12,.55)'; g.beginPath(); g.ellipse(kx, ky, along === 'y' ? 2.5 : 6, along === 'y' ? 6 : 2.5, 0, 0, Math.PI * 2); g.fill();
  }
}

/** Shades a geometry's vertices: darker towards the floor, with a per-piece tone. */
function shade(geometry: THREE.BufferGeometry, tone: number, height: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position'), colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const damp = .72 + .28 * Math.min(1, Math.max(0, position.getY(i) / Math.max(.01, height)));
    colors[i * 3] = tone * damp; colors[i * 3 + 1] = tone * damp * .97; colors[i * 3 + 2] = tone * damp * .93;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** A board with its grain along its longest side. */
function board(w: number, h: number, d: number, rng: () => number): THREE.BufferGeometry {
  const geometry = new RoundedBoxGeometry(w, h, d, 1, Math.min(.012, Math.min(w, h, d) * .3));
  const sizes = [w, h, d], long = sizes.indexOf(Math.max(...sizes));
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), offset = rng() * 4, row = Math.floor(rng() * 4) / 4;
  for (let i = 0; i < position.count; i++) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    const across = p[(long + 1) % 3]! + p[(long + 2) % 3]!;
    uv.setXY(i, p[long]! * .9 + offset, row + (across / .3 + .5) * .24);
  }
  return geometry;
}

export class BreakableKit {
  readonly wood: THREE.MeshStandardMaterial;
  readonly staves: THREE.MeshStandardMaterial;
  readonly iron: THREE.MeshStandardMaterial;
  readonly clay: THREE.MeshStandardMaterial;
  readonly glaze: THREE.MeshStandardMaterial;
  private readonly models = new Map<string, Piece[]>();
  private readonly textures: THREE.Texture[] = [];

  constructor() {
    // Boards: four rows of plank, grain along the width.
    const boards = canvasTexture(256, 256, (g, rng) => {
      for (let row = 0; row < 4; row++) {
        const tone = 118 + rng() * 34;
        g.fillStyle = `rgb(${tone},${tone * .7},${tone * .45})`; g.fillRect(0, row * 64, 256, 64);
        grain(g, rng, 0, row * 64, 256, 64, 'x');
      }
    }, 71);
    // Barrel staves: sixteen strips round the barrel, grain running up.
    const staves = canvasTexture(512, 256, (g, rng) => {
      for (let n = 0; n < 16; n++) {
        const tone = 112 + rng() * 38, x = n * 32;
        g.fillStyle = `rgb(${tone},${tone * .68},${tone * .43})`; g.fillRect(x, 0, 32, 256);
        grain(g, rng, x, 0, 32, 256, 'y');
        g.fillStyle = 'rgba(28,14,6,.85)'; g.fillRect(x, 0, 1.6, 256);
        g.fillStyle = 'rgba(255,215,160,.12)'; g.fillRect(x + 2, 0, 1.2, 256);
      }
    }, 23);
    // Fired clay: speckled terracotta with a painted band and a running wave.
    const clay = canvasTexture(512, 256, (g, rng) => {
      g.fillStyle = '#b4704a'; g.fillRect(0, 0, 512, 256);
      for (let n = 0; n < 2600; n++) { g.fillStyle = rng() < .5 ? 'rgba(80,36,18,.18)' : 'rgba(240,190,140,.14)'; g.fillRect(rng() * 512, rng() * 256, 1 + rng() * 2, 1 + rng() * 2); }
      // v runs up the urn; the canvas runs down, so the shoulder band sits near the top.
      const band = (y: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(0, y, 512, h); };
      band(58, 46, '#2a1a12'); band(54, 3, '#e3c79a'); band(105, 3, '#e3c79a'); band(150, 2, '#2a1a12'); band(196, 2, '#2a1a12');
      g.strokeStyle = '#d9b27a'; g.lineWidth = 3; g.beginPath();
      for (let x = 0; x <= 512; x += 4) { const y = 81 + Math.sin(x / 512 * Math.PI * 2 * 8) * 12; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      for (let x = 16; x < 512; x += 32) { g.fillStyle = '#d9b27a'; g.beginPath(); g.arc(x, 128 - 4, 3, 0, Math.PI * 2); g.fill(); }
      // Wear: the paint has rubbed thin in places.
      for (let n = 0; n < 40; n++) { g.fillStyle = 'rgba(180,112,74,.45)'; g.beginPath(); g.ellipse(rng() * 512, 58 + rng() * 46, 4 + rng() * 10, 2 + rng() * 4, 0, 0, Math.PI * 2); g.fill(); }
    }, 5);
    this.textures.push(boards, staves, clay);
    this.wood = new THREE.MeshStandardMaterial({ map: boards, color: 0xd8c4a6, roughness: .86, vertexColors: true });
    this.staves = new THREE.MeshStandardMaterial({ map: staves, color: 0xd8c4a6, roughness: .84, vertexColors: true });
    this.iron = new THREE.MeshStandardMaterial({ color: 0x4a4540, metalness: .72, roughness: .48, vertexColors: true });
    this.clay = new THREE.MeshStandardMaterial({ map: clay, color: 0xffffff, roughness: .62, vertexColors: true });
    this.glaze = new THREE.MeshStandardMaterial({ color: 0x1b120d, roughness: .9, vertexColors: true });
  }

  /** A whole breakable at a feature's spot, ready to add to a chunk. */
  build(feature: Feature): THREE.Group {
    const kind = feature.kind as BreakableKind, variant = Math.abs(Math.round(feature.x * 7 + feature.z * 13)) % VARIANTS;
    const group = new THREE.Group(); group.name = `breakable-${kind}`;
    for (const piece of this.model(kind, variant)) {
      const mesh = new THREE.Mesh(piece.geometry, piece.material); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.position.set(feature.x, 0, feature.z); group.rotation.y = feature.turn; group.scale.setScalar(feature.scale * PROP_SCALE);
    // A crate may lean a little, an urn may stand slightly askew.
    if (kind !== 'barrel') group.rotation.z = (variant - 1) * .025;
    group.userData.shared = true;
    return group;
  }

  private model(kind: BreakableKind, variant: number): Piece[] {
    const key = `${kind}:${variant}`;
    let pieces = this.models.get(key);
    if (!pieces) { pieces = kind === 'barrel' ? this.barrel(variant) : kind === 'urn' ? this.urn(variant) : this.crate(variant); this.models.set(key, pieces); }
    return pieces;
  }

  private merged(parts: THREE.BufferGeometry[], material: THREE.Material): Piece {
    const normalized = parts.map(part => part.index ? part.toNonIndexed() : part);
    const geometry = mergeGeometries(normalized, false)!;
    parts.forEach(part => part.dispose()); normalized.forEach(part => part.dispose());
    geometry.computeBoundingSphere();
    return { geometry, material };
  }

  private barrel(variant: number): Piece[] {
    const rng = random(101 + variant), height = BREAKABLE_HEIGHT.barrel * (1 - variant * .04), bulge = .07 + variant * .01;
    const radius = (y: number) => .32 + bulge * Math.sin(Math.PI * Math.min(1, Math.max(0, y / height)));
    const profile: THREE.Vector2[] = [];
    for (let k = 0; k <= 12; k++) { const y = height * k / 12; profile.push(new THREE.Vector2(radius(y), y)); }
    // The chime: stave ends stand proud of the recessed head.
    profile.push(new THREE.Vector2(radius(height) - .025, height), new THREE.Vector2(radius(height) - .03, height - .035));
    const body = shade(new THREE.LatheGeometry(profile, 16), .95 + rng() * .1, height);
    const head = new THREE.CircleGeometry(radius(height) - .03, 16); head.rotateX(-Math.PI / 2); head.translate(0, height - .035, 0);
    // The head is made of boards: remap its planar coordinates onto the board texture.
    const uv = head.getAttribute('uv'), hp = head.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, hp.getX(i) * 1.4 + .2, hp.getZ(i) * 1.6 + .5);
    shade(head, .8, height);
    const hoops: THREE.BufferGeometry[] = [];
    for (const at of [.07, .27, .73, .93]) {
      const y = height * at, hoop = new THREE.TorusGeometry(radius(y) + .006, .016, 4, 24);
      hoop.rotateX(Math.PI / 2); hoop.scale(1, 1.9, 1); hoop.translate(0, y, 0); hoops.push(shade(hoop, .9, height));
    }
    // A bung and a few rivets on the middle hoops.
    const bung = new THREE.CylinderGeometry(.03, .034, .03, 8); bung.rotateZ(Math.PI / 2); bung.translate(radius(height / 2) + .004, height / 2, 0);
    return [this.merged([body], this.staves), this.merged([head], this.wood), this.merged([...hoops, shade(bung, .7, height)], this.iron)];
  }

  private urn(variant: number): Piece[] {
    const rng = random(211 + variant);
    // Amphora, squat jar and tall jar: the same parts, other proportions.
    const shapes: [number, number][][] = [
      [[.11, 0], [.14, .03], [.11, .08], [.2, .17], [.3, .33], [.33, .46], [.3, .6], [.21, .71], [.12, .78], [.105, .86], [.14, .92], [.155, .95], [.12, .955]],
      [[.15, 0], [.18, .03], [.17, .06], [.3, .16], [.38, .3], [.39, .42], [.33, .54], [.21, .62], [.17, .66], [.2, .71], [.205, .74], [.17, .745]],
      [[.12, 0], [.15, .03], [.13, .07], [.22, .2], [.28, .4], [.29, .58], [.25, .74], [.16, .84], [.12, .9], [.12, .98], [.16, 1.03], [.165, 1.06], [.13, 1.065]],
    ];
    const points = shapes[variant]!.map(([r, y]) => new THREE.Vector2(r, y));
    const height = points[points.length - 1]!.y;
    const body = new THREE.LatheGeometry(points, 22);
    // Map the painted band onto the shoulder whatever the jar's height.
    const uv = body.getAttribute('uv'), bp = body.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, bp.getY(i) / height * 1.02 + (variant === 1 ? -.08 : 0)));
    shade(body, .93 + rng() * .12, height);
    const mouth = new THREE.CircleGeometry(points[points.length - 1]!.x, 16); mouth.rotateX(-Math.PI / 2); mouth.translate(0, height - .03, 0);
    shade(mouth, .5, height);
    const handles: THREE.BufferGeometry[] = [];
    if (variant !== 1) for (const side of [-1, 1]) {
      const neck = points[points.length - 5]!, shoulder = points[points.length - 8]!;
      const handle = new THREE.TorusGeometry((neck.y - shoulder.y) * .55, .02, 5, 10, Math.PI);
      handle.rotateZ(-Math.PI / 2); handle.scale(.85, 1, 1);
      handle.translate(side * (neck.x + .02), (neck.y + shoulder.y) / 2, 0);
      if (side < 0) handle.rotateY(Math.PI);
      handles.push(shade(handle, .9, height));
    }
    return [this.merged([body, ...handles], this.clay), this.merged([mouth], this.glaze)];
  }

  private crate(variant: number): Piece[] {
    const rng = random(307 + variant), w = .8 - variant * .06, h = BREAKABLE_HEIGHT.crate * (1 - variant * .05), half = w / 2;
    const boards: THREE.BufferGeometry[] = [], iron: THREE.BufferGeometry[] = [];
    const put = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, turn = 0, tone = .85 + rng() * .25) => {
      geometry.rotateY(turn); geometry.translate(x, y, z); return shade(geometry, tone, h);
    };
    const thick = .035, rows = 3, gap = .025, plank = (h - .1 - gap * (rows - 1)) / rows;
    // Side boards between the frame, with small gaps between them.
    for (let side = 0; side < 4; side++) {
      const turn = side * Math.PI / 2, out = half - thick / 2;
      for (let row = 0; row < rows; row++) {
        const y = .05 + plank / 2 + row * (plank + gap);
        const x = Math.sin(turn) * out, z = Math.cos(turn) * out;
        boards.push(put(board(w - .1, plank, thick, rng), x, y, z, turn));
      }
      // A diagonal brace on alternate faces.
      if (side % 2 === variant % 2) {
        const length = Math.hypot(w - .14, h - .1), brace = board(length, .075, thick, rng);
        brace.rotateZ(Math.atan2(h - .1, w - .14) * (side < 2 ? 1 : -1));
        boards.push(put(brace, Math.sin(turn) * (half + .004), h / 2, Math.cos(turn) * (half + .004), turn, .8 + rng() * .15));
      }
    }
    // Frame: corner posts and top and bottom rails.
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      boards.push(put(board(.075, h, .075, rng), x * (half - .02), h / 2, z * (half - .02), 0, .75 + rng() * .15));
      // Iron corner caps, top and bottom.
      for (const y of [.03, h - .03]) iron.push(put(new THREE.BoxGeometry(.1, .06, .1), x * (half - .02), y, z * (half - .02), 0, .9));
    }
    for (const y of [.035, h - .035]) for (let side = 0; side < 4; side++) {
      const turn = side * Math.PI / 2;
      boards.push(put(board(w - .02, .07, .05, rng), Math.sin(turn) * (half - .005), y, Math.cos(turn) * (half - .005), turn, .75 + rng() * .15));
    }
    // Lid boards, one sitting a little crooked.
    for (let n = 0; n < 4; n++) {
      const lid = board(w - .06, .03, (w - .1) / 4 - .012, rng);
      if (n === variant) lid.rotateY(.04);
      boards.push(put(lid, 0, h - .015, -half + .05 + (n + .5) * (w - .1) / 4, 0));
    }
    return [this.merged(boards, this.wood), this.merged(iron, this.iron)];
  }

  dispose(): void {
    for (const pieces of this.models.values()) pieces.forEach(piece => piece.geometry.dispose());
    this.models.clear();
    for (const material of [this.wood, this.staves, this.iron, this.clay, this.glaze]) material.dispose();
    this.textures.forEach(texture => texture.dispose());
  }
}

/** `lift` is the height of a piece's middle when it lies on the floor. */
type Shard = { position: THREE.Vector3; velocity: THREE.Vector3; rotation: THREE.Euler; spin: THREE.Vector3; scale: THREE.Vector3; color: THREE.Color; life: number; resting: boolean; lift: number };
const SHARD_LIMIT = 320;
const SHARD_LIFE = 5.5;

/**
 * Pieces of a broken breakable: splinters, boards and hoops of a barrel or
 * crate, curved shards of an urn. They fly, bounce, settle and fade.
 */
export class BreakableDebris {
  readonly group = new THREE.Group();
  private readonly wood: THREE.InstancedMesh;
  private readonly clay: THREE.InstancedMesh;
  private readonly woodShards: Shard[] = [];
  private readonly clayShards: Shard[] = [];
  private readonly pose = new THREE.Object3D();
  /** True on open floor; a piece that would leave it bounces off the wall instead. */
  private onFloor: (x: number, z: number) => boolean = () => true;

  constructor(kit: BreakableKit) {
    this.group.name = 'BreakableDebris';
    this.wood = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: kit.wood.map, roughness: .86 }), SHARD_LIMIT);
    // A thin, sharp-edged plate reads as a piece of a pot's wall, and lies flat once it lands.
    const shard = new THREE.DodecahedronGeometry(1, 0); shard.scale(1, .2, .75);
    this.clay = new THREE.InstancedMesh(shard, new THREE.MeshStandardMaterial({ map: kit.clay.map, roughness: .62, flatShading: true }), SHARD_LIMIT);
    for (const mesh of [this.wood, this.clay]) {
      mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color()); this.group.add(mesh);
    }
  }

  get count(): number { return this.woodShards.length + this.clayShards.length; }

  /** Throws the pieces of a broken breakable, away from `from` (the hero). */
  burst(feature: Feature, from: THREE.Vector3, onFloor?: (x: number, z: number) => boolean): void {
    if (onFloor) this.onFloor = onFloor;
    const kind = feature.kind as BreakableKind, height = breakableHeight(feature);
    const away = new THREE.Vector3(feature.x - from.x, 0, feature.z - from.z).normalize();
    const pottery = kind === 'urn', list = pottery ? this.clayShards : this.woodShards;
    const count = pottery ? 30 : kind === 'barrel' ? 26 : 28;
    for (let i = 0; i < count && list.length < SHARD_LIMIT; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 1.3 + Math.random() * 2.6;
      const velocity = new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 3.2, Math.sin(angle) * speed).addScaledVector(away, .8);
      const at = new THREE.Vector3(feature.x + (Math.random() - .5) * .4, height * (.15 + Math.random() * .8), feature.z + (Math.random() - .5) * .4);
      let scale: THREE.Vector3, color: THREE.Color;
      if (pottery) {
        const size = (.06 + Math.random() * .09) * feature.scale;
        scale = new THREE.Vector3(size * (1 + Math.random() * .8), size, size * (1 + Math.random() * .8));
        color = new THREE.Color(Math.random() < .25 ? 0x4a3226 : 0xffd9bf).multiplyScalar(.9 + Math.random() * .2);
      } else {
        // A few whole staves or boards, the rest splinters.
        const large = i < (kind === 'barrel' ? 8 : 7);
        scale = large ? new THREE.Vector3(.1 + Math.random() * .05, .04, .38 + Math.random() * .34) : new THREE.Vector3(.03 + Math.random() * .04, .022 + Math.random() * .02, .1 + Math.random() * .22);
        color = new THREE.Color(Math.random() < .12 && kind === 'barrel' ? 0x4c4842 : 0xbfa486).multiplyScalar(.7 + Math.random() * .3);
        if (large) velocity.multiplyScalar(.6);
      }
      list.push({ position: at, velocity, rotation: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3((Math.random() - .5) * 18, (Math.random() - .5) * 18, (Math.random() - .5) * 18), scale, color, life: SHARD_LIFE + Math.random() * 1.5, resting: false, lift: scale.y * (pottery ? .22 : .5) });
    }
  }

  update(delta: number): void {
    for (const [list, mesh] of [[this.woodShards, this.wood], [this.clayShards, this.clay]] as const) {
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const shard = list[i]!; shard.life -= delta;
        if (shard.life <= 0) { list.splice(i, 1); continue; }
        if (!shard.resting) {
          shard.velocity.y -= 11 * delta;
          const x = shard.position.x + shard.velocity.x * delta, z = shard.position.z + shard.velocity.z * delta;
          // Walls stop the pieces, so they gather at the foot of the wall instead of vanishing behind it.
          if (this.onFloor(x, z)) { shard.position.x = x; shard.position.z = z; }
          else { shard.velocity.x *= -.3; shard.velocity.z *= -.3; }
          shard.position.y += shard.velocity.y * delta;
          shard.rotation.x += shard.spin.x * delta; shard.rotation.y += shard.spin.y * delta; shard.rotation.z += shard.spin.z * delta;
          const floor = shard.lift;
          if (shard.position.y < floor) {
            shard.position.y = floor;
            if (Math.abs(shard.velocity.y) < 1.2) {
              // Settle flat on the floor.
              shard.resting = true; shard.rotation.x = Math.round(shard.rotation.x / Math.PI) * Math.PI; shard.rotation.z = Math.round(shard.rotation.z / Math.PI) * Math.PI;
            } else { shard.velocity.set(shard.velocity.x * .45, -shard.velocity.y * .3, shard.velocity.z * .45); shard.spin.multiplyScalar(.5); }
          }
        }
        const fade = Math.min(1, shard.life / .6);
        this.pose.position.copy(shard.position); if (shard.resting) this.pose.position.y = shard.lift * fade;
        this.pose.rotation.copy(shard.rotation); this.pose.scale.copy(shard.scale).multiplyScalar(fade);
        this.pose.updateMatrix(); mesh.setMatrixAt(n, this.pose.matrix); mesh.setColorAt(n, shard.color); n++;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  clear(): void { this.woodShards.length = this.clayShards.length = 0; this.wood.count = this.clay.count = 0; }

  dispose(): void {
    this.group.removeFromParent();
    for (const mesh of [this.wood, this.clay]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }
  }
}
