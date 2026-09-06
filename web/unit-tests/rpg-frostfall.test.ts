import assert from 'node:assert/strict';
import { test } from 'bun:test';
import * as THREE from 'three';
import { frostfallCrystalGeometry, createFrostfallCrystal, createFrostfallContact } from '../src/rpg/world/frostfall';

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
