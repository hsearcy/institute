import { expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { createDirectedFlight, directionalFlightDuration, sampleGroundBranch, targetHeading } from '../src/rpg/world/directional';
import { arcLanceGeometry, createIceLanceWake } from '../src/rpg/world/directionalVisuals';

test('Directional tips hit targets in all quadrants, including behind the authored forward axis', () => {
  const from = new Vector3(2, 1.4, 3);
  for (const offset of [new Vector3(0, 0, -6), new Vector3(0, 0, 6), new Vector3(-5, 0, 2), new Vector3(5, 0, -2)]) {
    const target = from.clone().add(offset), duration = directionalFlightDuration(from, target);
    let count = 0;
    const flight = createDirectedFlight(from, duration, to => to.copy(target), (at, release) => {
      expect(at.distanceTo(target)).toBeLessThan(1e-8);
      expect(release.equals(from)).toBe(true); count++;
    });
    flight.update(duration * .5);
    expect(count).toBe(0);
    expect(flight.tip.distanceTo(from.clone().lerp(target, .5))).toBeLessThan(1e-6);
    flight.update(duration);
    expect(flight.tip.equals(target)).toBe(true); expect(count).toBe(1);
    const heading = targetHeading(from, target);
    expect(new Vector3(Math.sin(heading), 0, Math.cos(heading)).dot(offset.clone().normalize())).toBeCloseTo(1);
  }
});

test('Idle feints are tracked before contact; recoil cannot pull an arrived projectile along', () => {
  const from = new Vector3(0, 1, 0), target = new Vector3(-4, 1, 3);
  const hits: number[][] = [];
  const flight = createDirectedFlight(from, .4, to => to.copy(target), at => hits.push(at.toArray()));
  flight.update(.2); target.x -= .12;
  flight.update(.4); const arrival = flight.tip.clone();
  target.set(10, 0, 20); from.set(30, 0, 20);
  flight.update(.9); flight.update(1.5);
  expect(hits).toEqual([[-4.12, 1, 3]]);
  expect(flight.tip.equals(arrival)).toBe(true);
  expect(flight.from.toArray()).toEqual([0, 1, 0]);
});

test('A dropped frame still lands exactly once, while receipt-scale float roundoff cannot swallow contact', () => {
  for (const age of [.3 - Number.EPSILON, 3]) {
    let count = 0;
    const target = new Vector3(5, 1, 4);
    const flight = createDirectedFlight(new Vector3(), .3, to => to.copy(target), () => count++);
    flight.update(age); flight.update(4);
    expect(count).toBe(1); expect(flight.tip.equals(target)).toBe(true);
  }
});

test('Ground branches remain narrow, end on the victim and rotate with the encounter', () => {
  const from = new Vector3(2, .04, 3), target = new Vector3(-4, .04, 7), axis = new Vector3(0, 1, 0), angle = 1.3;
  for (const seed of [0, 1, 5]) for (let step = 0; step <= 20; step++) {
    const t = step / 20, point = sampleGroundBranch(from, target, t, seed);
    const rotated = sampleGroundBranch(from.clone().applyAxisAngle(axis, angle), target.clone().applyAxisAngle(axis, angle), t, seed);
    expect(point.distanceTo(from.clone().lerp(target, t))).toBeLessThanOrEqual(.240001);
    expect(point.clone().applyAxisAngle(axis, angle).distanceTo(rotated)).toBeLessThan(1e-6);
    if (step === 0) expect(point.distanceTo(from)).toBeLessThan(1e-8);
    if (step === 20) expect(point.distanceTo(target)).toBeLessThan(1e-8);
  }
});

test('Arc lance spine preserves exact endpoints and stays taut in arbitrary directions', () => {
  const from = new Vector3(1, 1.4, 3), view = new Vector3(.4, .7, .5).normalize();
  for (const to of [new Vector3(-4, .7, 6), new Vector3(3, 1.1, -5)]) {
    const geometry = arcLanceGeometry(from, to, view, 17), vertices = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    let end = 0; while (uv.getX(end) < 1) end += 2;
    const center = (index: number) => new Vector3().fromBufferAttribute(vertices, index).add(new Vector3().fromBufferAttribute(vertices, index + 1)).multiplyScalar(.5);
    expect(center(0).distanceTo(from)).toBeLessThan(1e-6); expect(center(end).distanceTo(to)).toBeLessThan(1e-6);
    for (let i = 0; i <= end; i += 2) expect(center(i).distanceTo(from.clone().lerp(to, uv.getX(i)))).toBeLessThan(.019);
    for (const attribute of Object.values(geometry.attributes)) expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  }
});

test('Ice wake cannot extend behind the casting hand before the lance has travelled', () => {
  const wake = createIceLanceWake(), from = new Vector3(2, 1.3, 4), direction = new Vector3(-.8, .1, -.5).normalize(), view = new Vector3(.4, .7, .5).normalize();
  for (const travelled of [0, .2, 1, 5]) {
    wake.update(from.clone().addScaledVector(direction, travelled), direction, view, 1, travelled);
    const vertices = wake.mesh.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const along = new Vector3().fromBufferAttribute(vertices, i).sub(from).dot(direction);
      expect(along).toBeGreaterThanOrEqual(-1e-6); expect(along).toBeLessThanOrEqual(travelled + 1e-6);
    }
  }
  wake.mesh.geometry.dispose(); wake.mesh.material.dispose();
});
