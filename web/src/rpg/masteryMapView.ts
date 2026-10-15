import { chainOf, type Voyage, type VoyageStatus, type VoyageTopic } from './masteryMapModel';
import { escapeHtml as esc } from './icons';

const STATUS_LABEL: Record<VoyageStatus, string> = { mastered: 'Mastered', practicing: 'Practicing', ready: 'Ready to start', locked: 'Locked' };

/** The voyage map panel: a 3D stage (filled by MasteryMapScene) beside the ship's log. */
export function renderVoyagePanel(profile: string, voyage: Voyage | null): string {
  const back = '<footer class="rpg-voyage-footer"><button data-action="parent">Back to the journal</button><button class="rpg-primary" data-action="close">Back to adventure</button></footer>';
  const heading = `<header class="rpg-voyage-heading"><p class="rpg-eyebrow">PARENT JOURNAL · ${esc(profile)}</p><h2 id="rpg-dialog-title">The voyage map</h2></header>`;
  if (!voyage || !voyage.topics.length) {
    return `<div class="rpg-voyage">${heading}<p class="rpg-journal-empty" role="status">${voyage ? 'No math topics are available yet. The map will appear when the learning tree is ready.' : 'Could not load the voyage map. Your saved progress is unchanged. Go back to the journal and try again.'}</p>${back}</div>`;
  }
  const mastered = voyage.topics.filter(t => t.status === 'mastered').length, current = voyage.islands[voyage.frontier];
  const count = (status: VoyageStatus) => voyage.topics.filter(t => t.status === status).length;
  return `<div class="rpg-voyage">${heading}
    <div class="rpg-voyage-body">
      <div class="rpg-voyage-stage" data-voyage-stage><div class="rpg-voyage-labels" aria-hidden="true"></div><p class="rpg-voyage-hint">Drag to turn · scroll or pinch to zoom · click an island to sail there · point at a skill to see its chain</p></div>
      <aside class="rpg-voyage-log" aria-label="Ship's log">
        <section><p class="rpg-eyebrow">SHIP'S LOG</p><h3>${mastered} of ${voyage.topics.length} skills mastered</h3><p class="rpg-voyage-now">The ship is at ${esc(current.name)}, island ${voyage.frontier + 1} of ${voyage.islands.length}.</p>
          <p>Each island is one math domain, in the order he sails them. A path climbs each island from the beach to the summit. The higher a skill, the more groundwork it needs. Arcs join each skill to the skills it builds on. Clouds hide what he has not reached yet.</p></section>
        <section><p class="rpg-eyebrow">THE VOYAGE</p><ol class="rpg-voyage-islands">${voyage.islands.map(island => {
          const n = island.topics.length, pct = (status: VoyageStatus) => `${(island.topics.filter(t => t.status === status).length / n * 100).toFixed(1)}%`;
          return `<li><button data-voyage-island="${island.index}" class="${island.index === voyage.frontier ? 'current' : island.state}"><span class="rpg-voyage-step">${island.index + 1}</span><span>${esc(island.name)}</span><span class="rpg-voyage-count">${island.mastered} / ${n}</span>
            <span class="rpg-voyage-bar" aria-hidden="true"><i class="mastered" style="width:${pct('mastered')}"></i><i class="practicing" style="width:${pct('practicing')}"></i><i class="ready" style="width:${pct('ready')}"></i></span></button></li>`;
        }).join('')}</ol></section>
        <section data-voyage-detail aria-live="polite"><div class="rpg-voyage-card"><p class="rpg-eyebrow">SKILL</p><p>Point at a skill to light its whole chain. Gold shows every skill it builds on. Teal shows every skill it leads to. Click a skill to keep its chain lit, and click the sea to clear it.</p></div></section>
        <section class="rpg-voyage-key" aria-label="Marker key">
          <span><i class="mastered"></i>Beacon · mastered <b>${count('mastered')}</b></span><span><i class="practicing"></i>Crystal · practicing <b>${count('practicing')}</b></span>
          <span><i class="ready"></i>Flag · ready <b>${count('ready')}</b></span><span><i class="locked"></i>Stones · locked <b>${count('locked')}</b></span>
        </section>
      </aside>
    </div>${back}</div>`;
}

export function renderVoyageDetail(topic: VoyageTopic, voyage: Voyage): string {
  const island = voyage.islands[topic.island];
  const builds = voyage.links.filter(link => link.to.id === topic.id).map(link => link.from);
  const opens = voyage.links.filter(link => link.from.id === topic.id).map(link => link.to);
  const names = (list: VoyageTopic[]) => list.map(t => `${esc(t.kidLabel)}${t.island !== topic.island ? ` <small>(${esc(voyage.islands[t.island].name)})</small>` : ''}`).join(' · ');
  return `<div class="rpg-voyage-card"><p class="rpg-eyebrow">${esc(island.name)} · ${esc(island.domain)}</p><h4>${esc(topic.kidLabel)}</h4><p class="rpg-voyage-full">${esc(topic.name)}</p>
    <span class="rpg-journal-status ${topic.status === 'ready' ? 'ready' : topic.status}">${STATUS_LABEL[topic.status]}</span>
    <p>${topic.attempts ? `${topic.correct} of ${topic.attempts} correct` : 'No answers yet'}</p>
    <p><strong>Builds on</strong> ${builds.length ? names(builds) : 'Nothing. A starting skill.'}</p>
    ${opens.length ? `<p><strong>Opens</strong> ${names(opens)}</p>` : ''}
    <p class="rpg-voyage-chain"><span class="below">${chainOf(voyage, topic.id, 'below').size} skills under it</span> · <span class="above">${chainOf(voyage, topic.id, 'above').size} skills after it</span></p>
    ${topic.assessmentPrompt ? `<p class="rpg-journal-prompt"><strong>Ask him</strong> ${esc(topic.assessmentPrompt)}</p>` : ''}</div>`;
}
