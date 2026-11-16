import { test, expect, type Page } from '@playwright/test';

const idea = (page: Page) => page.getByRole('textbox', { name: 'My idea, type or edit before sending' });
const send = (page: Page) => page.getByRole('button', { name: 'Send to Ares', exact: true });
async function open(page: Page, voice = false) {
  if (voice) await page.route('**/rpg/suggestions?*', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ json: { ...data, voiceAvailable: true } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Suggest a change', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Suggest a change', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Suggest a change', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('institute:rpg:problem:v1::sam:tutorial:v1', 'completed');
    localStorage.setItem('institute:rpg:muted', 'true');
    // Lower the software framebuffer as soon as construction finishes, before
    // the load event waits for the many 3D textures. Keep the real simulation.
    const rendererTimer = setInterval(() => {
      const world = (window as any).__game?.world;
      if (!world) return;
      world.renderer.setPixelRatio(.15); world.renderer.shadowMap.enabled = false;
      clearInterval(rendererTimer);
    }, 10);
    const real = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
    if (real) navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await real(constraints);
      (window as any).__suggestionTracks ??= [];
      (window as any).__suggestionTracks.push(...stream.getTracks());
      return stream;
    };
  });
  page.on('load', () => { void page.waitForFunction(() => !!(window as any).__game?.world).then(() => page.evaluate(() => {
    const world = (window as any).__game.world; world.renderer.setPixelRatio(.25); world.renderer.shadowMap.enabled = false;
  })).catch(() => {}); });
});

