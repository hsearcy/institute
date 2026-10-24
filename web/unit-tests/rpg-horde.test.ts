import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { HordeDirector, type HordeActor, type HordeEvent } from '../src/rpg/world/hordeDirector';

/** Runs the director with actors that walk to their goals, as the world does. */
function simulate(actors: HordeActor[], seconds: number, active: (t: number) => boolean = () => true) {
  const director = new HordeDirector(), hero = { x: 0, z: 0 }, events: (HordeEvent & { t: number })[] = [];
  let maxBusy = 0;
  director.reset(0);
  for (let t = 0; t < seconds; t += 1 / 30) {
    const { goals, events: fired } = director.update(t, actors, hero, active(t));
    fired.forEach(event => events.push({ ...event, t }));
    let busy = 0;
    for (const actor of actors) {
      const goal = goals.get(actor.id)!, dx = goal.x - actor.x, dz = goal.z - actor.z, gap = Math.hypot(dx, dz);
      const step = Math.min(gap, (goal.run ? 3.2 : 1.4) / 30);
      if (gap > 1e-6) { actor.x += dx / gap * step; actor.z += dz / gap * step; }
      if (Math.hypot(actor.x, actor.z) < 2.2) busy++;
    }
    maxBusy = Math.max(maxBusy, busy);
  }
  return { events, maxBusy };
}

const horde = (count: number, canStrike = true): HordeActor[] => Array.from({ length: count }, (_, i) => {
  const angle = -Math.PI / 2 + (i - (count - 1) / 2) * .4, x = Math.cos(angle) * 5, z = Math.sin(angle) * 5;
  return { id: `e${i}`, x, z, originX: x, originZ: z, brute: false, canStrike, phase: i * 1.77 };
});

test('one enemy at a time rushes in, swings at the ward and falls back', () => {
  const { events, maxBusy } = simulate(horde(4), 14);
  const swings = events.filter(event => event.kind === 'swing');
  assert.ok(swings.length >= 3, `${swings.length} swings in 14 s`);
  assert.equal(maxBusy, 1);
  for (const swing of swings) {
    const impact = events.find(event => event.kind === 'impact' && event.id === swing.id && event.t >= swing.t);
    const recoil = events.find(event => event.kind === 'recoil' && event.id === swing.id && event.t >= swing.t);
    assert.ok(impact && recoil && recoil.t > impact.t && impact.t - swing.t < .7);
  }
  // The same enemy never strikes twice in a row.
  for (let i = 1; i < swings.length; i++) assert.notEqual(swings[i]!.id, swings[i - 1]!.id);
});

test('nobody strikes while a spell plays or a panel is open', () => {
  const { events } = simulate(horde(5), 10, t => t > 8);
  assert.equal(events.filter(event => event.t < 8).length, 0);
});

test('enemies without an attack clip only pace', () => {
  const { events, maxBusy } = simulate(horde(3, false), 12);
  assert.equal(events.length, 0); assert.equal(maxBusy, 0);
});

test('the horde follows its anchor when the hero moves on', () => {
  const director = new HordeDirector(), actors = horde(3, false);
  director.reset(0);
  const before = director.update(1, actors, { x: 0, z: 0 }, true).goals.get('e1')!;
  actors.forEach(actor => { actor.originX += 6; });
  const after = director.update(1.1, actors, { x: 6, z: 0 }, true).goals.get('e1')!;
  assert.ok(Math.abs(after.x - before.x - 6) < 1e-9 && after.z === before.z && after.run);
});
