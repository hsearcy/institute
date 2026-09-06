import assert from 'node:assert/strict';
import { test } from 'bun:test';
import * as THREE from 'three';
import { frostfallCrystalGeometry, createFrostfallCrystal, createFrostfallContact, sampleFrostfallFlight } from '../src/rpg/world/frostfall';

test('Frostfall accelerates into the chosen body contact without overshoot', () => {
  const from = new THREE.Vector3(-2, 7, -4), target = new THREE.Vector3(1, 1.2, -3);
  const tip = new THREE.Vector3(), velocity = new THREE.Vector3();
  let previousDistance = Infinity, previousSpeed = 0;
  for (const progress of [0, .2, .5, .8, 1]) {
    sampleFrostfallFlight(from, target, progress, tip, velocity);
    assert(tip.distanceTo(target) <= previousDistance);
    assert(velocity.length() >= previousSpeed);
    assert(velocity.dot(target.clone().sub(from)) > 0);
    previousDistance = tip.distanceTo(target); previousSpeed = velocity.length();
  }
  assert(tip.distanceTo(target) < 1e-8);
  sampleFrostfallFlight(from, target, 1.2, tip, velocity);
  assert(tip.distanceTo(target) < 1e-8, 'A late frame must not carry the projectile through its contact');
});

test('Falling crystal fractures form finite closed outward hulls with a leading point at zero', () => {
  for (const seed of [0, 1, 2, 7, 19]) {
    const geometry = frostfallCrystalGeometry(seed), positions = geometry.getAttribute('position');
    try {
      assert(positions.count / 3 < 60);
      const center = new THREE.Vector3();
      for (let i=0;i<positions.count;i++) center.add(new THREE.Vector3().fromBufferAttribute(positions,i));
      center.divideScalar(positions.count);
      const edges = new Map<string, number>();
      const key = (p: THREE.Vector3) => p.toArray().map(v=>v.toFixed(6)).join(',');
      for (let i=0;i<positions.count;i+=3) {
        const [a,b,c]=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j));
        const normal=b.clone().sub(a).cross(c.clone().sub(a));
        assert(normal.lengthSq()>1e-12); assert(normal.dot(a.clone().sub(center))>0);
        for (const point of [a,b,c]) { assert(point.toArray().every(Number.isFinite)); assert(geometry.boundingBox!.containsPoint(point)); assert(point.y<=1e-8); }
        for (const [start,end] of [[a,b],[b,c],[c,a]]) { const edge=[key(start),key(end)].sort().join('|'); edges.set(edge,(edges.get(edge)??0)+1); }
      }
      assert([...edges.values()].every(count=>count===2), 'Welded fracture hull has no missing or overlapping faces');
      assert.equal(geometry.boundingBox!.max.y,0);
    } finally { geometry.dispose(); }
  }
});

test('Crystal layers share their moving leading tip without a global scene transmission pass', () => {
  const crystal=createFrostfallCrystal();
  try {
    const at=new THREE.Vector3(2,3,-4), velocity=new THREE.Vector3(.1,-1,.2);
    crystal.update(at,velocity,2,.7);at.setScalar(99);
    for(const layer of crystal.layers){
      assert.deepEqual(layer.position,new THREE.Vector3(2,3,-4));
      assert(new THREE.Vector3(0,1,0).applyQuaternion(layer.quaternion).distanceTo(velocity.clone().normalize())<1e-6);
      assert.equal(layer.material.uniforms.opacity.value,.7);
      assert.equal('transmission' in layer.material,false);
    }
    crystal.update(new THREE.Vector3(),new THREE.Vector3(),3);
    assert(crystal.layers.every(layer=>layer.quaternion.toArray().every(Number.isFinite)));
  } finally { for(const layer of crystal.layers){layer.geometry.dispose();layer.material.dispose();} }
});

