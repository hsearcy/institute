import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { OrthographicCamera, Vector3 } from 'three';
import { dungeonCameraHalfHeight, dungeonCameraVerticalOffset, dungeonPortraitOffset, dungeonCombatFrame } from '../src/rpg/world/viewport';
import { Level, rectCenter, type Area } from '../src/rpg/world/levelGen';
import { packPositions } from '../src/rpg/world/formation';
import { enemyRoster } from '../src/rpg/world/enemyRoster';

type Point = { x: number; z: number };
function cameraFor(width: number, height: number, hero: Point, separateControls = false) {
  const half = dungeonCameraHalfHeight(width, height, separateControls), aspect = width / height;
  const offset = dungeonCameraVerticalOffset(height, separateControls);
  const camera = new OrthographicCamera(-half * aspect, half * aspect, half + offset, -half + offset, .1, 160);
  camera.position.set(hero.x + 17, 25, hero.z + 20);
  camera.lookAt(hero.x, .2, hero.z - 1.8); camera.updateMatrixWorld();
  return camera;
}

/** Real fights from generated levels: each pack, and the hero where combat begins. */
function fights(): { hero: Point; formation: Point[]; encounter: number; area: Area }[] {
  const result: { hero: Point; formation: Point[]; encounter: number; area: Area }[] = [];
  for (const [seed, biome] of [[4, 'vault'], [9, 'forest'], [15, 'garden']] as const) {
    const level = new Level(seed, biome);
    level.expandAround(level.start.x, level.start.z, 60);
    level.growNearest(level.start.x, level.start.z, 'sanctum');
    for (const area of level.areas.filter(area => area.kind !== 'entry')) {
      const formation = packPositions(level, area, 10);
      // Walk in along the route until the first body is in reach, as the world engages.
      const route = level.path(level.start, rectCenter(area.rect));
      let hero: Point = level.start;
      for (const point of route) {
        const steps = Math.ceil(Math.hypot(point.x - hero.x, point.z - hero.z) / .2);
        let reached = false;
        for (let i = 1; i <= steps && !reached; i++) {
          const at = { x: hero.x + (point.x - hero.x) * i / steps, z: hero.z + (point.z - hero.z) * i / steps };
          if (formation.some(body => Math.hypot(body.x - at.x, body.z - at.z) < 6.5)) { hero = at; reached = true; }
        }
        if (reached) break;
        hero = point;
      }
      result.push({ hero, formation, encounter: area.kind === 'sanctum' ? 5 : 1, area });
    }
  }
  return result;
}

test('Closer framing enlarges desktop and phone actors while retaining the hero', () => {
  assert.equal(dungeonCameraHalfHeight(1440, 900), 8.1);
  assert(10.5 / dungeonCameraHalfHeight(1440, 900) > 1.29);
  assert((12.6 / (390 / 844)) / dungeonCameraHalfHeight(390, 844) > 1.9);
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390], [768, 1024]]) {
    const hero = { x: 3, z: -7 }, camera = cameraFor(width, height, hero);
    for (const x of [-.6, .6]) for (const y of [0, 2.1]) for (const z of [-.6, .6]) {
      const projected = new Vector3(hero.x + x, y, hero.z + z).project(camera);
      assert(Math.abs(projected.x) < .96 && Math.abs(projected.y) < .96, `The hero is clipped at ${width}×${height}`);
    }
  }
});

test('Portrait browser chrome changes do not resize actors and orientation has no zoom discontinuity', () => {
  const unitsToPixels = (width: number, height: number) => height / (2 * dungeonCameraHalfHeight(width, height));
  assert(Math.abs(unitsToPixels(390, 720) - unitsToPixels(390, 844)) < 1e-10);
  assert(Math.abs(dungeonCameraHalfHeight(899, 900) - dungeonCameraHalfHeight(901, 900)) < .01);
  assert(Math.abs(dungeonCameraHalfHeight(710, 900) - dungeonCameraHalfHeight(712, 900)) < .03);
  assert(dungeonCameraHalfHeight(844, 390) < dungeonCameraHalfHeight(1440, 900));
  for (const [width, height] of [[0, 0], [NaN, 844], [390, Infinity], [-1, 900]]) assert(Number.isFinite(dungeonCameraHalfHeight(width, height)));
});

