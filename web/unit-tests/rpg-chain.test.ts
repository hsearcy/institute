import { expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { CHAIN_CONTACT_SPAN, CHAIN_FIRST_CONTACT, chainLightningGeometry, createChainCharge, createChainSequence } from '../src/rpg/world/chain';

test('The first chain link samples the rendered hand and target at the original contact cue', () => {
  const hand = new Vector3(1, 1, 2), position = new Vector3(4, 0, -3);
  const arrivals: { from: number[]; to: number[] }[] = [], hits: number[] = [];
  const chain = createChainSequence([{ position, height: 2, contact: () => hits.push(1) }], (from, to) => arrivals.push({ from: from.toArray(), to: to.toArray() }));
  chain.update(hand, CHAIN_FIRST_CONTACT - .001); expect(arrivals).toHaveLength(0);
  hand.set(2, 1.7, 3); position.x = 4.3;
  chain.update(hand, CHAIN_FIRST_CONTACT);
  expect(arrivals).toEqual([{ from: [2, 1.7, 3], to: [4.3, 1.12, -3] }]);
  expect(hits).toEqual([1]);
});

test('The next recoil and link start at the previous actual arrival, preserving supplied target order', () => {
  const hand = new Vector3(0, 1, 0), first = new Vector3(8, 0, 2), second = new Vector3(-2, 0, 4);
  const hits: { index: number; from: number[] }[] = [], links: number[][][] = [];
  const chain = createChainSequence([first, second].map((position, index) => ({ position, height: 2, contact: from => hits.push({ index, from: from.toArray() }) })), (from, to) => links.push([from.toArray(), to.toArray()]));
  chain.update(hand, CHAIN_FIRST_CONTACT);
  first.set(30, 0, 30); hand.set(-20, 0, -20);
  chain.update(hand, CHAIN_FIRST_CONTACT + CHAIN_CONTACT_SPAN / 2 - .001);
  expect(links).toHaveLength(1);
  chain.update(hand, CHAIN_FIRST_CONTACT + CHAIN_CONTACT_SPAN / 2);
  expect(hits).toEqual([{ index: 0, from: [0, 1, 0] }, { index: 1, from: [8, 1.12, 2] }]);
  expect(links[1]).toEqual([[8, 1.12, 2], [-2, 1.12, 4]]);
});

test('A delayed frame and cosmetic echo never duplicate authoritative contacts', () => {
  const hits: number[] = [], emitted: { index: number; echo: boolean }[] = [];
  const targets = Array.from({ length: 10 }, (_, index) => ({ position: new Vector3(index, 0, -index), height: 1.7, contact: () => hits.push(index) }));
  const chain = createChainSequence(targets, (_from, _to, index, echo) => emitted.push({ index, echo }), true);
  chain.update(new Vector3(0, 1, 0), .81);
  expect(emitted.at(-1)).toEqual({ index: 0, echo: true });
  expect(hits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  chain.update(new Vector3(0, 1, 0), 1.4);
  chain.update(new Vector3(0, 1, 0), 2);
  chain.finish(new Vector3());
  expect(hits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(emitted.filter(link => link.echo)).toHaveLength(10);
  expect(emitted.filter(link => !link.echo)).toHaveLength(10);
});

test('Resuming after visual expiry reconciles remaining results without stale echo effects', () => {
  const hits: number[] = [], sources: number[][] = [], emitted: number[] = [];
  const targets = [new Vector3(1, 0, -1), new Vector3(2, 0, -2)].map((position, index) => ({ position, height: 2, contact: (from: Vector3) => { hits.push(index); sources.push(from.toArray()); } }));
  const chain = createChainSequence(targets, (_from, _to, index) => emitted.push(index), true);
  chain.update(new Vector3(0, 1, 0), .36);
  chain.finish(new Vector3(9, 2, 9)); chain.finish(new Vector3()); chain.update(new Vector3(), 10);
  expect(hits).toEqual([0, 1]); expect(emitted).toEqual([0]);
  expect(sources[1]).toEqual([1, 1.12, -1]);
});

test('An empty authoritative pack creates no links or contacts', () => {
  let links = 0;
  const chain = createChainSequence([], () => links++, true);
  chain.update(new Vector3(), 1); chain.finish(new Vector3());
  expect(links).toBe(0);
});

test('Discharge ribbon centers preserve both exact endpoints and all generated attributes stay finite', () => {
  const from = new Vector3(-2, 1.7, 3), to = new Vector3(4, .95, -2);
  for (const seed of [1, 17, 92, 334]) {
    const geometry = chainLightningGeometry(from, to, new Vector3(.4, .6, .7).normalize(), seed);
    const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    const center = (index: number) => new Vector3().fromBufferAttribute(position, index).add(new Vector3().fromBufferAttribute(position, index + 1)).multiplyScalar(.5);
    expect(center(0).distanceTo(from)).toBeLessThan(1e-6);
    let end = 0; while (uv.getX(end) < 1) end += 2;
    expect(center(end).distanceTo(to)).toBeLessThan(1e-6);
    for (const attribute of Object.values(geometry.attributes)) expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    expect(geometry.getAttribute('strength').count).toBe(position.count);
    expect(geometry.getAttribute('normal')).toBeUndefined();
    geometry.dispose();
  }
});

test('The hand buildup stays small and uses the same complete attributes as its warmed material', () => {
  const charge = createChainCharge(), geometry = charge.geometry;
  geometry.computeBoundingBox(); const size = geometry.boundingBox!.getSize(new Vector3());
  expect(Math.max(size.x, size.y, size.z)).toBeLessThan(.4);
  for (const name of ['uv', 'strength']) expect(geometry.getAttribute(name).count).toBe(geometry.getAttribute('position').count);
  expect(geometry.getAttribute('normal')).toBeUndefined();
  geometry.dispose(); charge.material.dispose();
});
