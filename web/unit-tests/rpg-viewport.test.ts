import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { OrthographicCamera, Vector3 } from 'three';
import { dungeonCameraHalfHeight, dungeonCameraVerticalOffset, dungeonPortraitOffset } from '../src/rpg/world/viewport';
import { getRoomLayout } from '../src/rpg/world/roomLayout';

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