test('production bundle saves original child text to disposable SQLite and reads durable history after reload', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(page.getByText('Voice transcription is resting. Type your idea instead.', { exact: true })).toBeVisible();
  await expect(idea(page)).toBeEditable(); await expect(send(page)).toBeDisabled();
  const text = `Please add a blue dragon. <img src=x onerror=alert(1)> ${info.testId}`;
  await idea(page).fill(`  ${text}  `); await send(page).click();
  await expect(page.locator('[data-suggestion-notice]')).toContainText('Saved for Ares / waiting for Dad');
  await expect(idea(page)).toHaveValue('');
  const saved = await (await page.request.get('/rpg/suggestions?profileId=sam')).json();
  expect(saved.suggestions.filter((s: any) => s.text === text)).toHaveLength(1);
  expect(saved.suggestions.find((s: any) => s.text === text).status).toBe('sent');
  await expect(page.locator('[data-suggestion-history] img')).toHaveCount(0);
  await page.reload(); await page.getByRole('button', { name: 'Suggest a change', exact: true }).click();
  await expect(page.locator('[data-suggestion-history]')).toContainText(text);
  await expect(page.getByRole('button', { name: /approve|decline|deploy/i })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('suggestions-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('suggestions-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('lost response retries same UUID even across reload and creates just one saved idea', async ({ page }) => {
  await open(page);
  const text = `Lost response ${test.info().testId}`;
  const ids: string[] = [];
  let lose = true;
  await page.route('**/rpg/suggestions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    ids.push(route.request().postDataJSON().requestId);
    if (lose) { lose = false; const response = await route.fetch(); expect(response.status()).toBe(201); return route.abort('failed'); }
    await route.continue();
  });
  await idea(page).fill(text); await send(page).click();
  await expect(page.locator('[data-suggestion-notice]')).toContainText('save could not be confirmed');
  await expect(idea(page)).toHaveValue(text);
  await page.reload(); await page.getByRole('button', { name: 'Suggest a change', exact: true }).click();
  await expect(idea(page)).toHaveValue(text); await send(page).click();
  await expect(page.locator('[data-suggestion-notice]')).toContainText('Saved for Ares');
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  const saved = await (await page.request.get('/rpg/suggestions?profileId=sam')).json();
  expect(saved.suggestions.filter((s: any) => s.text === text)).toHaveLength(1);
});

test('native fake microphone records locally, only explicitly transcribes, edits preview, then sends', async ({ page }) => {
  let uploads = 0; let sent = 0;
  await page.route('**/rpg/suggestions/transcribe', async route => {
    uploads++;
    expect(route.request().headers()['content-type']).toMatch(/^audio\//);
    expect(route.request().postDataBuffer()!.byteLength).toBeGreaterThan(0);
    await route.fulfill({ json: { text: 'Make a snow-dragon friend' } });
  });
  page.on('request', request => { if (new URL(request.url()).pathname === '/rpg/suggestions' && request.method() === 'POST') sent++; });
  await open(page, true);
  await page.getByRole('button', { name: 'Record my idea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeFocused();
  await page.waitForTimeout(650); expect(uploads).toBe(0); expect(sent).toBe(0);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Transcribe recording', exact: true })).toBeVisible();
  expect(uploads).toBe(0);
  expect(await page.evaluate(() => (window as any).__suggestionTracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await idea(page).fill('Do not overwrite this typed draft');
  await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
  const transcript = page.getByRole('textbox', { name: 'Recorded words, check and edit' });
  await expect(transcript).toHaveValue('Make a snow-dragon friend');
  await expect(idea(page)).toHaveValue('Do not overwrite this typed draft'); expect(sent).toBe(0);
  await transcript.fill('Make a snow-dragon friend, please.');
  await page.getByRole('button', { name: 'Use these words in my idea', exact: true }).click();
  await expect(idea(page)).toHaveValue('Make a snow-dragon friend, please.');
  await send(page).click(); await expect(page.locator('[data-suggestion-notice]')).toContainText('Saved for Ares');
  expect(uploads).toBe(1); expect(sent).toBe(1);
});

test('discard, Escape and backdrop release microphone and preserve only typed drafts; focus returns to camp', async ({ page }) => {
  let uploads = 0;
  page.on('request', r => { if (r.url().includes('/transcribe')) uploads++; });
  await open(page, true); await idea(page).fill('Keep my typed idea');
  await page.getByRole('button', { name: 'Record my idea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
  await expect(idea(page)).toHaveValue('Keep my typed idea');
  await expect(page.locator('audio[data-recording-preview]')).toBeHidden();
  await page.getByRole('button', { name: 'Record my idea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete (document as any).hidden; });
  await expect(page.locator('[data-suggestion-notice]')).toContainText('Recording was discarded when you left');
  await expect(idea(page)).toHaveValue('Keep my typed idea');
  await page.getByRole('button', { name: 'Record my idea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Suggest a change', exact: true })).toBeFocused();
  expect(await page.evaluate(() => (window as any).__suggestionTracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: 'Suggest a change', exact: true }).click();
  await expect(idea(page)).toHaveValue('Keep my typed idea');
  await page.locator('#rpg-overlay').click({ position: { x: 3, y: 3 } });
  await expect(page.getByRole('button', { name: 'Suggest a change', exact: true })).toBeFocused(); expect(uploads).toBe(0);
});

test('permission denied and provider 503 keep textarea usable; conflict preserves draft and a text edit changes UUID', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await open(page, true); await page.getByRole('button', { name: 'Record my idea', exact: true }).click();
  await expect(page.locator('[data-suggestion-notice]')).toContainText('Microphone permission was not allowed');
  await expect(idea(page)).toBeEditable(); await idea(page).fill('Larger treasure chests');
  const ids: string[] = [];
  await page.route('**/rpg/suggestions', async route => {
    ids.push(route.request().postDataJSON().requestId);
    await route.fulfill({ status: 409, json: { error: 'conflict' } });
  });
  await send(page).click(); await expect(page.locator('[data-suggestion-notice]')).toContainText('do not match');
  await expect(idea(page)).toHaveValue('Larger treasure chests');
  await idea(page).fill('Larger treasure chests, please'); await send(page).click();
  await expect(page.locator('[data-suggestion-notice]')).toContainText('do not match');
  expect(ids).toHaveLength(2); expect(ids[0]).not.toBe(ids[1]);
});

test('provider failure during transcription never loses typed text', async ({ page }) => {
  await page.route('**/rpg/suggestions/transcribe', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await open(page, true); await idea(page).fill('I can always type this');
  await page.getByRole('button', { name: 'Record my idea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
  await expect(page.locator('[data-suggestion-notice]')).toContainText('Voice transcription is unavailable');
  await expect(idea(page)).toHaveValue('I can always type this'); await expect(idea(page)).toBeEditable();
});

test('manual history refresh shows all honest statuses with escaped words and notes', async ({ page }) => {
  let status = 'sent';
  await page.route('**/rpg/suggestions?*', route => route.fulfill({ json: { voiceAvailable: false, suggestions: [{ id: 'fixture', profileId: 'sam', text: '<img src=x onerror=alert(1)>', status, createdAt: 1794840000000, updatedAt: 1794840000000, parentNote: '<script>not executable</script>', notificationPending: status === 'sent' }] } }));
  await open(page);
  await expect(page.locator('[data-suggestion-history]')).toContainText('Saved for Ares / waiting for Dad');
  await expect(page.locator('[data-suggestion-history]')).toContainText('Notification to Ares is still pending.');
  for (const [value, label] of [['approved', 'Dad approved'], ['building', 'Being built'], ['ready', 'Ready for Dad to review'], ['declined', 'Not this time'], ['needs_details', 'Dad needs more details'], ['constructor', 'Status unavailable']]) {
    status = value!; await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.locator('[data-suggestion-history]')).toContainText(label!);
  }
  await expect(page.locator('[data-suggestion-history] img, [data-suggestion-history] script')).toHaveCount(0);
  await expect(page.locator('[data-suggestion-history]')).toContainText('<script>not executable</script>');
  const authored = await page.locator('.rpg-suggestions').innerText();
  // Original child text can contain dashes. Authored UI copy must not add any.
  expect(authored).not.toMatch(/[\-\u2010-\u2015]/);
});

test('pause integration traps keyboard focus, ignores game hotkeys while typing and keeps world paused', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Enter the dungeon/ }).click({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__game.busy)).toBe(false);
  const demo = page.getByRole('button', { name: 'Let me try', exact: true }); if (await demo.isVisible()) await demo.click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Suggest a change', exact: true }).click();
  await idea(page).focus(); await idea(page).pressSequentially('qwe bki 123'); await idea(page).press('ArrowLeft'); await idea(page).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Suggest a change', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.world.diagnostics.paused)).toBe(true);
  const refresh = page.getByRole('button', { name: 'Refresh status', exact: true }); await expect(refresh).toBeEnabled();
  await refresh.focus(); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(refresh).toBeFocused();
  await idea(page).focus(); await page.keyboard.press('Tab'); await expect(send(page)).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: 'Adventure saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suggest a change', exact: true })).toBeFocused();
  expect(await page.evaluate(() => (window as any).__game.world.diagnostics.paused)).toBe(true);
});

test('an older in-flight history response cannot hide a newly confirmed saved idea', async ({ page }) => {
  let release!: () => void;
  let markRequested!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { markRequested = resolve; });
  await page.route('**/rpg/suggestions?*', async route => {
    markRequested(); await gate;
    await route.fulfill({ json: { suggestions: [], voiceAvailable: false } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Suggest a change', exact: true }).click({ timeout: 60_000 });
  await requested;
  const text = `Keep this saved idea visible ${test.info().testId}`;
  await page.getByRole('textbox', { name: 'My idea, type or edit before sending' }).fill(text);
  await page.getByRole('button', { name: 'Send to Ares', exact: true }).click();
  await expect(page.locator('[data-suggestion-notice]')).toContainText('Saved for Ares');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/rpg/suggestions' && r.request().method() === 'GET');
  release(); await response;
  await expect(page.locator('[data-voice-help]')).toContainText('Voice transcription is resting');
  await expect(page.locator('[data-suggestion-history]')).toContainText(text);
});

