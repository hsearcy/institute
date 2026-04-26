# M3 manual on-device checklist

Run on a real Fire HD 10 (2023). Mark each item with ✅ / ❌ and a brief note.

## Setup
1. Install Expo Go on the Fire tablet (sideload the APK from `https://expo.dev/go`).
2. From the dev machine: `cd apps/kid-app && bun run start`.
3. Open Expo Go on the tablet and scan the QR code (or enter the URL).

## Checks

- [ ] **Cold launch:** First-open time from tap → interactive scene < 5 seconds.
- [ ] **Idle FPS:** Tablet sitting still, watch the FPS overlay for 60 seconds. Sustained ≥30fps?
- [ ] **Orbit FPS:** Continuously swipe left/right for 30 seconds. Sustained ≥30fps?
- [ ] **Memory:** Open Expo dev tools or watch tablet performance. Memory plateau after the first 30 seconds (no leak).
- [ ] **Portal labels:** All 4 labels readable at arm's length on the tablet.
- [ ] **Cliff bounding:** Cannot see "the void" beyond the hub edges at any orbit angle.
- [ ] **Tap responsiveness:** Tapping a portal triggers a toast within 200ms.
- [ ] **Visual polish:** Scene reads as "intentional" rather than "developer test."

## Kid verdict (fill in)

- Date tested: ___
- Kid's reaction (verbatim if possible): ___
- Verdict: thumbs up / thumbs down / mixed
- Anything they asked about / wanted to do that didn't work: ___

## If anything fails

- FPS < 30 idle → reduce decor count or downgrade to `MeshLambertMaterial`
- Memory leak → check for retained references in useFrame closures
- Cold launch > 5s → defer Decor's GLB loading to a second async pass
- Kid bored → that's data; bring it back to brainstorming for M4+

---

## M2 manual on-device checks

After M2 ships, re-run on Fire HD 10 (or Pixel 6a as proxy):

- [ ] **Tap Spell Cast portal:** scene transitions to mini-game. Goblin (green capsule + eyes) visible at z=-3. Number pad appears at the bottom. Back × button at top-left.
- [ ] **Correct sequence:** tap 2, then 4, then 6, then 8, then 10. Each tap shrinks the goblin by ~20% scale. After tapping 10, scene returns to the hub within ~500ms.
- [ ] **Wrong answer:** tap, e.g., 5 first. Goblin shakes briefly; HP does not decrement; scene does NOT progress to the next step. (Tap 2 to recover and continue.)
- [ ] **Back button mid-round:** tap × at any point. Scene returns immediately to the hub without crashing.
- [ ] **Hub state preserved:** after returning from the mini-game, hub looks identical to before — same camera angle, tutor still bobbing, decor in place.
- [ ] **Other portals unchanged:** tapping Block Tower / Cookie Share / Door Code in the hub still shows the "Coming soon" toast (not the mini-game).
- [ ] **`console.log("[round complete]", result)` appears** in the Expo CLI / Metro output when a round finishes (status=completed) or aborts (status=aborted), with `outcomes` array populated.

If anything fails, look at:
- Mode-state transitions in App.tsx
- The `key={mode.runId}` on MiniGameMount (forces remount per run)
- Pan-gesture disablement in `onPan` (prevents orbit-during-round bugs)

---

## M5 manual on-device checks

After M5 ships, with the backend running locally:

### Setup
1. From repo root: `( cd apps/backend && RBENV_VERSION=3.4.7 ANTHROPIC_API_KEY=... bin/rails server -b 0.0.0.0 -p 3000 )`
2. In another terminal: `EXPO_PUBLIC_TUTOR_BASE_URL=http://<dev-machine-lan-ip>:3000 pnpm --filter @institute/kid-app start --tunnel`
3. (Optional) Set `EXPO_PUBLIC_TUTOR_SECRET=...` and same `TUTOR_SHARED_SECRET=...` on the backend env to test auth.

### Checks
- [ ] **First-ever Spell Cast tap:** loading delay ~2-4s (LLM call), then a goblin appears with a sequence Claude picked. The intro line should be playful and short.
- [ ] **Different sequence per round:** play 3 rounds back-to-back. The goblin's sequence varies (skip_count_2 vs skip_count_5 vs sequence_next, etc.).
- [ ] **Mastery influence:** finish 3 quick perfect rounds on the same skill. The next round should bias toward a stretch skill or a harder difficulty.
- [ ] **Backend offline (kill the rails server):** tap the portal — should fall back to FIXTURES (`[2,4,6,8,10]`) within ~1s, no crash.
- [ ] **Bad bearer token (when secret set):** spoof the wrong secret — kid-app should fall back to FIXTURES. Backend log shows 401.
- [ ] **Persistence:** complete a round; quit Expo Go; relaunch; play again. The recentHistory POST'd to the backend should include the prior round's outcomes.
- [ ] **Backend logs show `Tutor::Picker invalid response`** never (or rarely) — that's the LLM violating the schema and indicates a prompt fix is needed.

If anything fails:
- Check `apps/backend/log/development.log` for the LLM raw response.
- Confirm `EXPO_PUBLIC_TUTOR_BASE_URL` is reachable from the device (browser-test the URL on the tablet first).
- Confirm the on-device SQLite has rows: `sqlite3 ~/.expo/devices/<id>/institute.db "SELECT * FROM skill_state"` (or equivalent inspection).
