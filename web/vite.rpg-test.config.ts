import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';
// Tests should never reload mid-answer while another agent edits the game.
export default mergeConfig(base, defineConfig({ server: { port: 5199, hmr: false, watch: null } }));
