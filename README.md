# Shanoware

All of Shano's games in one place.

Shanoware is the home for every game made by Shano. Pick up where you left off, keep your saves synced across devices, track your endings and unlocks, and get new games as soon as they drop. Starting with Last Light, a pixel-art horror game where your lantern is the only thing keeping the dark away.

Plain HTML/CSS/JS, installable, works offline after the first visit.

## Going live (GitHub Pages)

1. Push this folder to a GitHub repository.
2. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Every push to `main` is now live at `https://<username>.github.io/<repo>/`.

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
