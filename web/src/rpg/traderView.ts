// Tobble, the wandering trader at camp. He sells for forge dust, and every
// trade is real subtraction with the child's own balance: the purchase goes
// through when he works out the dust left over. The server checks the answer
// and the balance again before it takes any dust.
import { RPG_ITEMS, RPG_MAX_CHEST_CHARMS, rpgTraderWares, rpgTraderBlocked, rpgTraderQuestion, rpgTraderHint, type RpgState, type RpgTraderWare, type RpgTraderWareId } from '@institute/shared';
import { escapeHtml as esc, relicArt } from './icons';
import { newRequestId } from './requestId';
import './trader.css';

const ART: Record<RpgTraderWareId, string> = {
  'wisdom-potion': '/assets/rpg/trader/wisdom-potion.webp',
  'lucky-charm': '/assets/rpg/trader/lucky-charm.webp',
  'fresh-roll': '',
};

export interface TraderPurchase { wareId: RpgTraderWareId; itemId?: string; seenDust: number; answer: number; requestId: string }

/** The trade being counted. One request ID per trade survives retries. */
export class TraderDesk {
  wareId: RpgTraderWareId | null = null;
  itemId: string | undefined;
  choosingRelic = false;
  entered = '';
  wrongCount = 0;
  hint = '';
  seenDust = 0;
  requestId = '';
  done: { wareId: RpgTraderWareId; dustBefore: number; price: number; itemId?: string } | null = null;

  reset(): void {
    this.wareId = null; this.itemId = undefined; this.choosingRelic = false;
    this.entered = ''; this.wrongCount = 0; this.hint = ''; this.requestId = '';
  }
  /** Start counting a trade with the balance on screen now. */
  begin(state: RpgState, wareId: RpgTraderWareId, itemId?: string): RpgTraderWare | null {
    const ware = rpgTraderWares(state).find(entry => entry.id === wareId);
    if (!ware || rpgTraderBlocked(state, wareId, itemId)) return null;
    this.reset(); this.done = null;
    this.wareId = wareId; this.itemId = itemId; this.seenDust = state.forgeDust ?? 0; this.requestId = newRequestId();
    return ware;
  }
  ware(state: RpgState): RpgTraderWare | undefined { return rpgTraderWares(state).find(entry => entry.id === this.wareId); }
  question(state: RpgState) { const ware = this.ware(state); return ware ? rpgTraderQuestion(this.seenDust, ware) : null; }
  type(digit: string): void { this.entered = digit === '⌫' ? this.entered.slice(0, -1) : (this.entered + digit).slice(0, 4); }
  /** Local first check, so a wrong try gets a hint at once. The server checks again. */
  check(state: RpgState): { correct: boolean; purchase?: TraderPurchase } {
    const question = this.question(state);
    if (!question || !this.entered) return { correct: false };
    if (Number(this.entered) !== question.answer) {
      this.wrongCount++;
      this.hint = rpgTraderHint(this.seenDust, this.ware(state)!.price, this.wrongCount);
      this.entered = '';
      return { correct: false };
    }
    return { correct: true, purchase: { wareId: this.wareId!, itemId: this.itemId, seenDust: this.seenDust, answer: question.answer, requestId: this.requestId } };
  }
}

const wareArt = (ware: RpgTraderWare, itemId?: string): string => ware.id === 'fresh-roll'
  ? `<span class="rpg-trader-ware-art relic">${itemId ? relicArt(itemId) : '<span class="rpg-trader-dice" aria-hidden="true">⟳</span>'}</span>`
  : `<span class="rpg-trader-ware-art" style="background-image:url('${ART[ware.id]}')" aria-hidden="true"></span>`;

const relicName = (itemId?: string) => RPG_ITEMS.find(item => item.id === itemId)?.name ?? '';
const wareLabel = (ware: RpgTraderWare, itemId?: string) => ware.id === 'fresh-roll' && itemId ? `fresh ${relicName(itemId)} roll` : ware.name.toLowerCase();

function renderWares(state: RpgState, desk: TraderDesk): string {
  const dust = state.forgeDust ?? 0;
  return `<div class="rpg-trader-wares">${rpgTraderWares(state).map(ware => {
    const blocked = ware.id === 'fresh-roll' ? (dust < ware.price ? rpgTraderBlocked(state, ware.id) : null) : rpgTraderBlocked(state, ware.id);
    const owned = ware.id === 'lucky-charm' && state.chestCharms ? `<small class="rpg-trader-owned">In your pack: ${state.chestCharms} of ${RPG_MAX_CHEST_CHARMS}</small>` : '';
    return `<article class="rpg-trader-ware ${blocked ? 'locked' : ''}">${wareArt(ware)}<div><h3>${esc(ware.name)}</h3><p>${esc(ware.description)}</p>${owned}</div><footer><b class="rpg-trader-price">✦ ${ware.price}</b><button class="rpg-primary" data-trader="ware" data-ware="${ware.id}" ${blocked ? 'disabled' : ''}>${ware.id === 'fresh-roll' ? 'Choose a relic' : 'Trade'}</button>${blocked ? `<small>${esc(blocked)}</small>` : ''}</footer></article>`;
  }).join('')}</div>${desk.choosingRelic ? renderRelicChoice(state) : ''}`;
}

