import * as THREE from 'three';

/**
 * The way down that opens where a guardian fell: a carved well rim with
 * glowing rune studs on a stepped dais, a swirling vortex, a soft
 * column of light and motes that drift up out of the depths.
 */
export type DescentPortal = {
  readonly group: THREE.Group;
  readonly light: THREE.PointLight;
  /** `age` is seconds since the portal began to open. */
  update(age: number, delta: number): void;
  dispose(): void;
};

export const DESCENT_RADIUS = 1.7;
/** How near the hero's centre must come to the vortex to step in. */
export const DESCENT_ENTER_RADIUS = 1.15;

let spiral: THREE.CanvasTexture | undefined;
/** Spiral arms on a soft disc; tinted by the material colour. Shared by every portal. */
function spiralTexture(): THREE.CanvasTexture {
  if (spiral) return spiral;
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!, c = size / 2;
  const disc = context.createRadialGradient(c, c, 0, c, c, c);
  disc.addColorStop(0, 'rgba(255,255,255,1)'); disc.addColorStop(.18, 'rgba(255,255,255,.55)');
  disc.addColorStop(.7, 'rgba(255,255,255,.12)'); disc.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = disc; context.fillRect(0, 0, size, size);
  context.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) {
    for (let step = 0; step < 90; step++) {
      const t = step / 90, angle = arm / 5 * Math.PI * 2 + t * 4.2, radius = 8 + t * (c - 14);
      const x = c + Math.cos(angle) * radius, y = c + Math.sin(angle) * radius;
      context.strokeStyle = `rgba(255,255,255,${(.75 * (1 - t)).toFixed(3)})`;
      context.lineWidth = 2 + 9 * (1 - t) * t * 2.2;
      context.beginPath(); context.arc(x, y, context.lineWidth / 2, 0, Math.PI * 2); context.stroke();
    }
  }
  spiral = new THREE.CanvasTexture(canvas); spiral.colorSpace = THREE.SRGBColorSpace;
  return spiral;
}

function columnTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const fade = context.createLinearGradient(0, 128, 0, 0);
  fade.addColorStop(0, 'rgba(255,255,255,.9)'); fade.addColorStop(.35, 'rgba(255,255,255,.35)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = fade; context.fillRect(0, 0, 4, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

export function createDescentPortal(color: number, glowMap: THREE.Texture, stone: THREE.Material, gold: THREE.Material): DescentPortal {
  const group = new THREE.Group(); group.name = 'descent-portal';
  const owned: { geometry: THREE.BufferGeometry[]; material: THREE.Material[] } = { geometry: [], material: [] };
  const keep = <T extends THREE.BufferGeometry>(geometry: T) => { owned.geometry.push(geometry); return geometry; };
  const own = <T extends THREE.Material>(material: T) => { owned.material.push(material); return material; };
  const tint = new THREE.Color(color), pale = tint.clone().lerp(new THREE.Color(0xffffff), .55);
  const glow = (opacity: number, map: THREE.Texture = glowMap, hue = tint) => own(new THREE.MeshBasicMaterial({ color: hue, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));

  // A stepped dais of dressed stone: the floor cannot be cut, so the well stands on it.
  const plinth = (radius: number, height: number) => {
    const ring = new THREE.Mesh(keep(new THREE.CylinderGeometry(radius, radius + .08, height, 48)), stone);
    ring.position.y = height / 2; ring.castShadow = ring.receiveShadow = true; group.add(ring);
  };
  plinth(DESCENT_RADIUS + 1.15, .1); plinth(DESCENT_RADIUS + .82, .2);
  // The carved rim: a bevelled lip around the well.
  const rimProfile = [new THREE.Vector2(DESCENT_RADIUS - .02, .2), new THREE.Vector2(DESCENT_RADIUS - .1, .36), new THREE.Vector2(DESCENT_RADIUS + .06, .46),
    new THREE.Vector2(DESCENT_RADIUS + .44, .44), new THREE.Vector2(DESCENT_RADIUS + .6, .32), new THREE.Vector2(DESCENT_RADIUS + .64, .2)];
  const rim = new THREE.Mesh(keep(new THREE.LatheGeometry(rimProfile, 48)), stone);
  rim.castShadow = rim.receiveShadow = true; group.add(rim);
  // Twelve keystones break the ring, with rune studs that kindle as it opens.
  const studs: THREE.Mesh[] = [];
  const keystone = keep(new THREE.BoxGeometry(.32, .3, .6)), stud = keep(new THREE.OctahedronGeometry(.085, 0));
  const studMaterial = own(new THREE.MeshStandardMaterial({ color: pale, emissive: tint, emissiveIntensity: 0, roughness: .35, metalness: .2 }));
  for (let n = 0; n < 12; n++) {
    const a = n / 12 * Math.PI * 2, r = DESCENT_RADIUS + .27;
    const block = new THREE.Mesh(keystone, n % 3 ? stone : gold);
    block.position.set(Math.cos(a) * r, .42, Math.sin(a) * r); block.rotation.y = -a; block.castShadow = true; group.add(block);
    const gem = new THREE.Mesh(stud, studMaterial);
    gem.position.set(Math.cos(a) * r, .66, Math.sin(a) * r); group.add(gem); studs.push(gem);
  }
  // The well's dark floor, then three swirling layers turning at different speeds.
  const well = new THREE.Mesh(keep(new THREE.CircleGeometry(DESCENT_RADIUS, 48)), own(new THREE.MeshBasicMaterial({ color: 0x020304 })));
  well.rotation.x = -Math.PI / 2; well.position.y = .21; group.add(well);
  const vortex = [0, 1, 2].map(layer => {
    const disc = new THREE.Mesh(keep(new THREE.CircleGeometry(DESCENT_RADIUS - .04 - layer * .3, 48)), glow(.8 - layer * .12, spiralTexture(), layer === 2 ? pale : tint));
    disc.rotation.x = -Math.PI / 2; disc.position.y = .23 + layer * .02; disc.renderOrder = 2 + layer; group.add(disc); return disc;
  });
  const heart = new THREE.Mesh(keep(new THREE.CircleGeometry(.7, 32)), glow(.9, glowMap, pale));
  heart.rotation.x = -Math.PI / 2; heart.position.y = .3; heart.renderOrder = 5; group.add(heart);
  // A soft column of light rising out of the well, visible from the camera.
  const column = new THREE.Mesh(keep(new THREE.CylinderGeometry(DESCENT_RADIUS * .78, DESCENT_RADIUS * .95, 5.2, 32, 1, true)), glow(.42, columnTexture()));
  (column.material as THREE.MeshBasicMaterial).map!.wrapS = THREE.RepeatWrapping;
  column.position.y = 2.85; group.add(column);
  const halo = new THREE.Mesh(keep(new THREE.RingGeometry(DESCENT_RADIUS + 1.1, DESCENT_RADIUS + 2.4, 48)), glow(.35));
  halo.rotation.x = -Math.PI / 2; halo.position.y = .12; group.add(halo);
  // Motes rising up out of the depths on slow spirals.
  const moteMaterial = own(new THREE.SpriteMaterial({ map: glowMap, color: pale, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const motes = Array.from({ length: 22 }, (_, n) => {
    const sprite = new THREE.Sprite(moteMaterial.clone()); own(sprite.material);
    sprite.userData = { phase: n / 22, angle: n * 2.4, radius: .35 + (n * 37 % 10) / 10 * (DESCENT_RADIUS - .5), speed: .16 + (n * 13 % 7) / 40 };
    group.add(sprite); return sprite;
  });
  const light = new THREE.PointLight(tint, 0, 15, 1.6); light.position.y = 1.6; group.add(light);

  group.scale.setScalar(.001);
  return {
    group, light,
    update(age: number, delta: number) {
      const open = smooth(age / 1.1);
      group.scale.setScalar(Math.max(.001, open));
      const pulse = .5 + .5 * Math.sin(age * 2.6);
      vortex.forEach((disc, layer) => { disc.rotation.z -= delta * (1.1 + layer * .55) * (layer % 2 ? -1 : 1); });
      heart.scale.setScalar(.9 + .15 * pulse);
      (heart.material as THREE.MeshBasicMaterial).opacity = (.7 + .25 * pulse) * open;
      (column.material as THREE.MeshBasicMaterial).opacity = .34 * open + .08 * pulse * open;
      (halo.material as THREE.MeshBasicMaterial).opacity = (.22 + .12 * pulse) * open;
      halo.scale.setScalar(1 + .04 * Math.sin(age * 1.7));
      studMaterial.emissiveIntensity = open * (1.6 + .9 * Math.sin(age * 3.1));
      studs.forEach((gem, n) => { gem.rotation.y = age * 1.6 + n; gem.position.y = .34 + .04 * Math.sin(age * 2 + n); });
      for (const sprite of motes) {
        const { phase, angle, radius, speed } = sprite.userData as { phase: number; angle: number; radius: number; speed: number };
        const t = (phase + age * speed) % 1, a = angle + t * 2.6;
        sprite.position.set(Math.cos(a) * radius * (1 - t * .3), .25 + t * 4.2, Math.sin(a) * radius * (1 - t * .3));
        sprite.scale.setScalar(.12 + .12 * Math.sin(t * Math.PI));
        sprite.material.opacity = Math.sin(t * Math.PI) * .95 * open;
      }
      light.intensity = open * (26 + 10 * pulse);
    },
    dispose() {
      group.removeFromParent();
      owned.geometry.forEach(geometry => geometry.dispose());
      owned.material.forEach(material => material.dispose());
      (column.material as THREE.MeshBasicMaterial).map?.dispose();
    },
  };
}
