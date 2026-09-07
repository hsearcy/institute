/** Story and read-only tour. This module never touches the tutor or a hero save. */
export const RPG_TUTORIAL_VERSION = 1;

export type TutorialPanel = 'spellbook' | 'skills' | 'inventory' | 'merchant' | 'forge' | 'quests' | 'map';
export interface TutorialPage {
  readonly id: string;
  readonly phase: 'story' | 'tour';
  readonly title: string;
  readonly body: string;
  readonly cue: string;
  readonly icon: 'map' | 'sword' | 'shield' | 'help' | 'storm' | 'tree' | 'bag' | 'ring' | 'crown';
  /** A visible existing control to spotlight, not a control to activate. */
  readonly focus?: string;
  /** Optional read-only destination. Opening it must not buy, equip or upgrade. */
  readonly panel?: TutorialPanel;
}

export const RPG_TUTORIAL_PAGES: readonly TutorialPage[] = [
  {
    id: 'story-vault', phase: 'story', title: 'A gate in the dark', icon: 'map',
    body: 'Far below the hills lies the Sunken Vault. Its halls are full of hidden treasure… and monsters guarding the way!',
    cue: 'What could be inside?',
  },
  {
    id: 'story-hero', phase: 'story', title: 'Here comes our hero!', icon: 'shield',
    body: 'That is you, the Wayfarer! With your teal cloak, trusty sword, and clever mind, you are ready for an adventure.',
    cue: 'Your adventure starts here.',
  },
  {
    id: 'story-magic', phase: 'story', title: 'Your mind makes the magic', icon: 'sword',
    body: 'Solve puzzles to swing your sword and cast spells. Find new treasures, grow stronger, and discover what waits beyond the next gate!',
    cue: 'Let’s see how to play.',
  },
  {
    id: 'answer', phase: 'tour', title: 'Solve it. Unleash it!', icon: 'sword',
    body: 'Listen, type your answer, then press Unleash. A correct answer sends your attack into the monsters!',
    cue: 'You do not need to run or aim.', focus: '#rpg-answer-form',
  },
  {
    id: 'help', phase: 'tour', title: 'Help is right here', icon: 'help',
    body: 'Hint gives you a clue. “I don’t know” shows you how to solve it, then gives you another question without attacking.',
    cue: 'The speaker reads the question again.', focus: '.rpg-help-buttons',
  },
  {
    id: 'power', phase: 'tour', title: 'A little extra punch', icon: 'storm',
    body: 'Quick answers hit harder after the voice finishes. Taking longer or trying a wrong answer makes the hit a little weaker, but you can still attack!',
    cue: 'Think first. There is no time limit.', focus: '#rpg-cast',
  },
  {
    id: 'spells', phase: 'tour', title: 'Choose your attack', icon: 'storm', panel: 'spellbook',
    body: 'Heavy Cleave swings your sword. Your spellbook shows fire, ice, and lightning attacks you can learn and choose before answering!',
    cue: 'Your chosen attacks appear on the spell bar.', focus: '.rpg-spell-library',
  },
  {
    id: 'xp', phase: 'tour', title: 'Watch your hero grow!', icon: 'crown',
    body: 'Correct answers fill this XP bar. Fill it up to gain a level and a skill point!',
    cue: 'A new level means more magic to learn.', focus: '.rpg-xp',
  },
  {
    id: 'skills', phase: 'tour', title: 'Grow your magic tree', icon: 'tree', panel: 'skills',
    body: 'Follow a branch to unlock new spells or make your favorites stronger. Tap a rune to see what it does!',
    cue: 'Follow the lines; learn earlier skills first.', focus: '.rpg-rune-graph',
  },
  {
    id: 'learn-skill', phase: 'tour', title: 'Make this magic yours', icon: 'tree', panel: 'skills',
    body: 'This card tells you what a rune does and what you need first. When it is ready, choose Learn or Upgrade to spend one skill point.',
    cue: 'Not ready yet? Make it your next goal.', focus: '.rpg-skill-detail',
  },
  {
    id: 'equipment', phase: 'tour', title: 'Treasure for your hero', icon: 'bag', panel: 'inventory',
    body: 'Dungeon treasure can have extra power or a skill bonus. Open Equipment to choose what to wear and see treasures you can find next!',
    cue: 'Choose Equip to use a treasure.', focus: '#rpg-dialog-content',
  },
  {
    id: 'merchant', phase: 'tour', title: 'Save for something awesome', icon: 'ring', panel: 'merchant',
    body: 'Save your gems to buy a relic you choose. Some treasures need more dungeon wins before the Merchant will sell them.',
    cue: '“Save toward this” pins your treasure goal.', focus: '.rpg-market-card:first-child',
  },
  {
    id: 'forge', phase: 'tour', title: 'Make good treasure stronger', icon: 'sword', panel: 'forge',
    body: 'The Blacksmith uses gems and forge dust to power up your treasure. Find dust in dungeons, or reclaim spare copies you do not need.',
    cue: 'Your equipped treasure and last copy are protected.', focus: '.rpg-forge-list .rpg-loot-card:first-child',
  },
  {
    id: 'quests', phase: 'tour', title: 'Little missions. Big cheers!', icon: 'crown', panel: 'quests',
    body: 'Daily and weekly missions earn gems. Finish today’s whole Quest board for a Crazy Coin!',
    cue: 'More treasure waits after the quests are done.', focus: '.rpg-quest-grid',
  },
  {
    id: 'next-dungeon', phase: 'tour', title: 'What is beyond the next gate?', icon: 'map', panel: 'map',
    body: 'Six rooms lead to the guardian’s treasure, and the map shows your next discovery. Win dungeons to open new places and deeper adventures!',
    cue: 'Pick a treasure to work toward. Let’s explore!', focus: '.rpg-regions',
  },
];

export interface TutorialState {
  readonly index: number;
  readonly finished: boolean;
}

/** Tolerate old or invalid local positions without skipping the whole tour. */
export function startTutorial(index = 0): TutorialState {
  return {
    index: Number.isFinite(index) ? Math.max(0, Math.min(RPG_TUTORIAL_PAGES.length - 1, Math.floor(index))) : 0,
    finished: false,
  };
}

/** Navigation changes only this small client state. Skip and completion are terminal. */
export function advanceTutorial(state: TutorialState, action: 'next' | 'back' | 'skip'): TutorialState {
  if (state.finished) return state;
  const current = startTutorial(state.index);
  if (action === 'skip' || (action === 'next' && current.index === RPG_TUTORIAL_PAGES.length - 1)) {
    return { index: current.index, finished: true };
  }
  return { index: Math.max(0, current.index + (action === 'next' ? 1 : -1)), finished: false };
}
