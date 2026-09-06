import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { Vector3 } from 'three';
import { CLEAVE_RELEASE, CLEAVE_SPEED, createCleaveStrike } from '../src/rpg/world/cleave';

test('Cleave leaves the actual distal blade and contacts each authoritative target on visible radial arrival once', () => {
  const grip = new Vector3(2, 1, 3), tip = new Vector3(2, 2, 3), origin = grip.clone().lerp(tip, .84);
  let clock = 0;
  const contacts: { index: number; age: number; at: Vector3; origin: Vector3 }[] = [];
  const positions = [new Vector3(-1, 0, -1), new Vector3(4, 0, -3), new Vector3(2, 0, -6)];
  const strike = createCleaveStrike(positions.map((position, index) => ({ position, height: index === 1 ? 3.4 : 1.85,
    contact: (at, released) => contacts.push({ index, age: clock, at: at.clone(), origin: released.clone() }),
  })));
  // Stable step is deliberately not a divisor of every target arrival time.
  for (clock = 0; clock <= 2; clock += .017) strike.update(grip, tip, clock, clock);
  assert.equal(contacts.length, 3);
  for (const contact of contacts) {
    const target = positions[contact.index], distance = Math.hypot(target.x - origin.x, target.z - origin.z);
    const expected = CLEAVE_RELEASE + distance / CLEAVE_SPEED;
    assert(contact.age >= expected && contact.age < expected + .018, 'No early damage or arbitrary target-order timer');
    assert(contact.origin.distanceTo(origin) < 1e-8);
    assert.equal(contact.at.x, target.x); assert.equal(contact.at.z, target.z);
    assert(contact.at.y > 1 && contact.at.y <= 1.15);
  }
  assert.equal(strike.layers[1].visible, false, 'The cutting edge expires after the farthest contact');
});

test('The near trace follows a changed live blade rather than a precomputed hero-centered arc', () => {
  const strike = createCleaveStrike([]), grip = new Vector3(3, 1, -2), tip = new Vector3(3, 2, -2);
  strike.update(grip, tip, .1, 1);
  tip.set(2.7, 1.2, -3.1); strike.update(grip, tip, .13, 1.03);
  const positions = strike.layers[0].geometry.attributes.position;
  assert(new Vector3().fromBufferAttribute(positions, 1).distanceTo(tip) < 1e-6);
  assert.equal(strike.layers[0].visible, true);
  strike.update(grip, tip, .7, 1.6); assert.equal(strike.layers[0].visible, false);
  for (const layer of strike.layers) assert([...layer.geometry.attributes.position.array].every(Number.isFinite));
});

test('A dropped frame crosses queued contacts exactly once without changing target coverage', () => {
  let contacts = 0;
  const strike = createCleaveStrike([1, 3, 6].map(z => ({ position: new Vector3(0, 0, -z), height: 2, contact: () => { contacts++; } })));
  const grip = new Vector3(0, 1, 0), tip = new Vector3(0, 2, 0);
  strike.update(grip, tip, .12, .12); assert.equal(contacts, 0);
  strike.update(grip, tip, 1.1, 1.1); assert.equal(contacts, 3);
  strike.update(grip, tip, 1.2, 1.2); assert.equal(contacts, 3);
});

test('A near-target edge sector terminates while a farther sector still travels', () => {
  const grip = new Vector3(0, 1, 0), tip = new Vector3(0, 2, 0);
  const strike = createCleaveStrike([
    { position: new Vector3(-1, 0, -2), height: 2, contact: () => {} },
    { position: new Vector3(2, 0, -6), height: 2, contact: () => {} },
  ]);
  strike.update(grip, tip, CLEAVE_RELEASE + .36, 1);
  const vertices = strike.layers[1].geometry.attributes.position;
  let collapsed = 0, open = 0;
  for (let i = 0; i < vertices.count; i += 2) {
    const width = new Vector3().fromBufferAttribute(vertices, i).distanceTo(new Vector3().fromBufferAttribute(vertices, i + 1));
    if (width < 1e-7) collapsed++; else open++;
  }
  assert(collapsed > 2, 'The short sector must not remain visible past its target');
  assert(open > 2, 'The far target still receives an advancing edge');
});

test('Resuming after the mesh lifetime still reconciles every supplied target once', () => {
  let contacts = 0;
  const strike = createCleaveStrike([1, 4].map(z => ({ position: new Vector3(0, 0, -z), height: 2, contact: () => { contacts++; } })));
  const grip = new Vector3(0, 1, 0), tip = new Vector3(0, 2, 0);
  strike.update(grip, tip, CLEAVE_RELEASE + .15, 1); assert.equal(contacts, 1);
  strike.finish(grip, tip); assert.equal(contacts, 2);
  strike.finish(grip, tip); assert.equal(contacts, 2, 'The fallback cannot replay a survivor reaction');
});

test('The separated cutting segments leave the untargeted gap empty without an indexed connector', () => {
  const polar = (degrees: number, distance: number) => new Vector3(Math.sin(degrees * Math.PI / 180) * distance, 0, Math.cos(degrees * Math.PI / 180) * distance);
  const strike = createCleaveStrike([[144.4, 3.32], [190.2, 5.96], [-122.95, 5.91]].map(([angle, distance]) => ({ position: polar(angle, distance), height: 1.85, contact: () => {} })));
  strike.update(new Vector3(0, 1, 0), new Vector3(0, 2, 0), CLEAVE_RELEASE + 5.06 / CLEAVE_SPEED, 1);
  const obstacle = polar(155.7, 5.06), geometry = strike.layers[1].geometry, positions = geometry.attributes.position, indices = geometry.index!;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < indices.count; i += 3) {
    a.fromBufferAttribute(positions, indices.getX(i)); b.fromBufferAttribute(positions, indices.getX(i + 1)); c.fromBufferAttribute(positions, indices.getX(i + 2));
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    if (area < 1e-7) continue;
    const overlaps = obstacle.x + .3 > Math.min(a.x, b.x, c.x) && obstacle.x - .3 < Math.max(a.x, b.x, c.x)
      && obstacle.z + .3 > Math.min(a.z, b.z, c.z) && obstacle.z - .3 < Math.max(a.z, b.z, c.z);
    assert.equal(overlaps, false, 'Visible triangles must not bridge across the untouched rear actor');
  }
});

test('A close untargeted direction trims only its side of the crescent while preserving the target crossing', () => {
  const target = { position: new Vector3(0, 0, -4), height: 1.85, contact: () => {} };
  const strike = createCleaveStrike([target], [{ position: new Vector3(.8, 0, -5), height: 2 }]);
  strike.update(new Vector3(0, 1, 0), new Vector3(0, 2, 0), CLEAVE_RELEASE + .4, 1);
  const vertices = strike.layers[1].geometry.attributes.position, xs = Array.from({ length: vertices.count }, (_, i) => vertices.getX(i));
  assert(Math.min(...xs) < 0 && Math.max(...xs) > 0, 'The visible cutting lip still crosses its own target');
  assert(-Math.min(...xs) > Math.max(...xs) * 2, 'Only the side next to the untouched actor is shortened');
});
