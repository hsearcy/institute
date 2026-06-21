// DOM overlay HUD: the problem, the answer being built, the gem number-pad, the
// MINE (pickaxe) button, and the collection counter. DOM (not canvas) so text is
// crisp and the pad is touch-friendly on mobile. The UI phase will restyle this;
// it ships intentional, readable, kid-sized controls from the start.

type Handlers = {
  onDigit: (d: number) => void;
  onBackspace: () => void;
  onMine: () => void;
  onReplay: () => void;
};

const GEM_COLORS = ['#ff6b8a', '#ffa94d', '#ffd43b', '#69db7c', '#3bc9db', '#4dabf7', '#748ffc', '#b197fc', '#f783ac', '#ff8787'];

export class Hud {
  private root: HTMLDivElement;
  private problemEl!: HTMLDivElement;
  private answerEl!: HTMLDivElement;
  private collectionEl!: HTMLSpanElement;
  private hoardEl!: HTMLDivElement;

  constructor(h: Handlers) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hoard" id="hoard" aria-label="Your gem collection"></div>
        <div class="collection">💎 <span id="collection-count">0</span></div>
      </div>
      <div class="problem-wrap">
        <button class="replay" title="Hear it again">🔊</button>
        <div class="problem" id="problem">…</div>
      </div>
      <div class="hud-bottom">
        <div class="answer" id="answer"></div>
        <div class="pad" id="pad"></div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.problemEl = this.root.querySelector('#problem')!;
    this.answerEl = this.root.querySelector('#answer')!;
    this.collectionEl = this.root.querySelector('#collection-count')!;
    this.hoardEl = this.root.querySelector('#hoard')!;

    const pad = this.root.querySelector('#pad')!;
    const layout = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'back', 0, 'mine'] as const;
    for (const k of layout) {
      const b = document.createElement('button');
      if (k === 'back') {
        b.className = 'key key-back';
        b.textContent = '⌫';
        b.onclick = () => h.onBackspace();
      } else if (k === 'mine') {
        b.className = 'key key-mine';
        b.textContent = 'MINE ⛏️';
        b.onclick = () => h.onMine();
      } else {
        b.className = 'key key-gem';
        b.textContent = String(k);
        b.style.setProperty('--gem', GEM_COLORS[k as number]);
        b.onclick = () => h.onDigit(k as number);
      }
      pad.appendChild(b);
    }
    this.root.querySelector('.replay')!.addEventListener('click', () => h.onReplay());
  }

  setProblem(text: string): void {
    this.problemEl.textContent = text;
  }
  setAnswer(text: string): void {
    this.answerEl.textContent = text;
    this.answerEl.classList.remove('wrong');
  }
  flashWrong(): void {
    this.answerEl.classList.add('wrong');
  }
  setCollection(n: number): void {
    this.collectionEl.textContent = String(n);
  }
  /** Tick the counter up with a satisfying pop as a mined gem lands in it. */
  bumpCollection(n: number): void {
    this.collectionEl.textContent = String(n);
    const chip = this.collectionEl.parentElement!;
    chip.classList.remove('pop');
    void chip.offsetWidth; // restart the animation
    chip.classList.add('pop');
  }

  /** Add a mined gem (in its real color) to the visibly-filling hoard wall. */
  addGem(colorHex: number, n: number): void {
    const pip = document.createElement('span');
    pip.className = 'gem-pip';
    pip.style.setProperty('--gem', '#' + (colorHex & 0xffffff).toString(16).padStart(6, '0'));
    this.hoardEl.appendChild(pip);
    while (this.hoardEl.children.length > 60) this.hoardEl.removeChild(this.hoardEl.firstChild!);
    requestAnimationFrame(() => pip.classList.add('in'));
    this.bumpCollection(n);
  }
}

