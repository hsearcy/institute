# Installed equipment verification

This run uses actual branch asset paths, with no module/asset routing overrides,
through existing Chromium9222 in a separate disposable context. Real inventory
clicks equip Ashsplitter, Apprentice and Thunder Rod in turn. Each has exactly
one held mount and its saved ID matches the visible item.

Two actual Chain Lightning answers leave one survivor and then clear the room.
Six hit callbacks, at most seven visible enemies, no page errors or context
loss. Reload preserves XP13519, kills746, room1, Thunder Rod equipment and
the mounted model. These are seeded local veteran values, not family data.

The branch build and369 tests pass. Native art approvals are in the individual
item evidence folders; this additional run verifies installed paths and save
behavior. The global art gate remains failed.
