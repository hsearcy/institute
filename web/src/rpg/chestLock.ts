import { RPG_CHESTS_PER_EXPEDITION, rpgChestStory, type Problem, type RpgChestReward, type RpgState } from '@institute/shared';

/** The waiting problem told as this chest's story, or null for the plain form.
 * The problem itself (topic, numbers, answer) is unchanged. */
export function chestLockStory(problem: Problem, state: RpgState): { text: string; spoken: string } | null {
  const expedition = state.expedition;
  if (!expedition) return null;
  const paying = (expedition.chestsOpened ?? 0) < RPG_CHESTS_PER_EXPEDITION;
  const story = rpgChestStory(problem, expedition.tier ?? state.dungeonTier ?? 1, paying);
  return story ? { text: story.text, spoken: story.spoken } : null;
}

/** The toast after a chest opens: what he counted, then what the server paid. */
export function chestRewardText(reward: RpgChestReward): string {
  if (!reward.xp) return 'Chest unlocked! It was empty.';
  const paid = `+${reward.xp} XP · +${reward.forgeDust} forge dust`;
  const counted = reward.counted;
  if (reward.charm && reward.item) return `Chest unlocked! Your lucky charm found ${reward.item.name}! ${paid}`;
  if (counted?.treasure === 'dust') return `Chest unlocked! You counted ${counted.amount} forge dust. It is yours! +${reward.xp} XP`;
  if (counted?.treasure === 'gold') return `Chest unlocked! ${counted.amount} gold coins glitter inside. ${paid}`;
  return `Chest unlocked! ${paid}`;
}

/** The same notice for the narrow phone strip. */
export function chestRewardShort(reward: RpgChestReward): string {
  const counted = reward.counted;
  if (!reward.xp || !counted) return 'Chest unlocked';
  return counted.treasure === 'dust' ? `+${counted.amount} forge dust!` : `${counted.amount} gold coins! +${reward.forgeDust} dust`;
}
