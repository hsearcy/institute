import { expect, test } from 'bun:test';
import { rpgRollBossBonus, rpgLootSpellShape, rpgLootCombatAffix, rpgCreateLoot, rpgNormalizeLoot } from './rpgLoot';
import { rpgSpellAvailable, rpgSpellCombatStats, rpgApplyCombat, type RpgState } from './rpg';

const equipped = (extra = {}): RpgState => rpgNormalizeLoot({profileId:'boss-test', xp:0,level:1,xpIntoLevel:0,xpForNextLevel:100,skillPoints:0,skills:{},inventory:['thunderrod'],equippedItemId:'thunderrod',equippedLootId:'held',selectedSpellId:'ball_lightning',appearanceId:'wayfarer',totalKills:0,expeditionsCompleted:0,expedition:null,loot:[{id:'held',itemId:'thunderrod',bonusPower:0,upgradeLevel:0,...extra}]});

test('ordinary drops no longer roll spell ranks or named spell bonuses', () => {
  for (let value=0; value<1; value+=.01) {
    const loot=rpgCreateLoot('thunderrod',10,()=>value);
    expect(loot.bonusSkillId).toBeUndefined();
    expect(loot.bonusSpellId).toBeUndefined();
    expect(loot.spellShape).toBeUndefined();
  }
});
test('boss drops have a stronger power floor and a school-matched spell shape', () => {
  const loot=rpgCreateLoot('thunderrod',1,()=>0,true);
  expect(loot.bonusPower).toBeGreaterThanOrEqual(4);
  expect(loot.spellShape).toBe('twin-orb');
});
test('an extra orb adds 30% damage only to Ball Lightning on its equipped copy', () => {
  const base=equipped(), enhanced=equipped({spellShape:'twin-orb'});
  expect(rpgSpellCombatStats(enhanced).damage).toBe(Math.round(rpgSpellCombatStats(base).damage*1.3));
  expect(rpgSpellCombatStats(enhanced,'storm')).toEqual(rpgSpellCombatStats(base,'storm'));
  enhanced.equippedLootId='missing';
  expect(rpgSpellCombatStats(enhanced)).toEqual(rpgSpellCombatStats({...base,equippedLootId:'missing'}));
});
test('opening strike applies only to the first cast; boss slayer applies only to the boss', () => {
  const normal=equipped(), opening=equipped({combatAffix:'opening-strike'}), slayer=equipped({combatAffix:'boss-slayer'});
  const combat={version:1 as const,encounterIndex:5,casts:0,enemies:[{id:'enemy-0',hp:1000,maxHp:1000},{id:'enemy-1',hp:1000,maxHp:1000}]};
  const base=rpgApplyCombat(normal,combat).result.hits[0].damage;
  expect(rpgApplyCombat(opening,combat).result.hits[0].damage).toBe(Math.round(base*1.25));
  expect(rpgApplyCombat(opening,{...combat,casts:1}).result.hits[0].damage).toBe(base);
  const hits=rpgApplyCombat(slayer,combat).result.hits;
  expect(hits[0].damage).toBe(Math.round(base*1.3));
  expect(hits[1].damage).toBe(base);
});


test('coin and dime rolls are independent and each has an exact 1% boundary', () => {
  for (const [coin,dime] of [[0,0],[.009999,.01],[.01,.009999],[.01,.01]]) {
    const rolls=[coin,dime];
    expect(rpgRollBossBonus(()=>rolls.shift()!)).toEqual({bossCrazyCoins:coin<.01?1:0,bossDimes:dime<.01?1:0});
  }
  for (const invalid of [NaN, Infinity, -1]) expect(rpgRollBossBonus(()=>invalid)).toEqual({bossCrazyCoins:0,bossDimes:0});
});
test('invalid traits and cross-school shapes have no combat effect and do not change saved loot', () => {
  const base=equipped(), changed=equipped({spellShape:'meteor-shower',combatAffix:'made-up'});
  const snapshot=JSON.stringify(changed);
  expect(rpgLootSpellShape(changed.loot![0])).toBeUndefined();
  expect(rpgLootCombatAffix(changed.loot![0])).toBeUndefined();
  expect(rpgSpellCombatStats(changed)).toEqual(rpgSpellCombatStats(base));
  expect(JSON.stringify(changed)).toBe(snapshot);
});


test('a spell-shape item lends its spell only while that copy is equipped', () => {
  const state=equipped({spellShape:'twin-orb'});
  expect(rpgSpellAvailable(state,'ball_lightning')).toBe(true);
  expect(state.skills).toEqual({});
  state.equippedLootId='missing';
  expect(rpgSpellAvailable(state,'ball_lightning')).toBe(false);
  state.skills.ball_lightning=1;
  expect(rpgSpellAvailable(state,'ball_lightning')).toBe(true);
});

test('all fifteen spells have a unique boss effect with the stated damage or coverage bonus', async () => {
  const {RPG_SPELLS,RPG_SPELL_SHAPES,rpgLootSpellShape}=await import('./index');
  expect(RPG_SPELL_SHAPES).toHaveLength(15);
  expect(new Set(RPG_SPELL_SHAPES.map(shape=>shape.spellId)).size).toBe(15);
  for(const shape of RPG_SPELL_SHAPES){
    const base=equipped();base.equippedItemId='moonstaff';base.loot![0].itemId='moonstaff';
    const before=rpgSpellCombatStats(base,shape.spellId);
    base.loot![0].spellShape=shape.id;
    expect(rpgLootSpellShape(base.loot![0])?.school).toBe(RPG_SPELLS.find(spell=>spell.id===shape.spellId)!.school);
    expect(rpgSpellCombatStats(base,shape.spellId)).toEqual({damage:Math.round(before.damage*shape.damageMultiplier),targets:Math.min(10,before.targets+shape.extraTargets)});
    expect(rpgSpellAvailable(base,shape.spellId)).toBe(true);
    for(const other of RPG_SPELLS.filter(spell=>spell.id!==shape.spellId)){
      expect(rpgSpellCombatStats(base,other.id)).toEqual(rpgSpellCombatStats({...base,loot:[{...base.loot![0],spellShape:undefined}]},other.id));
    }
    base.equippedLootId='not-equipped';
    expect(rpgSpellCombatStats(base,shape.spellId)).toEqual(rpgSpellCombatStats({...base,loot:[]},shape.spellId));
  }
});

test('boss bonus chance follows the played tier and independent exact boundaries', () => {
  for (const [tier,chance] of [[1,.01],[2,.02],[10,.10],[11,.103],[20,.13],[59,.247],[60,.25],[61,.25],[100,.25]]) {
    const rolls=[chance-.000001,chance];
    expect(rpgRollBossBonus(()=>rolls.shift()!,tier)).toEqual({bossCrazyCoins:1,bossDimes:0});
  }
});