function renderRelicChoice(state: RpgState): string {
  const relics = state.inventory.filter(id => id !== 'apprentice' && RPG_ITEMS.some(item => item.id === id));
  return `<section class="rpg-trader-relics" aria-label="Choose a relic for a fresh roll"><h3>Which relic should Tobble roll fresh?</h3>${relics.length ? `<div>${relics.map(id => `<button data-trader="relic" data-item="${id}">${relicArt(id)}<span>${esc(relicName(id))}</span></button>`).join('')}</div>` : '<p>Find a relic in the dungeon first. Then Tobble can roll you a fresh copy.</p>'}</section>`;
}

function renderCounting(state: RpgState, desk: TraderDesk): string {
  const ware = desk.ware(state)!, question = desk.question(state)!;
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✓'];
  return `<section class="rpg-trader-count" aria-label="Work out your change">${wareArt(ware, desk.itemId)}<div class="rpg-trader-sum"><p class="rpg-trader-question">${esc(question.text)}</p>
    ${desk.hint ? `<p class="rpg-trader-hint" role="status">${esc(desk.hint)}</p>` : ''}
    <div class="rpg-trader-work"><div class="rpg-trader-ledger" aria-hidden="true"><span><i></i><b>${desk.seenDust}</b><small>✦ you have</small></span><span><i>−</i><b>${ware.price}</b><small>${esc(wareLabel(ware, desk.itemId))}</small></span><span class="total"><i>=</i><b class="${desk.entered ? '' : 'empty'}">${desk.entered || '?'}</b><small>left</small></span></div>
    <div><form class="rpg-trader-form" data-trader-form autocomplete="off"><input id="rpg-trader-answer" aria-label="Forge dust left" inputmode="none" maxlength="4" pattern="[0-9]*" value="${esc(desk.entered)}"><button class="rpg-primary" type="submit" data-trader="pay">Pay ✦ ${ware.price}</button></form>
    <div class="rpg-trader-keys">${keys.map(key => `<button type="button" data-trader="digit" data-key="${key}" aria-label="${key === '⌫' ? 'Delete digit' : key === '✓' ? 'Pay' : key}">${key}</button>`).join('')}</div>
    <div class="rpg-trader-actions"><button data-trader="hear">Hear it again</button><button data-trader="back">Not today</button></div></div></div></div></section>`;
}

function renderDone(state: RpgState, desk: TraderDesk): string {
  const done = desk.done!;
  const ware = rpgTraderWares(state).find(entry => entry.id === done.wareId)!;
  const after = done.dustBefore - done.price;
  const line = done.wareId === 'wisdom-potion' ? 'You drink the wisdom potion. Your magic grows!'
    : done.wareId === 'lucky-charm' ? 'The lucky charm hangs from your pack. Your next chest holds a relic!'
    : `A fresh ${relicName(done.itemId)} roll is in your backpack. Compare it at the Blacksmith.`;
  return `<section class="rpg-trader-done" role="status">${wareArt(ware, done.itemId)}<div><p class="rpg-eyebrow">TRADE COMPLETE</p><h3>${done.dustBefore} − ${done.price} = ${after}</h3><p>${esc(line)}</p><p class="rpg-trader-left">✦ ${after} forge dust left</p><div class="rpg-trader-actions"><button class="rpg-primary" data-trader="again">Keep browsing</button>${done.wareId === 'fresh-roll' ? '<button data-action="forge">Open the Blacksmith</button>' : ''}</div></div></section>`;
}

export function traderGreeting(state: RpgState): string {
  const dust = state.forgeDust ?? 0;
  return dust >= 18 ? `Welcome, friend! You have ${dust} forge dust. Work out your change, and the trade is done.`
    : `Welcome, friend! Bring forge dust from chests and fights, and I will trade you fine things.`;
}

export function renderTrader(state: RpgState, desk: TraderDesk): string {
  const body = desk.done ? renderDone(state, desk) : desk.wareId ? renderCounting(state, desk) : renderWares(state, desk);
  return `<section class="rpg-trader ${desk.wareId ? 'counting' : ''}" aria-label="Wandering trader"><header class="rpg-trader-intro"><span class="rpg-trader-portrait" aria-hidden="true"></span><div><small>WANDERING TRADER</small><h3>Tobble of the Long Road</h3><p class="rpg-trader-says">“${esc(traderGreeting(state))}”</p></div></header>${body}</section>`;
}