test('Internal fracture sheets remain inside every randomized exterior', () => {
  for (const seed of [0, 1, 2, 7, 19]) {
    const crystal = createFrostfallCrystal(seed);
    try {
      const inner = crystal.layers[0].geometry.getAttribute('position');
      const hull = crystal.layers[1].geometry.getAttribute('position');
      const normals = crystal.layers[1].geometry.getAttribute('normal');
      const p = new THREE.Vector3(), normal = new THREE.Vector3(), anchor = new THREE.Vector3();
      for (let i = 0; i < inner.count; i++) for (let face = 0; face < hull.count; face += 3) {
        p.fromBufferAttribute(inner, i); normal.fromBufferAttribute(normals, face); anchor.fromBufferAttribute(hull, face);
        assert(normal.dot(p.sub(anchor)) < 1e-6, 'Internal ice planes must not stick through the broken outer surface');
      }
    } finally { for (const layer of crystal.layers) { layer.geometry.dispose(); layer.material.dispose(); } }
  }
});

test('The inset fracture remains one finite broad plane across shard scales', () => {
  for (const seed of [0, 1, 2, 7, 19]) for (const scale of [.13, 1, 1.15]) {
    const crystal = createFrostfallCrystal(seed, scale);
    try {
      const positions = crystal.layers[0].geometry.getAttribute('position');
      const a = new THREE.Vector3().fromBufferAttribute(positions, 0);
      const b = new THREE.Vector3().fromBufferAttribute(positions, 1);
      const c = new THREE.Vector3().fromBufferAttribute(positions, 2);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      let area = 0;
      for (let i = 0; i < positions.count; i += 3) {
        const points = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, i + offset));
        const triangleArea = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).length() * .5;
        assert(triangleArea > 1e-10 * scale * scale, 'No collapsed needle triangles');
        area += triangleArea;
        for (const point of points) {
          assert(point.toArray().every(Number.isFinite));
          assert(Math.abs(normal.dot(point.clone().sub(a))) < 1e-6 * scale, 'Fracture has no folded/clamped quad');
        }
      }
      assert(area > .02 * scale * scale, 'The fracture remains a surface rather than a thin strand');
    } finally { for (const layer of crystal.layers) { layer.geometry.dispose(); layer.material.dispose(); } }
  }
});

test('Impact splinters stay above their floor and the complete study fades on schedule', () => {
  const contact=createFrostfallContact(), origin=new THREE.Vector3(2,0,-5);
  try {
    for(const age of [0,.1,.3,.55,.9]){
      contact.update(origin,age,4+age);
      for(const layer of contact.layers){
        layer.updateMatrixWorld(true);
        const vertices=layer.geometry.getAttribute('position');
        for(let i=0;i<vertices.count;i++){
          const point=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(layer.matrixWorld);
          assert(point.toArray().every(Number.isFinite)); assert(point.y>=-1e-6,'No splinter underside penetrates the supporting floor');
        }
        if(age===.9)assert.equal(layer.material.uniforms.opacity.value,0);
      }
    }
  } finally { for(const layer of contact.layers){layer.geometry.dispose();layer.material.dispose();} }
});

test('A chest-height impact leaves its vapor on the floor while splinters begin at the body', () => {
  const contact = createFrostfallContact(), origin = new THREE.Vector3(2, 1.4, -5);
  try {
    contact.update(origin, 0, 4, .3);
    assert.equal(contact.layers.at(-1)!.position.y, .345, 'The vapor bed must not become a horizontal plate through the chest');
    assert(contact.layers.slice(0, -1).every(layer => layer.position.y >= origin.y));
    for (const age of [.1, .3, .55, .9]) {
      contact.update(origin, age, 4 + age, .3);
      for (const layer of contact.layers) {
        layer.updateMatrixWorld(true);
        const vertices = layer.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(layer.matrixWorld);
          assert(point.y >= .3 - 1e-6, 'Body-height splinters must respect the same supporting floor');
        }
      }
    }
  } finally { for (const layer of contact.layers) { layer.geometry.dispose(); layer.material.dispose(); } }
});
