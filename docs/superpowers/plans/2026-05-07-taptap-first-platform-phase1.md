# TapTap Platform Phase 1

> Status: completed and updated to match the current TapTap-only runtime architecture.

**Goal:** Establish a TapTap-native platform layer, remove Supabase runtime fallback, and move platform behavior out of scattered app code.

**Architecture:** `services/platform` now exposes a single TapTap provider with local-storage persistence for lightweight local state. TapTap native capabilities are preferred for login, leaderboard, achievements, and multiplayer. Release/update handling is treated as TapTap publishing-side behavior, not an app-managed release feed.

## File Map

- `.mcp.json` — TapTap Minigame MCP server config for development-time docs/tools
- `services/platform/types.ts` — app-level platform interfaces and normalized result types
- `services/platform/providers/taptapPlatform.ts` — TapTap provider for auth, profile, achievements, leaderboard, and multiplayer
- `services/platform/platformClient.ts` — platform selector returning TapTap provider
- `services/platform/index.ts` — public exports
- `tests/platform-contract.ts` — compile-time contract for the public API
- `hooks/useAchievements.ts` — achievement reads/writes via platform API
- `App.tsx` — auth, leaderboard, profile, multiplayer, and version/about UX routed through TapTap-first platform semantics
- `components/OnlineMenu.tsx` — TapTap native matchmaking UI only
- `components/LoginModal.tsx` — TapTap login only
- `components/AboutModal.tsx` — TapTap publishing-side version messaging

## Completed Work

- [x] Create platform contract and provider selector
- [x] Add project MCP config for TapTap minigame docs/tools
- [x] Move achievements behind `platform.achievements`
- [x] Move leaderboard access behind `platform.leaderboard`
- [x] Move auth/profile handling behind `platform.auth` and `platform.profile`
- [x] Move online matchmaking behind `platform.multiplayer`
- [x] Remove Supabase runtime code and dependencies
- [x] Remove WebRTC / room-id fallback online flow
- [x] Simplify login to TapTap-only
- [x] Replace app-managed update check UI with TapTap publishing-side wording

## Verification

- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run lint` (warning-only baseline remains in the repo)

## Notes

- Non-TapTap environments can still use local single-player features backed by local storage, but online play and TapTap-native UI entry points are intentionally unavailable there.
- The remaining local `elo` field is now a practice/profile value. It no longer drives online matchmaking.
