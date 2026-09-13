import type { State } from '@institute/shared';
import type { Mastery, MasteryTopic } from '../game/tutor';
import { escapeHtml as esc, icon } from './icons';

/** Stable learning order within a domain; cross-domain prerequisites remain named on cards. */
export function orderJournalTopics(topics: readonly MasteryTopic[]): MasteryTopic[] {
  const inDomain = new Set(topics.map(topic => topic.id));
  const placed = new Set<string>(), remaining = [...topics], ordered: MasteryTopic[] = [];
  while (remaining.length) {
    const index = remaining.findIndex(topic => topic.prereqs.every(id => !inDomain.has(id) || placed.has(id)));
    const topic = remaining.splice(Math.max(0, index), 1)[0];
    ordered.push(topic); placed.add(topic.id);
  }
  return ordered;
}

function topicStatus(topic: MasteryTopic) {
  if (!topic.unlocked) return { key: 'locked', label: 'Locked' };
  if (topic.state === 'mastered') return { key: 'mastered', label: 'Mastered' };
  if (topic.state === 'practicing') return { key: 'practicing', label: 'Practicing' };
  return { key: 'ready', label: 'Ready' };
}

function renderTopic(topic: MasteryTopic, step: number, byId: Map<string, MasteryTopic>): string {
  const status = topicStatus(topic);
  const requirements = topic.prereqs.map(id => byId.get(id)?.kidLabel ?? id);
  return `<li class="rpg-journal-topic ${status.key}" data-topic="${esc(topic.id)}">
    <span class="rpg-journal-node" aria-hidden="true">${status.key === 'mastered' ? '✓' : status.key === 'locked' ? icon('lock') : step}</span>
    <article class="rpg-journal-topic-card">
      <div class="rpg-journal-topic-heading"><h4>${esc(topic.kidLabel)}</h4><span class="rpg-journal-status ${status.key}">${status.label}</span></div>
      <p class="rpg-journal-topic-name">${esc(topic.name)}</p>
      <div class="rpg-journal-tags">${topic.attempts ? `<span>${topic.correct} / ${topic.attempts} correct</span>` : '<span>No answers yet</span>'}${topic.skips ? `<span>Asked for help ${topic.skips}×</span>` : ''}${topic.fluentMs !== null ? `<span>Speed goal: under ${Math.round(topic.fluentMs / 100) / 10}s</span>` : ''}</div>
      <p class="rpg-journal-prompt"><strong>Ask him</strong> ${esc(topic.assessmentPrompt)}</p>
      <p class="rpg-journal-prereqs">${requirements.length ? `<strong>Builds on</strong> ${requirements.map(esc).join(' · ')}` : 'Starting skill · no prerequisites'}</p>
    </article>
  </li>`;
}

export function renderParentJournal(profile: string, mastery: Mastery | null, legacy: State | null, expeditions: number): string {
  const topics = mastery?.topics ?? [];
  const domains = new Map<string, MasteryTopic[]>(), byId = new Map(topics.map(topic => [topic.id, topic]));
  for (const topic of topics) {
    if (!domains.has(topic.domain)) domains.set(topic.domain, []);
    domains.get(topic.domain)!.push(topic);
  }
  const counts = { mastered: 0, practicing: 0, ready: 0, locked: 0 };
  for (const topic of topics) counts[topicStatus(topic).key as keyof typeof counts]++;
  return `<div class="rpg-parent-journal">
    <header class="rpg-journal-heading"><p class="rpg-eyebrow">PARENT JOURNAL · ${esc(profile)}</p><h2 id="rpg-dialog-title">The learning journey</h2><p>See what he knows, what he is practicing, and what comes next. Math progress is shared with the original mine.</p></header>
    <div class="rpg-journal-stats"><span><b>${mastery ? counts.mastered : '…'}</b>topics mastered</span><span><b>${legacy?.gems ?? '…'}</b>gems kept</span><span><b data-parent-balance="coin">${mastery?.crazyCoins ?? '…'}</b>Crazy Coins</span><span><b data-parent-balance="dime">${mastery ? mastery.dimes ?? 0 : '…'}</b>dimes to pay</span><span><b>${expeditions}</b>expeditions cleared</span></div>
    <details class="rpg-journal-rewards"><summary>Daily quests & rewards</summary><div class="rpg-quest-list">${legacy ? legacy.quests.map(quest => `<p><span>${esc(quest.label)}</span><b>${quest.progress} / ${quest.target} ${quest.done ? '✓' : ''}</b></p>`).join('') || '<p>No daily quests available yet.</p>' : '<p>Could not load daily quests.</p>'}</div><button data-action="redeem" ${(mastery?.crazyCoins ?? 0) < 1 ? 'disabled' : ''}>Redeem one Crazy Coin</button><button data-action="redeem-dime" ${(mastery?.dimes ?? 0) < 1 ? 'disabled' : ''}>Redeem one dime · $0.10</button><p>Each boss has a separate 10% chance to award a Crazy Coin and a dime. Redeem a dime when you pay it.</p><p data-parent-redemption-status role="status" aria-live="polite"></p></details>
    <section class="rpg-learning-map" aria-label="Math learning map">
      <div class="rpg-journal-map-heading"><div><p class="rpg-eyebrow">MATH MASTERY</p><h3>A path through each skill</h3></div>${mastery && topics.length ? `<span>${topics.length} topics · ${domains.size} domains</span>` : ''}</div>
      ${mastery && topics.length ? `<div class="rpg-journal-legend" aria-label="Topic status totals">${(['mastered', 'practicing', 'ready', 'locked'] as const).map(key => `<span class="rpg-journal-status ${key}"><b>${counts[key]}</b> ${key[0].toUpperCase() + key.slice(1)}</span>`).join('')}</div>
      <nav class="rpg-journal-domains" aria-label="Jump to a math domain">${[...domains].map(([domain, entries], index) => `<a href="#rpg-journal-domain-${index}">${esc(domain)}<span>${entries.filter(topic => topic.state === 'mastered').length} / ${entries.length}</span></a>`).join('')}</nav>
      <p class="rpg-journal-guide">Follow each path from top to bottom. “Builds on” names the skills needed first.</p>
      ${[...domains].map(([domain, entries], index) => {
        const ordered = orderJournalTopics(entries), mastered = entries.filter(topic => topic.state === 'mastered').length;
        return `<section class="rpg-journal-domain" id="rpg-journal-domain-${index}" tabindex="-1" aria-labelledby="rpg-journal-domain-title-${index}"><header><div><span class="rpg-journal-domain-number">${String(index + 1).padStart(2, '0')}</span><h3 id="rpg-journal-domain-title-${index}">${esc(domain)}</h3></div><span>${mastered} of ${entries.length} mastered</span></header><progress value="${mastered}" max="${entries.length}" aria-label="${esc(domain)} mastery"></progress><ol class="rpg-journal-chain">${ordered.map((topic, step) => renderTopic(topic, step + 1, byId)).join('')}</ol></section>`;
      }).join('')}` : `<p class="rpg-journal-empty" role="status">${mastery ? 'No math topics are available yet. They will appear here when the learning tree is ready.' : 'Could not load the learning map. Your saved progress is unchanged. Close the journal and try again.'}</p>`}
    </section>
    <footer class="rpg-button-row"><button class="rpg-primary" data-action="close">Back to adventure</button><a class="rpg-text-button" href="?mode=mine">Original mine, shops & detailed statistics</a></footer>
  </div>`;
}
