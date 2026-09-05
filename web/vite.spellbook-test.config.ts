import { mergeConfig } from 'vite';
import base from './vite.config';
export default mergeConfig(base, { server: { port: 5219, hmr: false, watch: null } });
