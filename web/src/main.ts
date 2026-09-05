import './styles.css';
import type { Game } from './game/Game';
import type { RpgGame } from './rpg/RpgGame';
import { installStaleReload } from './utils/staleReload';

installStaleReload();

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const legacy = new URLSearchParams(location.search).get('mode') === 'mine';
const game = legacy
  ? new (await import('./game/Game')).Game(canvas)
  : new (await import('./rpg/RpgGame')).RpgGame(canvas);
game.start();

// Debug handle for QA/profiling (renderer diagnostics, frame timing).
(window as Window & { __game?: Game | RpgGame }).__game = game;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
