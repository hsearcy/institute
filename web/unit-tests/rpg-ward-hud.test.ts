import { expect, test } from 'bun:test';
import { wardColor } from '../src/rpg/wardHud';

test('the ward runs from blue to pale gold and never turns red', () => {
  const rgb = (fraction: number) => wardColor(fraction).match(/\d+/g)!.map(Number);
  expect(rgb(1)).toEqual([0x6f, 0xd2, 0xff]);
  expect(rgb(0)).toEqual([0xf2, 0xdc, 0xa6]);
  for (let f = 0; f <= 1; f += .05) {
    const [r, g, b] = rgb(f);
    // Green always stays high: never a red or orange warning colour.
    expect(g).toBeGreaterThanOrEqual(0xd2);
    expect(r - g).toBeLessThan(30);
    expect(b).toBeGreaterThan(0xa0);
  }
});
