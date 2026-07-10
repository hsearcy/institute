// Empty by default so production and same-origin dev/proxy deployments call
// the tutor API on the page's current origin. Set VITE_TUTOR_URL only when the
// web app is intentionally served separately from the tutor server.
export const API = import.meta.env.VITE_TUTOR_URL ?? '';
export const PROFILE = 'sam';
