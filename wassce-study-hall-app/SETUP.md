# WASSCE Study Hall — Full Setup (backend + frontend)

Two projects, run together:

- `wassce-server` — the API (auth, subscriptions, Modem Pay, AI proxy)
- `wassce-frontend` — the web app your browser opens

Both need `npm install` once, then run in **two separate terminal
windows at the same time** (one runs the server, the other runs the
frontend — closing either window stops that half of the app).

## Windows Command Prompt, step by step

**Terminal window 1 — the backend:**

```
cd wassce-server
npm install
copy .env.example .env
npm run dev
```

Wait for: `WASSCE Study Hall API listening on port 3001`. Leave this
window open.

**Terminal window 2 — the frontend** (open a brand new Command Prompt
window, `cd` into the same parent folder first):

```
cd wassce-frontend
npm install
npm run dev
```

Wait for: `Local: http://localhost:5173/`. Leave this window open too.

**Then:** open your browser to **http://localhost:5173** — that's the
actual app. Create an account, subscribe to a subject (it'll use
Modem Pay's mock mode — a "Simulate successful payment" button instead
of a real charge), and try the study session.

The AI tutor, quiz, and reports will show clearly-labelled placeholder
text until you add a real `ANTHROPIC_API_KEY` to `wassce-server/.env`
(get one at console.anthropic.com) and restart the backend window.

## Changing the subscription price

The 10 GMD price isn't hardcoded — it's a database setting you can
change without touching any code:

1. In `wassce-server/.env`, set `ADMIN_SECRET` to any long random
   string, then restart the backend window (Ctrl+C, then `npm run dev`
   again).
2. In the app, click **Settings** (bottom-right), scroll to
   "Subscription price (admin)", enter that same secret, type the new
   price, and click **Update price**.
3. It takes effect immediately — no restart needed for this part,
   only for setting `ADMIN_SECRET` itself the first time.

If `ADMIN_SECRET` is left blank, price changes are disabled entirely
(not silently open to anyone) until you set one.

## If something goes wrong

- **Browser shows nothing / connection refused at :5173** — check
  terminal window 2 is still open and didn't show an error.
- **Login/signup fails with a network-style error** — check terminal
  window 1 (the backend) is still running, and that the app's
  Settings panel shows `http://localhost:3001` as the backend URL.
- **Both windows show streams of text but no errors, and both "listening"
  lines appeared** — the app should work; the most common remaining
  snag is Windows Defender Firewall prompting to allow Node.js the
  first time it opens a port. If a firewall popup appeared and you
  dismissed it, allow Node.js access on Private networks and restart
  both servers.
