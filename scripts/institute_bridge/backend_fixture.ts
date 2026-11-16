// Disposable integration fixture only. Never imports the app entrypoint or opens live data.
import { Database } from 'bun:sqlite';
import { createSuggestionRoutes } from '../../server/src/suggestions';

const db = new Database(':memory:');
const routes = createSuggestionRoutes(db, { config: {
  adminToken: 'bridge-test-only', parentActors: ['discord:117470549298380806'],
} });
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/rpg/, '');
  return routes.fetch(new Request(url, request));
} });
console.log(server.port);
