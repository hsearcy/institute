import {expect,test} from 'bun:test';
import * as THREE from 'three';
import {createOrbitLink,playStormSpellBonus} from '../src/rpg/world/stormSpellBonuses';
import type {SpellBonusContext} from '../src/rpg/world/spellBonusTypes';

test('linked orbs follow both moving endpoints with finite geometry',()=>{
 const link=createOrbitLink(new THREE.Vector3(0,1,1).normalize());
 for(const time of [0,.5,1]){
  const from=new THREE.Vector3(time,1,2),to=new THREE.Vector3(4-time,2,-3);
  link.update(from,to,time,1);
  const p=link.mesh.geometry.getAttribute('position');
  for(const v of p.array)expect(Number.isFinite(v)).toBe(true);
  const center=new THREE.Vector3().fromBufferAttribute(p,0).add(new THREE.Vector3().fromBufferAttribute(p,1)).multiplyScalar(.5);
  expect(center.distanceTo(from)).toBeLessThan(.00001);
 }
 link.update(new THREE.Vector3(),new THREE.Vector3(),1,0);expect(link.mesh.visible).toBe(false);
 link.mesh.geometry.dispose();link.mesh.material.dispose();
});
test('storm bonuses stay bounded at ten targets and own independent disposable meshes',()=>{
 for(const shape of ['thunder-web','overcharge','resonance','storm-pillars'] as const){
  const meshes:THREE.Mesh[]=[],updates:Array<(t:number,dt:number)=>void>=[],scheduled:Array<()=>void>=[];
  const ctx:SpellBonusContext={shape,spellId:'storm',origin:new THREE.Vector3(),target:new THREE.Vector3(0,0,-3),targets:Array.from({length:10},(_,i)=>({id:`enemy-${i}`,position:new THREE.Vector3(i%4,0,-2-Math.floor(i/4)),height:2})),view:new THREE.Vector3(0,1,1).normalize(),time:()=>.5,castOrigin:()=>new THREE.Vector3(0,1,0),effect:(mesh,_duration,update)=>{meshes.push(mesh);if(update)updates.push(update);return mesh;},schedule:(_delay,fn)=>scheduled.push(fn),emit:()=>{},debris:()=>{},bolt:()=>{},ring:()=>{},firePillar:()=>{},fireContact:()=>{},meteorImpact:()=>{}};
  playStormSpellBonus(ctx);while(scheduled.length)scheduled.shift()!();
  expect(meshes.length).toBeGreaterThan(0);expect(meshes.length).toBeLessThanOrEqual(20);
  for(const t of [0,.5,1])updates.forEach(update=>update(t,.016));
  expect(new Set(meshes.map(m=>m.geometry)).size).toBe(meshes.length);
  for(const mesh of meshes){for(const v of mesh.geometry.getAttribute('position').array)expect(Number.isFinite(v)).toBe(true);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}
 }
});
