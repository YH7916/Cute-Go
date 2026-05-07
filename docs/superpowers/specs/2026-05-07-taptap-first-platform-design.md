# TapTap Platform Design

Date: 2026-05-07  
Scope: Make Cute-Go align with TapTap-native runtime and TapTap distribution, with no Supabase runtime dependency.

## Goal

Cute-Go now targets TapTap minigame as the primary runtime and distribution channel.

The platform layer should ensure:

- TapTap login is the only account entry.
- TapTap native room/match is the only online path.
- TapTap leaderboard and achievement APIs are used when available.
- Local browser/dev builds use local storage only for lightweight profile and achievement persistence.
- Version distribution, release rollout, and update visibility are treated as TapTap publishing concerns, not app-managed download logic.

## Current Architecture

Runtime platform capabilities are centralized in `services/platform/`:

- `auth`: restore session, observe session changes, TapTap login, sign out.
- `profile`: read/update local profile cache keyed by TapTap identity, update nickname, retain local practice rating.
- `achievements`: local cache plus TapTap achievement unlock when running inside TapTap.
- `leaderboard`: submit score and open TapTap leaderboard UI.
- `multiplayer`: native TapTap matchmaking and room messaging only.

`App.tsx`, `hooks/useAchievements.ts`, and UI components consume app-owned platform types rather than raw TapTap SDK payloads.

## Provider Strategy

There is a single runtime provider:

- `taptapPlatform.ts`

It wraps `utils/tapTapBridge.ts` and normalizes session/profile/match shapes for the rest of the app. The app should not branch on backend choice anymore because there is no backend fallback provider in runtime code.

## Local Persistence

For non-server state that still matters outside TapTap APIs:

- profile cache: `cutego.taptap.profiles`
- active profile id: `cutego.taptap.activeProfileId`
- achievements cache: `cutego.taptap.achievements.<userId>`

This keeps browser/dev sessions usable without reintroducing a second backend.

## Multiplayer Direction

Online play is intentionally narrow:

- TapTap environment: use TapTap native match + room messaging
- non-TapTap environment: online play is unavailable

We no longer maintain Supabase queueing, realtime signaling, room ids, or WebRTC fallback paths.

## Distribution and Updates

Version checking and download links are no longer app-managed runtime features.

The app may show the current package version, but:

- release approval
- rollout state
- user update path

are all considered TapTap publishing-side concerns.

About/Version UI should communicate that clearly instead of pretending the app can fetch and compare a separate release feed.

## File Structure

```text
services/platform/
  index.ts
  types.ts
  platformClient.ts
  providers/
    taptapPlatform.ts
```

## Success Criteria

- `App.tsx` no longer imports Supabase or fallback online code.
- `hooks/useAchievements.ts` uses the platform layer.
- `components/OnlineMenu.tsx` only exposes TapTap native matchmaking.
- Login UI is TapTap-only.
- About/version UI uses TapTap publishing-side wording instead of app-managed update checks.
- `npm run typecheck`, `npm run build`, and `npm run lint` pass.

## Non-Goals

- Reintroducing Supabase fallback.
- Maintaining email/password auth.
- Maintaining app-owned release feed or download URL logic.
- Rebuilding multiplayer abstraction around room ids or WebRTC fallback.