function injectStyles(): void {
  if (document.getElementById('hud-styles')) return;
  const s = document.createElement('style');
  s.id = 'hud-styles';
  s.textContent = `
  .hud { position: fixed; inset: 0; pointer-events: none; display: flex; flex-direction: column;
    font-family: 'Baloo 2', system-ui, sans-serif; -webkit-user-select: none; user-select: none; }
  .hud-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 12px 14px; }
  .collection { pointer-events: auto; flex: none; align-self: flex-start; background: rgba(20,16,40,0.55); color: #ffe9a8;
    font-weight: 800; font-size: 22px; padding: 8px 16px; border-radius: 999px; backdrop-filter: blur(6px);
    transition: transform .1s; }
  .collection.pop { animation: pop 0.45s cubic-bezier(.3,1.6,.5,1); }
  @keyframes pop { 0%{transform:scale(1)} 35%{transform:scale(1.45); color:#fff} 100%{transform:scale(1)} }
  /* The growing, ownable hoard — fills with the actual gems he mines, by color. */
  .hoard { pointer-events: none; flex: 1; display: flex; flex-wrap: wrap; gap: 5px; align-content: flex-start;
    max-height: 78px; overflow: hidden; padding: 7px 9px; border-radius: 14px;
    background: rgba(20,16,40,0.34); backdrop-filter: blur(5px); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
  .hoard:empty { display: none; }
  .gem-pip { width: 16px; height: 16px; border-radius: 4px 4px 5px 5px; transform: scale(0) rotate(45deg);
    transition: transform .35s cubic-bezier(.3,1.7,.5,1);
    background: radial-gradient(80% 60% at 30% 22%, rgba(255,255,255,0.9), rgba(255,255,255,0) 50%),
      linear-gradient(150deg, color-mix(in srgb, var(--gem) 65%, white), var(--gem) 55%, color-mix(in srgb, var(--gem) 60%, #160d22));
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.4); }
  .gem-pip.in { transform: scale(1) rotate(45deg); }
  .problem-wrap { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 6px; }
  .replay { pointer-events: auto; border: none; background: rgba(20,16,40,0.5); color: #fff; font-size: 22px;
    width: 46px; height: 46px; border-radius: 50%; cursor: pointer; }
  .problem { color: #fff; font-size: clamp(40px, 9vw, 84px); font-weight: 900;
    text-shadow: 0 4px 18px rgba(0,0,0,0.5); letter-spacing: 1px; }
  .hud-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: flex-start;
    padding-left: clamp(16px, 7vw, 110px);
    margin-bottom: max(18px, env(safe-area-inset-bottom)); }
  .answer { width: min(330px, 78vw); text-align: center; min-height: 1.1em; margin-bottom: 7px;
    font-size: clamp(28px, 6.5vw, 46px); font-weight: 900; color: #8be9ff; text-shadow: 0 3px 12px rgba(0,0,0,0.5); }
  .answer.wrong { color: #ff8787; animation: shake 0.4s; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-10px)} 75%{transform:translateX(10px)} }
  .pad { pointer-events: auto; align-self: flex-start; display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 9px; width: min(330px, 78vw); }
  .key { position: relative; border: none; cursor: pointer; font-family: inherit; font-weight: 900; color: #fff;
    aspect-ratio: 1.55; border-radius: 15px; font-size: clamp(20px, 4.6vw, 30px); overflow: hidden;
    transition: transform .07s ease, filter .07s ease, box-shadow .07s ease; }
  .key:active { transform: translateY(5px) scale(0.985); filter: brightness(1.08); }
  /* Glossy faceted gem buttons. */
  .key-gem {
    background:
      radial-gradient(115% 80% at 28% 16%, rgba(255,255,255,0.92), rgba(255,255,255,0) 42%),
      linear-gradient(155deg, color-mix(in srgb, var(--gem) 60%, white), var(--gem) 42%, color-mix(in srgb, var(--gem) 60%, #160d22));
    box-shadow: inset 0 2px 2px rgba(255,255,255,0.65), inset 0 -7px 12px rgba(0,0,0,0.30),
      0 7px 0 color-mix(in srgb, var(--gem) 42%, #120a1e), 0 12px 22px color-mix(in srgb, var(--gem) 45%, transparent);
    text-shadow: 0 2px 4px rgba(0,0,0,0.42); }
  .key-gem:active { box-shadow: inset 0 2px 2px rgba(255,255,255,0.5), inset 0 -4px 8px rgba(0,0,0,0.3),
      0 2px 0 color-mix(in srgb, var(--gem) 42%, #120a1e); }
  .key-gem::after { content:''; position:absolute; top:11%; left:13%; width:36%; height:26%;
    background: linear-gradient(120deg, rgba(255,255,255,0.9), rgba(255,255,255,0)); border-radius: 45%;
    transform: rotate(-12deg); pointer-events:none; }
  .key-back { background: linear-gradient(155deg,#5a6173,#363c4a); font-size: 30px;
    box-shadow: inset 0 2px 2px rgba(255,255,255,0.22), 0 7px 0 #23272f, 0 12px 20px rgba(0,0,0,0.35); }
  .key-back:active { box-shadow: inset 0 2px 2px rgba(255,255,255,0.18), 0 2px 0 #23272f; }
  .key-mine { color: #5a3a00; font-size: clamp(17px,3.8vw,25px); letter-spacing:.5px;
    background: radial-gradient(115% 80% at 30% 16%, rgba(255,255,255,0.95), rgba(255,255,255,0) 44%),
      linear-gradient(155deg,#ffe27a,#ffb01f 45%,#e8870c);
    box-shadow: inset 0 2px 2px rgba(255,255,255,0.8), inset 0 -7px 12px rgba(140,70,0,0.35),
      0 7px 0 #b96a00, 0 12px 22px rgba(255,150,0,0.35); }
  .key-mine:active { box-shadow: inset 0 2px 2px rgba(255,255,255,0.7), 0 2px 0 #b96a00; }
  `;
  document.head.appendChild(s);
}
