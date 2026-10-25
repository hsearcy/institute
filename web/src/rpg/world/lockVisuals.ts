import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rpgShrineBoon, RPG_BOONS, type RpgBoonId } from '@institute/shared';
import type { Door, Feature } from './levelGen';

/**
 * Sealed rune doors and boon shrines: the two locks, besides chests, that the
 * hero opens with a solved problem. Presentation only; the server decides.
 */
type Materials = { wall: THREE.Material; trim: THREE.Material; dark: THREE.Material; gold: THREE.Material };

export type ChunkDoor = {
  readonly door: Door;
  /** The slab and its rune; it sinks into the floor when the door opens. */
  readonly slab: THREE.Group;
  readonly rune: THREE.MeshBasicMaterial;
  readonly glow: THREE.Sprite;
};
export type ChunkShrine = {
  readonly feature: Feature;
  readonly boon: RpgBoonId;
  readonly crystal: THREE.Mesh;
  readonly crystalMaterial: THREE.MeshStandardMaterial;
  readonly ring: THREE.Mesh;
  readonly floorRune: THREE.Mesh;
  readonly glow: THREE.Sprite;
};

export const DOOR_HEIGHT = 3.1;
/** Seconds the slab takes to sink once the rune has flared. */
export const DOOR_SINK_SECONDS = 1.7;
export const DOOR_FLARE_SECONDS = .45;
const RUNE_GOLD = 0xffc45a;
const SHRINE_GLOW = .85;

/**
 * Stone materials here use vertex colours (damp at the base, as the walls
 * are); a mesh without them would render black.
 */
function shade(geometry: THREE.BufferGeometry, y: number, tint = 1): THREE.BufferGeometry {
  if (geometry.getAttribute('color')) return geometry;
  const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const damp = .72 + .28 * Math.min(1, Math.max(0, (positions.getY(i) + y) / 1.4));
    colors[i * 3] = damp * tint; colors[i * 3 + 1] = damp * tint * .98; colors[i * 3 + 2] = damp * tint * .93;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export const boonColor = (boon: RpgBoonId) => new THREE.Color(RPG_BOONS[boon].color);

function ownedSprite(map: THREE.Texture, color: THREE.ColorRepresentation, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprite.userData.ownedMaterial = true;
  return sprite;
}

/**
 * A rune-sealed stone door across a hallway: a banded slab between two
 * jambs under a heavy lintel, a gold ring of runes at its heart. The jambs
 * stand just outside the hallway, so an open doorway is its full width.
 */
export function placeDoor(group: THREE.Group, materials: Materials, glowMap: THREE.Texture, door: Door): ChunkDoor {
  const root = new THREE.Group(); root.name = `door-${door.id}`;
  root.position.set(door.x, 0, door.z);
  // Local x runs across the hallway; local +z faces back into the hall.
  root.rotation.y = door.side === 'north' ? 0 : door.side === 'south' ? Math.PI : door.side === 'east' ? -Math.PI / 2 : Math.PI / 2;
  const width = door.width, half = width / 2;
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const part = new THREE.Mesh(shade(geometry, y), material); part.position.set(x, y, z); part.castShadow = true; part.receiveShadow = true; parent.add(part); return part;
  };
  for (const sign of [-1, 1]) {
    const x = sign * (half + .4);
    mesh(new RoundedBoxGeometry(.95, 3.7, 1.25, 2, .08), materials.wall, x, 1.85, 0);
    mesh(new RoundedBoxGeometry(1.15, .32, 1.45, 2, .06), materials.trim, x, .16, 0);
    mesh(new RoundedBoxGeometry(1.1, .26, 1.4, 2, .06), materials.trim, x, 3.62, 0);
  }
  mesh(new RoundedBoxGeometry(width + 2.3, .62, 1.45, 2, .08), materials.trim, 0, 3.98, 0);
  // A keystone with a small gold boss marks the lintel.
  mesh(new RoundedBoxGeometry(.8, .78, 1.55, 2, .06), materials.wall, 0, 4.0, 0);
  mesh(new THREE.CylinderGeometry(.16, .16, .08, 12).rotateX(Math.PI / 2), materials.gold, 0, 4.02, .8);

  const slab = new THREE.Group(); slab.name = 'DoorSlab'; root.add(slab);
  mesh(new RoundedBoxGeometry(width + .2, DOOR_HEIGHT, .5, 2, .05), materials.trim, 0, DOOR_HEIGHT / 2, 0, slab);
  // Iron bands, riveted, across both faces.
  for (const y of [.55, DOOR_HEIGHT - .55]) for (const z of [-.27, .27]) {
    mesh(new THREE.BoxGeometry(width + .22, .16, .05), materials.gold, 0, y, z, slab);
    for (let x = -half + .35; x <= half - .3; x += .7) mesh(new THREE.SphereGeometry(.045, 6, 4), materials.gold, x, y, z + Math.sign(z) * .03, slab);
  }
  // Seams: the slab reads as fitted blocks, not a single panel.
  for (const x of [-half / 2, half / 2]) for (const z of [-.26, .26]) mesh(new THREE.BoxGeometry(.03, DOOR_HEIGHT - 1.4, .02), materials.dark, x, DOOR_HEIGHT / 2, z, slab);

  const rune = new THREE.MeshBasicMaterial({ color: RUNE_GOLD, transparent: true, opacity: .85, toneMapped: false, side: THREE.DoubleSide });
  for (const z of [-.27, .27]) {
    const face = new THREE.Group(); face.position.set(0, 1.68, z); if (z < 0) face.rotation.y = Math.PI; slab.add(face);
    const backing = new THREE.Mesh(new THREE.CircleGeometry(.66, 32), materials.dark); backing.position.z = .005; face.add(backing);
    const outer = new THREE.Mesh(new THREE.RingGeometry(.56, .62, 48), rune); outer.position.z = .012; outer.userData.ownedMaterial = true; face.add(outer);
    const inner = new THREE.Mesh(new THREE.RingGeometry(.25, .285, 32), rune); inner.position.z = .012; face.add(inner);
    // Six rune strokes between the rings, and a small diamond at the centre.
    for (let n = 0; n < 6; n++) {
      const stroke = new THREE.Mesh(new THREE.PlaneGeometry(.05, .2), rune);
      const angle = n / 6 * Math.PI * 2;
      stroke.position.set(Math.cos(angle) * .42, Math.sin(angle) * .42, .012); stroke.rotation.z = angle + (n % 2 ? .5 : -.5);
      face.add(stroke);
    }
    const diamond = new THREE.Mesh(new THREE.PlaneGeometry(.14, .14), rune); diamond.rotation.z = Math.PI / 4; diamond.position.z = .012; face.add(diamond);
  }
  const glow = ownedSprite(glowMap, RUNE_GOLD, .4); glow.position.set(0, 1.68, .5); glow.scale.setScalar(2.1); slab.add(glow);
  if (door.opened) { slab.position.y = -DOOR_HEIGHT - .1; slab.visible = false; }
  group.add(root);
  return { door, slab, rune, glow };
}

