import { test, expect, type Page } from '@playwright/test';
const idea = (page: Page) => page.getByRole('textbox', { name: 'My idea' });
const send = (page: Page) => page.getByRole('button', { name: 'Send', exact: true });
async function open(page: Page) {
  await page.goto('/');
  await page.locator('.rpg-camp-idea').click({ timeout: 60_000 });
  await expect(page.getByRole('dialog', { name: '💡 Your idea' })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('institute:rpg:problem:v1::sam:tutorial:v1', 'completed');
    const rendererTimer = setInterval(() => { const world = (window as any).__game?.world; if (world) { world.renderer.setPixelRatio(.15); world.renderer.shadowMap.enabled = false; clearInterval(rendererTimer); } }, 10);
    const devices = navigator.mediaDevices;
    const real = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async constraints => { const stream = await real(constraints); (window as any).__tracks = stream.getTracks(); return stream; };
    const Original = window.WebSocket;
    class MockSocket {
      readyState = 1; bufferedAmount = 0; onopen: any; onmessage: any; onclose: any; onerror: any;
      constructor(url: string) { (window as any).__socket = this; (window as any).__url = url; setTimeout(() => this.onopen?.({}), 0); }
      send(data: any) {
        if (typeof data !== 'string') { (window as any).__frames = ((window as any).__frames || 0) + 1; return; }
        const msg = JSON.parse(data); ((window as any).__messages ??= []).push(msg);
        if (msg.type === 'start') setTimeout(() => this.message({ type: 'ready' }), 0);
        if (msg.type === 'stop') setTimeout(() => { this.message({ type: 'transcript', text: 'dragon friend', isFinal: true }); this.message({ type: 'done' }); }, 100);
      }
      message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
      close() { this.readyState = 3; }
    }
    (window as any).WebSocket = class extends MockSocket { constructor(url: string) { super(url); if (!url.includes('/suggestions/live')) return new Original(url) as any; } };
  });
});
test('live words are editable, stop flushes before sending, and history survives reload', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: /Tap to talk/ }).click();
  await expect(page.getByText(/Listening now/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__frames || 0)).toBeGreaterThan(0);
  await page.evaluate(() => { const s = (window as any).__socket; s.message({type:'transcript', text:'dragon', isFinal:false}); s.message({type:'transcript', text:'dragon friend', isFinal:false}); });
  await expect(idea(page)).toHaveValue('dragon friend'); await expect(send(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Done talking' }).click(); await expect(send(page)).toBeDisabled();
  await expect(send(page)).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__tracks.every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await idea(page).fill('Make a dragon friend please'); await send(page).click();
  await expect(page.locator('[data-suggestion-notice]')).toHaveText('Idea saved. Dad will check it.');
  await page.reload(); await page.locator('.rpg-camp-idea').click(); await page.getByText('My saved ideas').click();
  await expect(page.locator('[data-suggestion-history]')).toContainText('Make a dragon friend please');
  expect(await page.evaluate(() => (window as any).__messages)).toBeUndefined();
});
test('cancel discards speech and releases microphone; failure never sends', async ({ page }) => {
  await open(page); await idea(page).fill('typed words'); await page.getByRole('button', { name: /Tap to talk/ }).click();
  await expect(page.getByText(/Listening now/)).toBeVisible();
  await page.evaluate(() => (window as any).__socket.message({type:'transcript', text:'unsent speech', isFinal:false}));
  await expect(idea(page)).toHaveValue('typed words unsent speech'); await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.evaluate(() => (window as any).__tracks.every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await page.locator('.rpg-camp-idea').click(); await expect(idea(page)).toHaveValue('typed words');
  await page.getByRole('button', { name: /Tap to talk/ }).click(); await expect(page.getByText(/Listening now/)).toBeVisible();
  await page.evaluate(() => (window as any).__socket.message({type:'error', message:'unavailable'}));
  await expect(page.locator('[data-suggestion-notice]')).toContainText('Voice is not working'); await expect(idea(page)).toHaveValue('typed words');
});
test('live words keep updating while the draft is read only and cancel discards speech', async ({ page }) => {
  await open(page); await idea(page).fill('typed'); await page.getByRole('button', { name: /Tap to talk/ }).click();
  await expect(page.getByText(/Listening now/)).toBeVisible();
  await page.evaluate(() => (window as any).__socket.message({type:'transcript', text:'speech', isFinal:false}));
  await expect(idea(page)).toHaveAttribute('readonly', '');
  await page.evaluate(() => (window as any).__socket.message({type:'transcript', text:'late speech', isFinal:false}));
  await expect(idea(page)).toHaveValue('typed late speech');
  await page.getByRole('button', {name:'Cancel'}).click(); await page.locator('.rpg-camp-idea').click();
  await expect(idea(page)).toHaveValue('typed');
});
test('server done finishes listening and preserves words without sending', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: /Tap to talk/ }).click(); await expect(page.getByText(/Listening now/)).toBeVisible();
  await page.evaluate(() => { const s = (window as any).__socket; s.message({type:'transcript', text:'my idea', isFinal:true}); s.message({type:'done'}); });
  await expect(idea(page)).toHaveValue('my idea'); await expect(send(page)).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__tracks.every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await expect(page.locator('[data-suggestion-notice]')).toBeEmpty();
});
test('server limit requests a client audio flush before final words and never submits', async ({ page }) => {
  await open(page); await page.getByRole('button', {name:/Tap to talk/}).click(); await expect(page.getByText(/Listening now/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__frames || 0)).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__socket.message({type:'stop_requested'}));
  await expect(send(page)).toBeEnabled(); await expect(idea(page)).toHaveValue('dragon friend');
  expect(await page.evaluate(() => (window as any).__messages.some((m:any) => m.type === 'stop'))).toBe(true);
  expect(await page.evaluate(() => (window as any).__tracks.every((t:MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await expect(page.locator('[data-suggestion-notice]')).toBeEmpty();
});
test('edits after done survive cancel and saving locks editing and talk', async ({ page }) => {
  await open(page); await page.getByRole('button', {name:/Tap to talk/}).click(); await expect(page.getByText(/Listening now/)).toBeVisible();
  await page.getByRole('button', {name:'Done talking'}).click(); await expect(send(page)).toBeEnabled();
  await idea(page).fill('edited after done'); await page.getByRole('button', {name:'Cancel'}).click(); await page.locator('.rpg-camp-idea').click();
  await expect(idea(page)).toHaveValue('edited after done');
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rpg/suggestions', async route => { if (route.request().method() === 'POST') await waiting; await route.continue(); });
  await send(page).click(); await expect(idea(page)).toBeDisabled(); await expect(page.getByRole('button', {name:/Tap to talk/})).toBeDisabled();
  release(); await expect(page.locator('[data-suggestion-notice]')).toHaveText('Idea saved. Dad will check it.');
});
test('active game Idea button pauses and traps hotkeys on mobile', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 }); await page.goto('/');
  await page.getByRole('button', { name: /Enter the dungeon/ }).click({timeout:60_000});
  const demo = page.getByRole('button', {name:'Let me try'}); if (await demo.isVisible()) await demo.click();
  const top = page.locator('.rpg-top .rpg-idea-button'); await expect(top).toBeVisible();
  const bounds = await top.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await top.click(); await idea(page).fill('qwe bki 123');
  expect(await page.evaluate(() => (window as any).__game.world.diagnostics.paused)).toBe(true);
  await expect(page.getByRole('dialog', { name:'💡 Your idea' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(top).toBeFocused();
  await page.getByRole('button', {name:'Equipment', exact:true}).click();
  await expect(page.locator('#rpg-ui')).toHaveAttribute('data-panel','inventory');
  await page.locator('.rpg-dialog-idea').click(); await page.getByRole('button', {name:'Cancel', exact:true}).click();
  await expect(page.locator('#rpg-ui')).toHaveAttribute('data-panel','inventory');
  expect(await page.evaluate(() => (window as any).__game.playing)).toBe(true);
  await page.getByRole('button', {name:'Close', exact:true}).click();
  expect(await page.evaluate(() => (window as any).__game.world.diagnostics.paused)).toBe(false);
});
