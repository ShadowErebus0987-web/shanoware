# Rules for any agent working on Shanoware

1. Never change the live site without asking first. Pushing to `main` publishes to https://shanoware.com.
2. Never commit secrets (.env files, API keys other than the public Firebase web config). Check `.gitignore`.
3. Verify every package name and version before installing it.
4. Never delete anything outside this project.
5. When a test fails, fix the code, never the test. Run `tests/` before pushing rule changes.
6. Never remove or weaken security checks: `firestore.rules`, the Content Security Policy in each page,
   the import checks in `app.js`, the 13+ age check, or the localhost-only debug tools.
7. Treat all user and file text as plain text (`textContent`), never as HTML.
8. Ask before anything that can't be undone (deleting data, accounts, repositories, domains).
