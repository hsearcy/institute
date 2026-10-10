import './styles.css';
import type { RpgGame } from './rpg/RpgGame';
import { installStaleReload } from './utils/staleReload';

installStaleReload();

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const game = new (await import('./rpg/RpgGame')).RpgGame(canvas);
game.start();

// Debug handle for QA/profiling (renderer diagnostics, frame timing).
(window as Window & { __game?: RpgGame }).__game = game;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
