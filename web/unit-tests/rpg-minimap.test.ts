import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { OrthographicCamera, Vector3 } from 'three';
import { HEAR_RADIUS, LurkTimer, ScoutMemory, lurkGain, packShown, screenAngle, screenPan, toScreen, type ScoutView } from '../src/rpg/minimapModel';
import { Level } from '../src/rpg/world/levelGen';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Where a floor point lands on the real game camera, relative to the hero, in screen units (y down). */
function onCamera(dx: number, dz: number): { x: number; y: number } {
  const camera = new OrthographicCamera(-10, 10, 10, -10, .1, 200);
  camera.position.set(17, 25, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const p = new Vector3(dx, 0, dz).project(camera), o = new Vector3(0, 0, 0).project(camera);
  return { x: (p.x - o.x) * 10, y: -(p.y - o.y) * 10 };
}

test('the minimap turns and tilts with the isometric camera', () => {
  for (const [dx, dz] of [[5, 0], [0, 5], [-3, 7], [4, -6]] as const) {
    const map = toScreen(dx, dz, 1), screen = onCamera(dx, dz);
    close(map.x, screen.x, 1e-4); close(map.y, screen.y, 1e-4);
  }
  // The hero facing away from the camera points up the map.
  const away = screenAngle(Math.atan2(-17, -20));
  close(away, -Math.PI / 2, 1e-9);
});

test('a pack sounds louder as the hero comes near, and is silent far off', () => {
  assert.equal(lurkGain(HEAR_RADIUS + 1), 0);
  assert.equal(lurkGain(3), 1);
  assert.ok(lurkGain(12) > lurkGain(20) && lurkGain(20) > lurkGain(30));
});

test('a pack to the right of the screen is heard on the right', () => {
  const right = toScreen(10, 0, 1).x > 0 ? 1 : -1;
  assert.ok(screenPan(10 * right, 0) > 0);
  assert.ok(screenPan(-10 * right, 0) < 0);
  // Straight up the screen is centred.
  close(screenPan(-17, -20), 0, 1e-9);
  assert.ok(Math.abs(screenPan(1000, 0)) <= .8);
});

const view = (over: Partial<ScoutView> = {}): ScoutView => ({ areas: [], corridors: [], openExits: [], chests: [], hero: { x: 0, z: 0 }, heading: 0,
  pack: { x: 10, z: 0 }, packOnScreen: false, engaged: false, searching: true, ...over });

test('idle sounds play only while the hero searches, after a short pause', () => {
  const timer = new LurkTimer(() => .5);
  assert.equal(timer.update(0, view()), undefined);
  assert.equal(timer.update(1, view()), undefined);
  const sound = timer.update(4, view());
  assert.ok(sound && sound.gain > .5);
  assert.equal(timer.update(4.1, view()), undefined, 'never two at once');
  assert.equal(timer.update(30, view({ engaged: true })), undefined);
  assert.equal(timer.update(31, view({ searching: false })), undefined);
  assert.equal(timer.update(40, view({ pack: undefined })), undefined);
});

test('the pack shows near, on screen or in the fight, never far and unseen', () => {
  assert.ok(packShown(view()));
  assert.ok(!packShown(view({ pack: { x: 60, z: 0 } })));
  assert.ok(packShown(view({ pack: { x: 60, z: 0 }, packOnScreen: true })));
  assert.ok(packShown(view({ pack: { x: 60, z: 0 }, engaged: true })));
  assert.ok(!packShown(view({ pack: undefined })));
});

test('the hero remembers the floor he has seen and the hallways he walked', () => {
  const level = new Level(11, 'vault');
  level.expandAround(level.start.x, level.start.z, 200);
  const memory = new ScoutMemory();
  const scout = (hero: { x: number; z: number }) => view({ areas: level.areas, corridors: level.corridors, hero, pack: undefined });
  memory.update(scout(level.start));
  assert.ok(memory.seenAreas.has(0));
  const far = level.areas.find(area => Math.hypot(area.rect.minX - level.start.x, area.rect.minZ - level.start.z) > 60);
  if (far) assert.ok(!memory.seenAreas.has(far.id));
  const corridor = level.corridors[0]!, inside = corridor.rects[0]!;
  memory.update(scout({ x: (inside.minX + inside.maxX) / 2, z: (inside.minZ + inside.maxZ) / 2 }));
  assert.ok(memory.walkedCorridors.has(corridor.id) && memory.seenCorridors.has(corridor.id));
  memory.clear();
  assert.equal(memory.seenAreas.size, 0);
});

test('a shown pack brings its room and the hallways back to known floor onto the map', () => {
  const level = new Level(5, 'vault');
  level.expandAround(level.start.x, level.start.z, 120);
  const corridorTo = (id: number) => level.corridors.find(corridor => corridor.to === id);
  // An area two hallways from the entry.
  const target = level.areas.find(area => { const into = corridorTo(area.id); return into && into.from !== 0 && corridorTo(into.from)?.from === 0; });
  assert.ok(target, 'the level has an area two hallways deep');
  const memory = new ScoutMemory();
  const middle = { x: (target.rect.minX + target.rect.maxX) / 2, z: (target.rect.minZ + target.rect.maxZ) / 2 };
  memory.update(view({ areas: level.areas, corridors: level.corridors, hero: level.start, pack: middle, packArea: target.id, packOnScreen: true }));
  const first = corridorTo(target.id)!, second = corridorTo(first.from)!;
  assert.ok(memory.seenAreas.has(target.id) && memory.seenAreas.has(first.from));
  assert.ok(memory.seenCorridors.has(first.id) && memory.seenCorridors.has(second.id));
});