/** Rune pulse while closed; on opening, a bright flare, then the slab grinds down into the floor. */
export function animateDoor(handle: ChunkDoor, elapsed: number, openedAt: number | undefined): void {
  const { door, slab, rune, glow } = handle;
  if (!door.opened) {
    const pulse = .5 + .5 * Math.sin(elapsed * 1.6 + door.x);
    rune.opacity = .62 + .25 * pulse; glow.material.opacity = .22 + .16 * pulse;
    slab.position.set(0, 0, 0); slab.visible = true;
    return;
  }
  if (openedAt === undefined) { slab.visible = false; return; }
  const age = elapsed - openedAt;
  if (age < DOOR_FLARE_SECONDS) {
    const t = age / DOOR_FLARE_SECONDS;
    rune.opacity = 1; glow.material.opacity = .4 + .6 * Math.sin(t * Math.PI / 2); glow.scale.setScalar(2.1 + t * 1.6);
    return;
  }
  const t = Math.min(1, (age - DOOR_FLARE_SECONDS) / DOOR_SINK_SECONDS);
  // Eases in like a heavy stone starting to move, with a slight grinding judder.
  const ease = t * t * (3 - 2 * t);
  slab.position.y = -ease * (DOOR_HEIGHT + .1);
  slab.position.x = Math.sin(age * 47) * .025 * (1 - t);
  rune.opacity = Math.max(0, 1 - t * 1.4); glow.material.opacity = Math.max(0, .9 * (1 - t * 1.6));
  slab.visible = t < 1;
}

/**
 * A boon shrine: an octagonal stone plinth with a bowl, and above it a slowly
 * turning crystal in the boon's colour inside a thin gold ring. A faint rune
 * circle lies on the floor around it. Once used, the crystal turns to stone.
 */
