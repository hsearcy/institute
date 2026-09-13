import {test,expect} from 'bun:test';
import {equippedForgeReady} from '../src/rpg/forgeReady';
const state = () => ({equippedItemId:'apprentice',equippedLootId:'held',forgeDust:5,loot:[
  {id:'held',itemId:'apprentice',upgradeLevel:0,bonusPower:0},
  {id:'spare',itemId:'cinderwand',upgradeLevel:0,bonusPower:0},
]});
test('The equipped upgrade needs both resources and accepts the exact cost',()=>{
  expect(equippedForgeReady(state(),25)).toBe(true);
  expect(equippedForgeReady(state(),24)).toBe(false);
  expect(equippedForgeReady({...state(),forgeDust:4},25)).toBe(false);
  expect(equippedForgeReady(state())).toBe(false);
});
test('The indicator follows the equipped copy rank rather than an affordable spare',()=>{
  const s=state();s.loot[0].upgradeLevel=2;
  expect(equippedForgeReady(s,100)).toBe(false);
  s.forgeDust=15;
  expect(equippedForgeReady(s,74)).toBe(false);
  expect(equippedForgeReady(s,75)).toBe(true);
  s.loot[0].upgradeLevel=5;
  expect(equippedForgeReady({...s,forgeDust:100},1000)).toBe(false);
});
test('Switching equipment updates readiness; missing or mismatched copies do not qualify',()=>{
  const s=state();s.loot[0].upgradeLevel=5;
  expect(equippedForgeReady(s,25)).toBe(false);
  expect(equippedForgeReady({...s,equippedItemId:'cinderwand',equippedLootId:'spare'},25)).toBe(true);
  expect(equippedForgeReady({...s,equippedLootId:'spare'},25)).toBe(false);
  expect(equippedForgeReady({...s,loot:[]},25)).toBe(false);
});
