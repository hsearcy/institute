import type { DailyRecord } from '@institute/shared';
import { chartBars, encouragement, statTiles, trackingNote } from '../game/dailyStats';
import { escapeHtml as esc } from './icons';

export function renderMathRecords(daily?: DailyRecord): string {
  if (!daily) return '<section class="rpg-records" aria-label="Your Math Records"><h3>Your Math Records</h3><p>Records are unavailable. Open this tab again to retry.</p></section>';
  const bars = chartBars(daily.history, daily.day, daily.recordDay);
  const note = trackingNote(daily.tracking);
  return `<section class="rpg-records" aria-label="Your Math Records">
    <h3>Your Math Records</h3><p class="rpg-records-summary">${esc(encouragement(daily))}</p>
    <h4>Problems right each day (last ${bars.length} days)</h4>
    <div class="rpg-records-chart" role="list" aria-label="Problems right on each of the last ${bars.length} days">
      ${bars.map(bar => `<div class="rpg-records-col${bar.isToday ? ' today' : ''}${bar.isRecord ? ' best' : ''}" role="listitem" aria-label="${esc(bar.label)}" title="${esc(bar.label)}">
        <span class="rpg-records-count">${bar.count || '·'}</span>
        <div class="rpg-records-track"><div class="rpg-records-fill" style="height:${bar.heightPct}%"></div></div>
        <span>${esc(bar.tick)}</span><small>${bar.isRecord ? '★ best' : bar.isToday ? 'today' : ''}</small>
      </div>`).join('')}
    </div>
    <h4>Your numbers</h4><div class="rpg-records-tiles">
      ${statTiles(daily).map(tile => `<article class="rpg-records-tile ${tile.key}"><strong>${esc(tile.value)}</strong><b>${esc(tile.label)}</b><small>${esc(tile.hint)}</small></article>`).join('')}
    </div>${note ? `<p class="rpg-workshop-note">${esc(note)}</p>` : ''}
  </section>`;
}
