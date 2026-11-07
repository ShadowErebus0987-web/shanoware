# Tests

`rules.test.mjs` checks `firestore.rules` against the local Firestore emulator (needs Java 11+ and Node 20+).
Run from the project folder:

```bash
npm install --prefix tests
```

```bash
tests/node_modules/.bin/firebase emulators:exec --only firestore --project demo-shanoware "node --test tests/rules.test.mjs"
```
