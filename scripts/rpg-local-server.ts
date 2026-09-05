/** Offline tutor + disposable development profiles; never loads the project .env. */
import { seedRpgDemo } from './seed-rpg-demo';
const { server, path } = await seedRpgDemo();
Bun.serve({ port: server.port, hostname: '127.0.0.1', fetch: server.fetch });
console.log(`[rpg playtest] http://127.0.0.1:${server.port}; scratch DB ${path}; profiles rpg-playtest / rpg-veteran`);
