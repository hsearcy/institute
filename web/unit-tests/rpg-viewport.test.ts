import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { OrthographicCamera, Vector3 } from 'three';
import { dungeonCameraHalfHeight, dungeonCameraVerticalOffset, dungeonPortraitOffset, dungeonCombatFrame } from '../src/rpg/world/viewport';
import { enemyPositions, getRoomLayout } from '../src/rpg/world/roomLayout';
import { enemyRoster } from '../src/rpg/world/enemyRoster';

function cameraFor(width: number, height: number, room = 0, separateControls = false) {
  const half = dungeonCameraHalfHeight(width, height, separateControls), aspect = width / height, layout = getRoomLayout(room);
  const offset = dungeonCameraVerticalOffset(height, separateControls);
  const camera = new OrthographicCamera(-half * aspect, half * aspect, half + offset, -half + offset, .1, 160);
  camera.position.set(layout.heroX + 17, 25, layout.heroZ + 20);
  camera.lookAt(layout.heroX, .2, layout.heroZ - 1.8); camera.updateMatrixWorld();
  return camera;
}

test('Closer framing enlarges desktop and phone actors while retaining the hero and forward approach', () => {
  assert.equal(dungeonCameraHalfHeight(1440, 900), 8.1);
  assert(10.5 / dungeonCameraHalfHeight(1440, 900) > 1.29);
  assert((12.6 / (390 / 844)) / dungeonCameraHalfHeight(390, 844) > 1.9);
  for (let room = 0; room < 6; room++) for (const [width, height] of [[1440, 900], [390, 844], [844, 390], [768, 1024]]) {
    const layout = getRoomLayout(room), camera = cameraFor(width, height, room);
    const nearest = layout.hordeAnchors.filter(anchor => anchor.z < layout.heroZ).sort((a, b) => Math.hypot(a.x - layout.heroX, a.z - layout.heroZ) - Math.hypot(b.x - layout.heroX, b.z - layout.heroZ))[0];
    for (const center of [{ x: layout.heroX, z: layout.heroZ }, nearest]) {
      for (const x of [-.6, .6]) for (const y of [0, 2.1]) for (const z of [-.6, .6]) {
        const projected = new Vector3(center.x + x, y, center.z + z).project(camera);
        assert(Math.abs(projected.x) < .96 && Math.abs(projected.y) < .96, `Room ${room} approaching actor is clipped at ${width}×${height}`);
      }
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

// These are actual canvas rectangles after the landscape side panel and hotbar.
test('Separate landscape combat panes retain full approaching actors at closer zoom', () => {
  for (let room = 0; room < 6; room++) for (const [width, height] of [[622, 305], [440, 275], [368, 235], [778, 415]]) {
    const layout = getRoomLayout(room), camera = cameraFor(width, height, room, true);
    const nearest = layout.hordeAnchors.filter(anchor => anchor.z < layout.heroZ).sort((a, b) => Math.hypot(a.x - layout.heroX, a.z - layout.heroZ) - Math.hypot(b.x - layout.heroX, b.z - layout.heroZ))[0];
    assert(dungeonCameraHalfHeight(width, height, true) < dungeonCameraHalfHeight(width, height));
    for (const center of [{x: layout.heroX, z: layout.heroZ}, nearest]) for (const x of [-.6, .6]) for (const y of [0, 2.1]) for (const z of [-.6, .6]) {
      const projected = new Vector3(center.x + x, y, center.z + z).project(camera);
      assert(Math.abs(projected.x) < .96 && Math.abs(projected.y) < .96, `Room ${room} actor clipped in ${width}x${height} pane`);
    }
  }
});

test('Portrait framing keeps the hero and surrounding spell space above an open keypad', () => {
  for (let room = 0; room < 6; room++) for (const [width, height, dockTop] of [[390, 844, 498], [360, 800, 454], [430, 932, 586]]) {
    const camera = cameraFor(width, height, room), layout = getRoomLayout(room);
    const offset = dungeonPortraitOffset(width, height, 118, dockTop - 14);
    camera.top += offset; camera.bottom += offset; camera.updateProjectionMatrix();
    for (const y of [0, 2.1]) {
      const p = new Vector3(layout.heroX, y, layout.heroZ).project(camera);
      const screenY = (1 - p.y) * height / 2;
      assert(screenY > 130 && screenY < dockTop - 80, `Hero loses spell clearance in room ${room} at ${width}x${height}`);
    }
  }
  assert.equal(dungeonPortraitOffset(1440, 900, 100, 650), 0);
  assert.equal(dungeonPortraitOffset(622, 305, 70, 290), 0);
  assert.equal(dungeonPortraitOffset(390, 844, NaN, 500), 0);
  assert.equal(dungeonPortraitOffset(390, 844, 500, 100), 0);
  assert(dungeonPortraitOffset(390, 844, 118, 484) < dungeonPortraitOffset(390, 844, 118, 650));
});

test('Complete landscape and desktop formations fit below the boss/header and above the dock', () => {
  for (const [width, height] of [[622,305], [440,275], [368,235], [1440,900], [1280,720], [1920,1080]]) for (let room = 0; room < 6; room++) {
    const separateControls = height < 400;
    const camera = cameraFor(width, height, room, separateControls), layout = getRoomLayout(room);
    const roster = enemyRoster(room, 10), formation = enemyPositions(room, 10);
    const points = [new Vector3(layout.heroX, 0, layout.heroZ), new Vector3(layout.heroX, 2.1, layout.heroZ),
      ...formation.flatMap((point, i) => [new Vector3(point.x, 0, point.z), new Vector3(point.x, roster[i].height + .55, point.z)])];
    const ys = points.map(point => (1 - point.clone().project(camera).y) * height / 2);
    const top = room === 5 ? (separateControls ? 100 : 200) : (separateControls ? 56 : 118), bottom = separateControls ? height - 22 : height - 225;
    const frame = dungeonCombatFrame(Math.min(...ys), Math.max(...ys), top, bottom, height);
    const half = dungeonCameraHalfHeight(width, height, separateControls) * frame.scale;
    const offset = frame.shift * 2 * half / height;
    camera.left = -half * width / height; camera.right = half * width / height;
    camera.top = half + offset; camera.bottom = -half + offset; camera.updateProjectionMatrix();
    for (const point of points) {
      const y = (1 - point.clone().project(camera).y) * height / 2;
      assert(y >= top - 1e-7 && y <= bottom + 1e-7, `Room ${room} actor overlaps HUD at ${width}×${height}: ${y}`);
    }
    if (Math.max(...ys) - Math.min(...ys) <= bottom - top) assert.equal(frame.scale, 1, 'Keep closer zoom whenever the formation fits');
  }
});

test('Portrait framing keeps full shoulder and weapon envelopes inside both edges', () => {
  for (const [width, height] of [[360,800], [390,844], [430,932]]) for (let room = 0; room < 6; room++) {
    const camera = cameraFor(width, height, room), layout = getRoomLayout(room);
    const roster = enemyRoster(room, 10), right = new Vector3(1,0,0).applyQuaternion(camera.quaternion);
    const points = enemyPositions(room, 10).flatMap((point, index) => {
      const radius = roster[index].brute ? roster[index].height * .4 : .72;
      return [-1,1].map(side => new Vector3(point.x, 0, point.z).addScaledVector(right, radius * side));
    });
    points.push(...[-1,1].map(side => new Vector3(layout.heroX, 0, layout.heroZ).addScaledVector(right, .65 * side)));
    const xs = points.map(point => (point.clone().project(camera).x + 1) * width / 2);
    const fit = dungeonCombatFrame(Math.min(...xs), Math.max(...xs), 18, width - 18, width);
    const half = dungeonCameraHalfHeight(width, height) * fit.scale, pan = -fit.shift * 2 * half / height;
    camera.left = -half * width / height + pan; camera.right = half * width / height + pan;
    camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
    for (const point of points) {
      const x = (point.clone().project(camera).x + 1) * width / 2;
      assert(x >= 18 - 1e-7 && x <= width - 18 + 1e-7, `Room ${room} clips at ${width}×${height}: ${x}`);
    }
    if (room === 0 || room === 5) assert.equal(fit.scale, 1, 'Starter and boss formations retain the closer portrait zoom');
  }
});
