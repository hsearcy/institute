import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { solvePlanarLeg } from '../src/rpg/world/legSupport';
const rotate = (y:number,z:number,a:number) => [y*Math.cos(a)-z*Math.sin(a), y*Math.sin(a)+z*Math.cos(a)];
test('Supported knee solver reaches both rear and forward planted-foot targets', () => {
  for (const targetZ of [-.25, -.1, 0, .2]) for (const targetY of [-.7,-.65]) {
    const pose=solvePlanarLeg(-.35,.05,-.42,0,targetY,targetZ);
    const upper=rotate(-.35,.05,pose.upper),lower=rotate(-.42,0,pose.upper+pose.lower);
    assert(Math.abs(upper[0]+lower[0]-targetY)<1e-6);
    assert(Math.abs(upper[1]+lower[1]-targetZ)<1e-6);
  }
});
test('Unreachable and degenerate targets remain finite without stretching limbs', () => {
  for (const y of [0,-.01,-100]) for (const z of [0,100]) {
    const pose=solvePlanarLeg(-.35,.05,-.42,0,y,z);
    assert(Number.isFinite(pose.upper)&&Number.isFinite(pose.lower));
  }
  assert.deepEqual(solvePlanarLeg(0,0,-.4,0,0,0),{upper:0,lower:0});
});
