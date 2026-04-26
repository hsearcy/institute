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
