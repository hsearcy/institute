import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isCrossingChasm, boundsIntersectCrossingChasm, getRoomLayout } from './roomLayout';
import { isRuinFootprintClear, ruinGeometry } from './ruins';

/** Low relief and remnants of the old vault. All meshes are static, grouped by
 * room/material, and have no collision or connection to learning state. */
export function createVaultScenery(base: Record<string, THREE.MeshStandardMaterial>): THREE.Group {
  const group = new THREE.Group();
  const batches = new Map<string, { room: number; material: THREE.Material; geometry: THREE.BufferGeometry[]; shadow: boolean }>();
  let seed = 182734;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const stone = base.wall.clone(); stone.color.setHex(0x686b63); stone.vertexColors = true;
  const paleStone = base.trim.clone(); paleStone.color.setHex(0x94968a); paleStone.vertexColors = true;
  const clay = new THREE.MeshStandardMaterial({ color: 0x665039, roughness: .98, side: THREE.DoubleSide, vertexColors: true });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x382c28, roughness: .98, side: THREE.DoubleSide, vertexColors: true });
  const wax = new THREE.MeshStandardMaterial({ color: 0xc3af79, roughness: .92, vertexColors: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x393d36, roughness: .68, metalness: .66, vertexColors: true });
  const wick = new THREE.MeshBasicMaterial({ color: 0xffce76, toneMapped: false, vertexColors: true });
  // Soft, irregular masks avoid the hard circles of a stamped decal. They are
  // native renderer data, generated once; material lighting supplies the detail.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 150; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 78;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    const radius = 10 + random() * 30;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${.15 + random() * .6})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const mask = new THREE.CanvasTexture(canvas);
  group.userData.ownedTextures = [mask];
  const grime = new THREE.MeshStandardMaterial({ color: 0x292419, roughness: 1, alphaMap: mask, transparent: true, opacity: .72, depthWrite: false, vertexColors: true });
  const wet = new THREE.MeshStandardMaterial({ color: 0x29312c, roughness: .17, metalness: .3, alphaMap: mask, transparent: true, opacity: .65, depthWrite: false, vertexColors: true });

  // A separate mask UV channel lets weathering change the color/roughness of
  // the existing cobbles while their map and normal detail remain registered.
  const maskSize = 128, wearPixels = new Uint8Array(maskSize * maskSize * 4);
  const hash = (x: number, y: number) => { const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return value - Math.floor(value); };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
  };
  for (let y = 0; y < maskSize; y++) for (let x = 0; x < maskSize; x++) {
    const u = x / (maskSize - 1) * 2 - 1, v = y / (maskSize - 1) * 2 - 1;
    const radius = Math.hypot((u + Math.sin(v * 4) * .14) * 1.05, (v + Math.sin(u * 5) * .12) * .98);
    const edge = THREE.MathUtils.clamp((.83 - radius + noise(x / 13, y / 13) * .19) * 8, 0, 1);
    const deposits = THREE.MathUtils.clamp((noise(x / 12, y / 18) * .65 + noise(x / 3, y / 4) * .35 - .29) * 2.1, 0, 1);
    const border = THREE.MathUtils.clamp(Math.min(x, y, maskSize - 1 - x, maskSize - 1 - y) / 9, 0, 1);
    const value = Math.round(edge * deposits * border * 255), index = (y * maskSize + x) * 4;
    wearPixels.set([value, value, value, 255], index);
  }
  const wearMask = new THREE.DataTexture(wearPixels, maskSize, maskSize); wearMask.channel = 1; wearMask.minFilter = THREE.LinearMipmapLinearFilter; wearMask.magFilter = THREE.LinearFilter; wearMask.generateMipmaps = true; wearMask.needsUpdate = true;
  const dust = (base.floor ?? base.wall).clone(), worn = (base.floor ?? base.wall).clone();
  for (const material of [dust, worn]) { material.alphaMap = wearMask; material.transparent = true; material.depthWrite = false; material.vertexColors = true; material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1; }
  dust.color.setHex(0xa49577); dust.roughness = 1; dust.opacity = .52;
  worn.color.setHex(0x58605b); worn.roughness = .29; worn.metalness = .04; worn.opacity = .58;
  group.userData.ownedTextures.push(wearMask);
  group.userData.ownedMaterials = [stone, paleStone, clay, cloth, wax, iron, wick, grime, wet, dust, worn];

  const add = (room: number, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1), shadow = true, keepCombatClear = false) => {
    if (isCrossingChasm(room, position.x, position.z + room * 20)) { geometry.dispose(); return; }
    geometry.applyMatrix4(new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale));
    if (material === dust || material === worn) {
      const vertices = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < vertices.count; i++) uv.setXY(i, vertices.getX(i) / 4.8, vertices.getZ(i) / 4.8);
    }
    // Test the whole transformed footprint, including tilted raised rubble:
    // center-only tests allow long blocks to hang visibly over the crossing.
    geometry.computeBoundingBox();
    const worldBounds = geometry.boundingBox!;
    const bounds = { minX: worldBounds.min.x, maxX: worldBounds.max.x, minZ: worldBounds.min.z + room * 20, maxZ: worldBounds.max.z + room * 20 };
    if (boundsIntersectCrossingChasm(room, bounds)) { geometry.dispose(); return; }
    if (keepCombatClear && !isRuinFootprintClear(room, bounds)) { geometry.dispose(); return; }
    const shade = .72 + random() * .45, colors = new Float32Array(geometry.getAttribute('position').count * 3);
    const authoredColor = geometry.getAttribute('color');
    for (let i = 0; i < colors.length; i += 3) { colors[i] = shade * (authoredColor?.getX(i / 3) ?? 1); colors[i + 1] = shade * .98 * (authoredColor?.getY(i / 3) ?? 1); colors[i + 2] = shade * .93 * (authoredColor?.getZ(i / 3) ?? 1); }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const key = `${room}:${material.uuid}:${shadow}`;
    if (!batches.has(key)) batches.set(key, { room, material, geometry: [], shadow });
    batches.get(key)!.geometry.push(flat);
  };
  const box = (room: number, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0) => add(room, new THREE.BoxGeometry(w, h, d), material, new THREE.Vector3(x, y, z), new THREE.Euler(0, angle, 0));
  const shard = (room: number, x: number, z: number, radius: number, height: number, material = stone) => {
    const shape = new THREE.Shape();
    for (let n = 0; n < 5; n++) {
      const angle = n / 5 * Math.PI * 2, r = radius * (.6 + random() * .4);
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      if (n === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .018, bevelThickness: .012 });
    add(room, g, material, new THREE.Vector3(x, -.025, z), new THREE.Euler(-Math.PI / 2, 0, random() * Math.PI * 2), new THREE.Vector3(1.3, 1, 1));
  };
  const fallenBlock = (room: number, x: number, z: number, w: number, h: number, d: number, angle: number, material = stone, lean = .15) => {
    const shape = new THREE.Shape(), cut = Math.min(w, d) * (.1 + random() * .16);
    const corners = [[-w / 2 + cut, -d / 2], [w / 2 - cut, -d / 2], [w / 2, -d / 2 + cut], [w / 2, d / 2 - cut], [w / 2 - cut, d / 2], [-w / 2 + cut, d / 2], [-w / 2, d / 2 - cut], [-w / 2, -d / 2 + cut]];
    corners.forEach(([px, pz], index) => { if (index) shape.lineTo(px, pz); else shape.moveTo(px, pz); }); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: Math.min(.045, h * .18), bevelThickness: Math.min(.035, h * .14) });
    geometry.rotateX(-Math.PI / 2); geometry.rotateZ((random() - .5) * lean); geometry.rotateX((random() - .5) * lean); geometry.rotateY(angle);
    geometry.computeBoundingBox(); geometry.translate(0, .008 - geometry.boundingBox!.min.y, 0);
    add(room, geometry, material, new THREE.Vector3(x, 0, z), undefined, undefined, h > .08, true);
  };
  const stain = (room: number, x: number, z: number, w: number, d: number, material: THREE.Material) => add(room, new THREE.PlaneGeometry(w, d), material, new THREE.Vector3(x, -.035 + random() * .005, z), new THREE.Euler(-Math.PI / 2, 0, random() * Math.PI * 2), undefined, false);

  for (let room = 0; room < 6; room++) {
    const center = -room * 20;
    // Broad deposits and polished damp lanes follow the same cobbles beneath.
    // These are flat surface changes: neither enemies nor the hero gain obstacles.
    const weatherPatches = room === 3
      ? [[-1.9, -3.5, 2.3, 3.6, .05, 0], [1.7, 4.8, 2.6, 2.5, .15, 1]]
      : [[-3.9, -3.7, 5.6, 3.6, .38, 0], [4.4, 2.6, 5.1, 3.1, -.65, 0], [-4.9, 6.3, 4.3, 2.4, .25, 0], [3.3, -6.1, 4.5, 2.2, -.35, 0], [-4.6, 1.3, 3.2, 2.5, 1.15, 1], [3.7, -2, 3.0, 2.6, .15, 1]];
    for (const [x, z, width, depth, angle, wetness] of weatherPatches) {
      const geometry = new THREE.PlaneGeometry(width, depth); geometry.setAttribute('uv1', geometry.getAttribute('uv').clone());
      add(room, geometry, wetness ? worn : dust, new THREE.Vector3(x, -.032 + wetness * .001, center + z), new THREE.Euler(-Math.PI / 2, 0, angle + room * .37), undefined, false);
    }
    // A worn procession aisle: chipped corners rise only centimetres above the
    // original floor, with cracks and missing pieces outside the walking line.
    for (let n = 0; n < 8; n++) {
      const side = n % 2 ? 1 : -1, x = side * (3.2 + random() * 3.3), z = center - 8.2 + random() * 17;
      shard(room, x, z, .07 + random() * .13, .012 + random() * .018, n % 4 ? stone : paleStone);
      if (n % 4 === 0) stain(room, x + .4, z, 2.2, 1.4, grime);
    }
    for (const side of [-1, 1]) {
      const layout = getRoomLayout(room), clusters = side < 0 ? 3 : 2;
      for (let cluster = 0; cluster < clusters; cluster++) {
        const onApron = room !== 3 && ((side < 0 && cluster === 1) || (side > 0 && cluster === 0));
        const x = side * (layout.sideWallX - layout.sideWallWidth * .5 - 1.05 - (onApron ? .9 : 0) + (random() - .5) * .35);
        const sampledZ = -6.1 + cluster * (12.2 / (clusters - 1)) + (random() - .5) * 1.3;
        // Two deliberate gaps between the tomb rows reveal the collapse piles.
        // The crossing keeps its original shore placements beside the pits.
        const z = center + (onApron ? (side < 0 ? 2.25 : -3.25) : sampledZ);
        const collapseAngle = side * (.45 + random() * .9);
        stain(room, x - side * .15, z, 4.8, 3.6, grime);
        stain(room, x + side * .65, z + .7, 2.9, 2.1, grime);
        // A few recognizable broken courses anchor each pile. The smaller
        // pieces spill inward in an uneven fan, rather than a uniform scatter.
        if (onApron) {
          const geometry = ruinGeometry(side < 0 ? 'fallen-column' : 'column-stump', room * 53 + cluster + 3);
          add(room, geometry, paleStone, new THREE.Vector3(x, .015, z), new THREE.Euler(0, side < 0 ? .1 : collapseAngle, 0), undefined, true, true);
        } else {
          fallenBlock(room, x, z, 1.25 + random() * .45, .28 + random() * .18, .65 + random() * .3, collapseAngle, stone, .35);
          fallenBlock(room, x + side * .38, z + .47, .62 + random() * .32, .38 + random() * .32, .5 + random() * .25, collapseAngle + .7, paleStone, .8);
        }
        for (let chunk = 0; chunk < 9; chunk++) {
          const angle = random() * Math.PI * 2, spread = Math.sqrt(random());
          const px = x + Math.cos(angle) * spread * 1.45, pz = z + Math.sin(angle) * spread * 1.65;
          fallenBlock(room, px, pz, .24 + random() * .56, .09 + random() * .24, .2 + random() * .4, collapseAngle + (random() - .5) * 2.4, chunk % 5 ? stone : paleStone, .55);
        }
        for (let grit = 0; grit < 30; grit++) {
          const angle = random() * Math.PI * 2, spread = .3 + Math.sqrt(random()) * 1.9;
          const px = x + Math.cos(angle) * spread, pz = z + Math.sin(angle) * spread * .9;
          const size = .035 + random() * .11;
          fallenBlock(room, px, pz, size * 1.8, size * .43, size, random() * Math.PI * 2, grit % 7 ? stone : paleStone, .45);
        }
      }
      for (let n = 0; n < 6; n++) {
        const x = side * (8.1 + random() * 4.8), z = center - 8.5 + n * 3.2;
        stain(room, x, z, 5.5, 3.4, grime);
        if (n % 3 === 0) stain(room, side * (6.3 + random()), z + .7, 2.5, 1.7, wet);
        // Broken vessels, their exposed curved rims and dark inner faces.
        if ((n + room) % 2 === 0) {
          const profile = [new THREE.Vector2(.15, 0), new THREE.Vector2(.27, .12), new THREE.Vector2(.32, .31), new THREE.Vector2(.25, .52), new THREE.Vector2(.16, .59), new THREE.Vector2(.18, .65)];
          const pot = new THREE.LatheGeometry(profile, 10, .2, Math.PI * 1.45);
          add(room, pot, clay, new THREE.Vector3(x, .03, z), new THREE.Euler(.15, random() * 6, (random() - .5) * .4));
          for (let chip = 0; chip < 4; chip++) shard(room, x + (random() - .5) * 1.4, z + (random() - .5) * 1.3, .08 + random() * .13, .025, clay);
        }
        // Rotted beams and iron straps mark where balconies fell into the aisle.
        if ((n + room) % 3 === 1) {
          const angle = side * (.25 + random() * .5);
          box(room, cloth, x, .15, z, .22, .25, 1.8, angle);
          box(room, iron, x, .29, z, .27, .035, .19, angle);
        }
      }
      // Offerings huddle beside tombs, not around the hero like UI markers.
      for (let cluster = 0; cluster < 2; cluster++) {
        const x = side * (8.3 + random() * .45), z = center - 5.8 + cluster * 9;
        for (let n = 0; n < 5; n++) {
          const px = x + (random() - .5) * .8, pz = z + (random() - .5) * .8, h = .11 + random() * .28;
          add(room, new THREE.CylinderGeometry(.035, .055, h, 7), wax, new THREE.Vector3(px, h * .5 + .04, pz));
          add(room, new THREE.SphereGeometry(.035, 5, 4), wick, new THREE.Vector3(px, h + .07, pz), undefined, new THREE.Vector3(.75, 1.8, .75), false);
        }
      }
      // Low ruins fill the visible exterior rather than ending in an empty grid.
      for (let n = 0; n < 8; n++) {
        const x = side * (14 + random() * 5.3), z = center - 8.7 + random() * 18;
        shard(room, x, z, .4 + random() * .7, .08 + random() * .2);
        if (n % 3 === 0) {
          box(room, stone, x, .12, z, 1.8, .27, 2.3, random());
          for (let chip = 0; chip < 6; chip++) shard(room, x + (random() - .5) * 3, z + (random() - .5) * 3, .08 + random() * .3, .08);
        }
      }
    }
    // A discarded, torn ceremonial runner breaks up the repeating cobbles.
    if (room % 2 === 0) {
      const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
      for (let row = 0; row < 9; row++) for (let edge = 0; edge < 2; edge++) {
        vertices.push((edge ? 1 : -1) * (.40 + random() * .18), .022 + random() * .025, row * .28);
        uv.push(edge, row / 8);
        if (row < 8 && edge === 0) { const i = row * 2; indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
      add(room, g, cloth, new THREE.Vector3(room % 4 === 0 ? -6.6 : 6.6, 0, center - 4), new THREE.Euler(0, .5 + room, 0), undefined, false);
    }
    // Fragments of iron portcullis remain attached to the high side of the vault.
    for (let chain = 0; chain < 2; chain++) {
      const layout = getRoomLayout(room), x = -11.55 - (layout.sideWallX - 12.2), z = center - 6.2 + chain * 9.7;
      for (let n = 0; n < 12; n++) {
        const g = new THREE.TorusGeometry(.105, .019, 4, 8); g.scale(.65, 1, 1);
        add(room, g, iron, new THREE.Vector3(x + Math.sin(n * .23 + room) * .12, Math.min(3.5, layout.wallHeights.left - .3) - n * .15, z), new THREE.Euler(0, n % 2 ? Math.PI / 2 : 0, .08 * Math.sin(n)), undefined, false);
      }
    }
  }
  for (const { room, material, geometry, shadow } of batches.values()) {
    const merged = mergeGeometries(geometry, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, material); mesh.userData.room = room;
      mesh.castShadow = shadow; mesh.receiveShadow = ![grime, wet, wick].includes(material as THREE.MeshStandardMaterial);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); group.add(mesh);
    }
    geometry.forEach(g => g.dispose());
  }
  return group;
}