export function placeShrine(group: THREE.Group, materials: Materials, glowMap: THREE.Texture, feature: Feature): ChunkShrine {
  const boon = rpgShrineBoon(feature.id), color = boonColor(boon);
  const root = new THREE.Group(); root.name = `shrine-${feature.id}`; root.position.set(feature.x, 0, feature.z); root.rotation.y = feature.turn;
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const part = new THREE.Mesh(shade(geometry, y), material); part.position.y = y; part.castShadow = true; part.receiveShadow = true; root.add(part); return part;
  };
  mesh(new THREE.CylinderGeometry(.92, 1.02, .22, 8), materials.trim, .11);
  mesh(new THREE.CylinderGeometry(.7, .8, .2, 8), materials.wall, .32);
  mesh(new THREE.CylinderGeometry(.42, .56, .72, 8), materials.wall, .78);
  mesh(new THREE.CylinderGeometry(.66, .44, .22, 8), materials.trim, 1.25);
  mesh(new THREE.TorusGeometry(.56, .045, 6, 24).rotateX(Math.PI / 2), materials.gold, 1.37);
  const crystalMaterial = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(.45), emissive: color, emissiveIntensity: SHRINE_GLOW, metalness: .2, roughness: .3 });
  const crystal = mesh(new THREE.OctahedronGeometry(.3, 0), crystalMaterial, 2.05); crystal.scale.set(.85, 1.45, .85);
  crystal.userData.ownedMaterial = true;
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xe6c36a, toneMapped: false });
  const ring = mesh(new THREE.TorusGeometry(.5, .018, 4, 40), ringMaterial, 2.05); ring.userData.ownedMaterial = true;
  const floorMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const floorRune = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.38, 64).rotateX(-Math.PI / 2), floorMaterial);
  floorRune.position.y = .02; floorRune.userData.ownedMaterial = true; root.add(floorRune);
  const glow = ownedSprite(glowMap, color, .22); glow.position.y = 2.05; glow.scale.setScalar(1.5); root.add(glow);
  group.add(root);
  const handle = { feature, boon, crystal, crystalMaterial, ring, floorRune, glow };
  if (feature.opened) spendShrine(handle);
  return handle;
}

function spendShrine(handle: ChunkShrine): void {
  handle.crystalMaterial.color.setHex(0x4a4842); handle.crystalMaterial.emissiveIntensity = 0; handle.crystalMaterial.roughness = .85; handle.crystalMaterial.metalness = 0;
  handle.glow.visible = false; handle.floorRune.visible = false; handle.ring.visible = false;
  handle.crystal.position.y = 1.62; handle.crystal.rotation.set(.3, handle.feature.turn, .5);
}

/** A slow hover and turn; after use, a gentle flare that fades, then the crystal rests as plain stone. */
export function animateShrine(handle: ChunkShrine, elapsed: number, usedAt: number | undefined): void {
  const { feature, crystal, ring, glow, floorRune, crystalMaterial } = handle;
  if (!feature.opened) {
    const bob = Math.sin(elapsed * 1.3 + feature.x);
    crystal.position.y = 2.05 + bob * .07; crystal.rotation.y = elapsed * .6;
    ring.position.y = crystal.position.y; ring.rotation.set(Math.PI / 2 + Math.sin(elapsed * .5) * .25, 0, elapsed * .35);
    glow.position.y = crystal.position.y; glow.material.opacity = .17 + .07 * (bob * .5 + .5);
    (floorRune.material as THREE.MeshBasicMaterial).opacity = .26 + .08 * Math.sin(elapsed * .9 + feature.z);
    return;
  }
  if (usedAt === undefined) { spendShrine(handle); return; }
  const t = Math.min(1, (elapsed - usedAt) / 1.6);
  if (t >= 1) { spendShrine(handle); return; }
  crystalMaterial.emissiveIntensity = SHRINE_GLOW * (1 + 1.5 * Math.sin(Math.min(1, t * 3) * Math.PI)) * (1 - t);
  glow.material.opacity = .55 * (1 - t); glow.scale.setScalar(1.5 + t * 2.2);
  (floorRune.material as THREE.MeshBasicMaterial).opacity = .5 * (1 - t);
  crystal.rotation.y = elapsed * (.6 + 4 * (1 - t));
}
