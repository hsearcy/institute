/**
 * Reloads the page when the tab has sat idle for hours (e.g. left open
 * overnight), so a persistent browser window always comes back fresh
 * instead of needing a manual refresh every morning.
 */
const STALE_MS = 3 * 60 * 60 * 1000; // 3 hours without any user input
const CHECK_INTERVAL_MS = 60 * 1000;

export function installStaleReload(staleMs = STALE_MS): void {
  let lastActivity = Date.now();

  const markActivity = () => {
    lastActivity = Date.now();
  };

  const checkStale = () => {
    if (Date.now() - lastActivity > staleMs) {
      window.location.reload();
    }
  };

  const activityEvents: Array<keyof WindowEventMap> = [
    'pointerdown',
    'pointermove',
    'keydown',
    'touchstart',
    'wheel',
  ];
  for (const event of activityEvents) {
    window.addEventListener(event, markActivity, { passive: true, capture: true });
  }

  // Hidden tabs get their timers throttled, so also check on every path
  // back to the foreground (tab switch, window focus, bfcache restore).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkStale();
  });
  window.addEventListener('focus', checkStale);
  window.addEventListener('pageshow', checkStale);
  window.setInterval(checkStale, CHECK_INTERVAL_MS);
}
