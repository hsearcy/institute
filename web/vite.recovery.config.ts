import { mergeConfig } from 'vite';
import base from './vite.config';

// Other agents can keep editing the shared checkout while the fault-injection
// suite runs; a source edit must not cause an unplanned browser reload mid-test.
export default mergeConfig(base, { server: { port: 5209, hmr: false, watch: null } });
