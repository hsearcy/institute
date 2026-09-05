import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';
// A stable live playthrough while development continues in other files.
export default mergeConfig(base, defineConfig({ server: { hmr: false, watch: null } }));
