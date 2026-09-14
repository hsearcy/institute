/** Deterministic combat check: hold spells/skills fixed and compare only item power. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {RPG_SKILLS,RPG_SPELLS,rpgNormalizeLoot,rpgCreateLoot,rpgEncounterCombat,rpgApplyCombat,rpgSpellCombatStats,type RpgState,type RpgSpellId} from '../shared/src/index';
const profiles=[{name:'developing',skills:{ember_power:1},spells:['cleave'] as RpgSpellId[],item:'cinderwand'},
 {name:'mastered',skills:Object.fromEntries(RPG_SKILLS.map(s=>[s.id,s.maxRank])),spells:RPG_SPELLS.map(s=>s.id),item:'moonstaff'}];
const rows=[];
for(const profile of profiles)for(const spellId of profile.spells)for(let tier=2;tier<100;tier++){
 const state=rpgNormalizeLoot({profileId:'balance',xp:0,level:60,xpIntoLevel:0,xpForNextLevel:100,skillPoints:0,skills:profile.skills,
  inventory:[profile.item],equippedItemId:profile.item,selectedSpellId:spellId,appearanceId:'wayfarer',totalKills:0,expeditionsCompleted:0,expedition:null} as RpgState);
 const fight=(atTier:number,lootTier:number,roll:number)=>{
  const power=rpgCreateLoot(profile.item,lootTier,()=>roll,true).bonusPower;
  state.loot![0].bonusPower=power;
  state.expedition={id:'balance',regionId:'embercrypt',tier:atTier,encounterIndex:5,encountersTotal:6,cleared:false,startedAt:0};
  let combat=rpgEncounterCombat(state),casts=0;
  while(combat.enemies.some(enemy=>enemy.hp>0)){
   combat=rpgApplyCombat(state,combat,spellId).combat;
   if(++casts>200)throw Error('Combat did not finish');
  }
  return {power,damage:rpgSpellCombatStats(state).damage,casts};
 };
 rows.push({profile:profile.name,spellId,tier,before:fight(tier,tier-1,.5),ordinary:fight(tier+1,tier,.5),strong:fight(tier+1,tier,.999)});
}
const summary={comparisons:rows.length,ordinaryHarderOrSame:rows.filter(r=>r.ordinary.casts>=r.before.casts).length,
 strongEasier:rows.filter(r=>r.strong.casts<r.before.casts).length,examples:rows.filter(r=>r.tier>=10&&r.strong.casts<r.before.casts).filter((_,i)=>i%100===0).slice(0,8)};
if(summary.ordinaryHarderOrSame<rows.length*.95||summary.strongEasier===0)throw Error('Tier balance does not meet the progression target');
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/tier-balance.json',JSON.stringify({summary,rows},null,2));
console.log(JSON.stringify(summary,null,2));
