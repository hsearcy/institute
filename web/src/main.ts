import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const game = new Game(canvas);
game.start();

// Debug handle for QA/profiling (renderer diagnostics, frame timing).
(window as Window & { __game?: Game }).__game = game;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
