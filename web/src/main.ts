import './styles.css';
import type { RpgGame } from './rpg/RpgGame';
import { VoicePresence } from './rpg/VoicePresence';
import { installStaleReload } from './utils/staleReload';

installStaleReload();

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

// Warm voice while the much larger game module is still loading.
// HTTP self-hosting must still work: insecure pages cannot use the microphone.
const voicePresence = window.isSecureContext ? new VoicePresence() : undefined;
voicePresence?.start();
let disposed = false;
let game: RpgGame | undefined;
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed = true;
    voicePresence?.dispose();
    game?.dispose();
  });
}
try {
  const { RpgGame } = await import('./rpg/RpgGame');
  if (!disposed) {
    game = new RpgGame(canvas);
    game.start();
    // Debug handle for QA/profiling (renderer diagnostics, frame timing).
    (window as Window & { __game?: RpgGame }).__game = game;
  }
} catch (error) {
  voicePresence?.dispose();
  throw error;
}
