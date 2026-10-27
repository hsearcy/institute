import { rpgPayingChests, rpgChestStory, rpgShrineStory, type Problem, type RpgChestReward, type RpgState } from '@institute/shared';

/** The waiting problem told as this chest's story, or null for the plain form.
 * The problem itself (topic, numbers, answer) is unchanged. */
export function chestLockStory(problem: Problem, state: RpgState): { text: string; spoken: string } | null {
  const expedition = state.expedition;
  if (!expedition) return null;
  const paying = (expedition.chestsPaid ?? expedition.chestsOpened ?? 0) < rpgPayingChests(expedition);
  const story = rpgChestStory(problem, expedition.tier ?? state.dungeonTier ?? 1, paying);
  return story ? { text: story.text, spoken: story.spoken } : null;
}

/** A shrine tells its waiting problem as candles, runes and sparks. */
export const shrineLockStory = (problem: Problem): { text: string; spoken: string } | null => rpgShrineStory(problem);

/** The short story toast after a chest opens. The rewards themselves fly to
 * the hero as pickups with their own labels, so the toast does not list them. */
export function chestRewardText(reward: RpgChestReward): string {
  const counted = reward.counted;
  // A spent chest's story counted old copper coins: nothing to keep, but it was not a trick.
  if (!reward.xp) return counted ? `Chest unlocked! Just ${counted.amount} old copper coins this time.` : 'Chest unlocked! It was empty.';
  if (reward.charm && reward.item) return `Chest unlocked! Your lucky charm found ${reward.item.name}!`;
  if (counted?.treasure === 'dust') return `Chest unlocked! You counted ${counted.amount} forge dust. It is yours!`;
  if (counted?.treasure === 'gold') return `Chest unlocked! ${counted.amount} gold coins glitter inside.`;
  return 'Chest unlocked!';
}

/** The same notice for the narrow phone strip. */
export function chestRewardShort(reward: RpgChestReward): string {
  const counted = reward.counted;
  if (!reward.xp || !counted) return 'Chest unlocked';
  return counted.treasure === 'dust' ? `+${counted.amount} forge dust!` : `${counted.amount} gold coins! +${reward.forgeDust} dust`;
}