test('Portrait framing keeps the hero and surrounding spell space above an open keypad', () => {
  for (const [width, height, dockTop] of [[390, 844, 498], [360, 800, 454], [430, 932, 586]]) {
    const hero = { x: -2, z: 5 }, camera = cameraFor(width, height, hero);
    const offset = dungeonPortraitOffset(width, height, 118, dockTop - 14);
    camera.top += offset; camera.bottom += offset; camera.updateProjectionMatrix();
    for (const y of [0, 2.1]) {
      const p = new Vector3(hero.x, y, hero.z).project(camera);
      const screenY = (1 - p.y) * height / 2;
      assert(screenY > 130 && screenY < dockTop - 80, `Hero loses spell clearance at ${width}x${height}`);
    }
  }
  assert.equal(dungeonPortraitOffset(1440, 900, 100, 650), 0);
  assert.equal(dungeonPortraitOffset(622, 305, 70, 290), 0);
  assert.equal(dungeonPortraitOffset(390, 844, NaN, 500), 0);
  assert.equal(dungeonPortraitOffset(390, 844, 500, 100), 0);
  assert(dungeonPortraitOffset(390, 844, 118, 484) < dungeonPortraitOffset(390, 844, 118, 650));
});

test('Every generated fight fits below the header and above the dock once framed', () => {
  const all = fights();
  assert.ok(all.length >= 12 && all.some(fight => fight.encounter === 5));
  for (const [width, height] of [[622,305], [440,275], [1440,900], [1280,720], [1920,1080]]) for (const { hero, formation, encounter, area } of all) {
    const separateControls = height < 400;
    const camera = cameraFor(width, height, hero, separateControls), roster = enemyRoster(encounter, 10);
    const points = [new Vector3(hero.x, 0, hero.z), new Vector3(hero.x, 2.1, hero.z),
      ...formation.flatMap((point, i) => [new Vector3(point.x, 0, point.z), new Vector3(point.x, roster[i]!.height + .55, point.z)])];
    const ys = points.map(point => (1 - point.clone().project(camera).y) * height / 2);
    const top = separateControls ? 56 : 118, bottom = separateControls ? height - 22 : height - 225;
    const frame = dungeonCombatFrame(Math.min(...ys), Math.max(...ys), top, bottom, height);
    const half = dungeonCameraHalfHeight(width, height, separateControls) * frame.scale;
    const offset = frame.shift * 2 * half / height;
    camera.left = -half * width / height; camera.right = half * width / height;
    camera.top = half + offset; camera.bottom = -half + offset; camera.updateProjectionMatrix();
    for (const point of points) {
      const y = (1 - point.clone().project(camera).y) * height / 2;
      assert(y >= top - 1e-7 && y <= bottom + 1e-7, `${area.name}: an actor overlaps the HUD at ${width}×${height}: ${y}`);
    }
    if (Math.max(...ys) - Math.min(...ys) <= bottom - top) assert.equal(frame.scale, 1, 'Keep closer zoom whenever the fight fits');
  }
});

test('Portrait framing keeps full shoulder and weapon envelopes inside both edges', () => {
  for (const [width, height] of [[360,800], [390,844], [430,932]]) for (const { hero, formation, encounter, area } of fights()) {
    const camera = cameraFor(width, height, hero), roster = enemyRoster(encounter, 10), right = new Vector3(1,0,0).applyQuaternion(camera.quaternion);
    const points = formation.flatMap((point, index) => {
      const radius = roster[index]!.brute ? roster[index]!.height * .4 : .72;
      return [-1,1].map(side => new Vector3(point.x, 0, point.z).addScaledVector(right, radius * side));
    });
    points.push(...[-1,1].map(side => new Vector3(hero.x, 0, hero.z).addScaledVector(right, .65 * side)));
    const xs = points.map(point => (point.clone().project(camera).x + 1) * width / 2);
    const fit = dungeonCombatFrame(Math.min(...xs), Math.max(...xs), 18, width - 18, width);
    const half = dungeonCameraHalfHeight(width, height) * fit.scale, pan = -fit.shift * 2 * half / height;
    camera.left = -half * width / height + pan; camera.right = half * width / height + pan;
    camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
    for (const point of points) {
      const x = (point.clone().project(camera).x + 1) * width / 2;
      assert(x >= 18 - 1e-7 && x <= width - 18 + 1e-7, `${area.name} clips at ${width}×${height}: ${x}`);
    }
  }
});
