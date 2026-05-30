# Vercel Environment Variables

Vercel is the source of truth for this project's environment variables.
Do not commit real secrets, and do not manage production values in local `.env`
files.

## Required

Set these in Vercel Project Settings > Environment Variables for Production,
Preview, and Development as needed.

```env
GEMINI_API_KEY=
GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_ID=
ALLOWED_ORIGINS=
```

- `GEMINI_API_KEY`: Server-side Gemini API key.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID used by the API to verify ID tokens.
- `VITE_GOOGLE_CLIENT_ID`: Google OAuth client ID exposed to the Vite client.
- `ALLOWED_ORIGINS`: Comma-separated allowed frontend origins, for example `https://your-app.vercel.app`.

`GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` must match. If they differ, login
can succeed in the browser while API requests fail token verification.

## Optional

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Set these when rate-limit and daily-usage counters need to be shared across
serverless instances. Without them, the API falls back to in-memory limits.

## Local Development

Use Vercel as the source and pull values into a local ignored file only when
needed:

```bash
vercel env pull .env.local
npm run dev:vercel
```

Vite also reads `.env.local` for local frontend development. The file is ignored
by git through the existing `*.local` rule.

## Build Guard

`npm run build` runs `scripts/verify-vercel-env.js` first. The guard only fails
inside Vercel builds, where `VERCEL=1`, so normal local builds still work without
production secrets.
