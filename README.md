# Shanoware

All of Shano's games in one place.

Shanoware is the home for every game made by Shano. Pick up where you left off, keep your saves synced across devices, track your endings and unlocks, and get new games as soon as they drop. Starting with Last Light, a pixel-art horror game where your lantern is the only thing keeping the dark away.

Plain HTML/CSS/JS, installable, works offline after the first visit.

## Going live (GitHub Pages)

1. Create an empty **public** repository on GitHub (for example `shanoware`) and push this folder to it.
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Every push to `main` is now live at https://shanoware.com (custom domain set in Settings → Pages, DNS at Cloudflare, "DNS only").

Until step 4 below is done, Shanoware runs on each device only, with no sign-in.

## Switching on accounts and cloud saves (Firebase, free Spark plan)

1. Go to <https://console.firebase.google.com>, **Add project**, and stay on the free **Spark** plan (no card needed).
2. **Build → Authentication → Get started → Sign-in method → Email/Password**: turn on **Email link (passwordless sign-in)**.
3. **Authentication → Settings → Authorized domains**: add `shanoware.com`.
4. **Build → Firestore Database → Create database** (production mode, any nearby location).
5. Open `firestore.rules` in this folder, replace `[ADMIN EMAIL]` with the email you'll sign in with, then paste the whole file into **Firestore → Rules** and **Publish**.
6. **Firestore → Indexes → Single field → Add exemption**: collection `saves`, field `game`, tick **Collection group** ascending. (The admin page uses it to count saves per game.)
7. **Project settings → General → Your apps → Web (`</>`)**, register an app, and copy the `firebaseConfig` object into `firebase-config.js` in place of `null`. This config is public by design; the rules keep data safe.
8. Push. Players now sign in by email link, pass the 13+ check, and their saves sync.

The admin page is at `/admin.html`. Only the email in the rules can see the numbers.

## Email updates (Buttondown)

1. Make a Buttondown account and add your mailing address in its settings (it's printed in every email, with an unsubscribe link).
2. Put your Buttondown username in `buttondownUser` in `firebase-config.js`.

Players who tick "Email me when new games come out" are added through Buttondown's public sign-up form (tagged `shanoware`); Buttondown sends them a confirmation email first.

## Tests

The database rules have their own tests: see `tests/README.md`.

## Adding a game

1. Put the game in `games/<id>/index.html` (plus an `art.svg` for its tile).
2. Add one entry to `games.json`:

```json
{
  "id": "my-game",
  "title": "My Game",
  "path": "games/my-game/index.html",
  "art": "games/my-game/art.svg",
  "palette": { "background": "#101820", "text": "#eef", "accent": "#6cf" },
  "font": "Silkscreen",
  "tagline": "One short line.",
  "saveKey": "mygame.v1.slot",
  "slots": 3
}
```

The launcher opens the game as `path?slot=N`. The game saves slot N to `saveKey + N`
and writes a summary beside it (optional `legacyKey`: an older single save that is moved into Save 1) at `saveKey + N + ".meta"`:

```json
{ "progress": [["Endings", 3, 18], ["Notes", 5, 8]], "totals": { "Runs": 4 }, "updated": 1730000000000 }
```

## Adding a tab

Add `<section class="tab" data-tab="id" data-label="Name">` inside `<main>` in `index.html`.
Optionally add a matching `<symbol id="i-id">` icon. The tab bar builds itself.

## Writing "What's new"

Add an entry to the top of `news.json`. Give each a new `id`; the dot shows until a player opens it.
Text is shown exactly as written (no HTML).

```json
{ "id": "2026-12-new-lantern", "date": "2026-12-01", "title": "Short title", "body": "One or two sentences." }
```
