# WASSCE Study Hall — Frontend

A standalone React app (built with Vite) — the same prototype that
was previously a Claude artifact, rebuilt to run as an ordinary local
web app. See the top-level SETUP.md one level up for how to run this
together with the backend.

## Quick start

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. It expects the backend
(`wassce-server`) to be running at http://localhost:3001 — change
that in the app's own Settings panel (bottom-right corner) if you've
deployed the backend somewhere else.

## Why this exists as a separate project

The original version of this prototype ran inside a Claude.ai
artifact, which is convenient for a quick demo (no setup, free AI
calls) but cannot make network requests to `localhost` or any private
network address — that's a security restriction of the artifact
sandbox, not something configurable. So it could never actually reach
a locally-run backend. This version has no such restriction; it's
just a normal web page.
