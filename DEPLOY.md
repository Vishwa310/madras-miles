# Madras Miles — Deployment Guide

## Architecture

- **Frontend**: React/Vite → Firebase Hosting (`https://madras-walkathon.web.app`)
- **Backend**: Express/Prisma → Render Docker (`https://madras-miles-api.onrender.com`)
- **Database**: PostgreSQL on Render
- **GitHub Repo**: `https://github.com/Vishwa310/madras-miles.git`

## Project Paths

- Root: `/Users/epxxvis/projects/walky`
- Frontend: `/Users/epxxvis/projects/walky/client`
- Backend: `/Users/epxxvis/projects/walky/server`

## Deploy Frontend (Firebase)

```bash
cd /Users/epxxvis/projects/walky/client
npm run build
firebase deploy --only hosting
```

Firebase project: `madras-walkathon`
Hosting URL: `https://madras-walkathon.web.app`
Config: `client/firebase.json` (public dir = `dist`)

### Frontend Environment

`client/.env.production`:
```
VITE_API_URL=https://madras-miles-api.onrender.com
VITE_STRAVA_CLIENT_ID=159567
VITE_STRAVA_CLIENT_SECRET=ba7475e523ff37a35c06bf1fb191a9affeed21f9
```

## Deploy Backend (Render)

Render auto-deploys from the `main` branch on GitHub. To trigger a deploy:

```bash
cd /Users/epxxvis/projects/walky
git add -A
git commit -m "your commit message"
git push origin main
```

Render watches the repo and rebuilds automatically when `main` is updated.

### Manual Redeploy (if needed)

Go to https://dashboard.render.com → `madras-miles-api` → **Manual Deploy** → Deploy latest commit

### Render Service Config

| Setting | Value |
|---------|-------|
| Name | `madras-miles-api` |
| Root Directory | `server` |
| Environment | Docker |
| Dockerfile Path | `./Dockerfile` |
| Branch | `main` |

### Render Environment Variables

| Key | Value |
|-----|-------|
| `DATABASE_URL` | PostgreSQL connection string from Render DB |
| `PORT` | `3002` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Random secret (never commit) |
| `STRAVA_CLIENT_ID` | `159567` |
| `STRAVA_CLIENT_SECRET` | `ba7475e523ff37a35c06bf1fb191a9affeed21f9` |
| `STRAVA_REDIRECT_URI` | `https://madras-walkathon.web.app/auth/callback` |
| `CLIENT_URL` | `https://madras-walkathon.web.app` |

## Full Deploy Workflow (Both)

When you make changes to both frontend and backend:

```bash
cd /Users/epxxvis/projects/walky

# 1. Verify code compiles
cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit --skipLibCheck && cd ..

# 2. Commit and push (triggers Render auto-deploy)
git add -A
git commit -m "describe your changes"
git push origin main

# 3. Deploy frontend to Firebase
cd client
npm run build
firebase deploy --only hosting
```

## Frontend-Only Deploy

If you only changed frontend files (`client/src/**`):

```bash
cd /Users/epxxvis/projects/walky/client
npm run build
firebase deploy --only hosting
```

No git push needed for Firebase — it deploys from local build.
Optionally push to keep GitHub in sync.

## Backend-Only Deploy

If you only changed backend files (`server/src/**`, `server/prisma/**`):

```bash
cd /Users/epxxvis/projects/walky
git add server/
git commit -m "backend: describe changes"
git push origin main
```

Render auto-deploys on push. The Dockerfile runs:
1. `npm ci` — install deps
2. `npx prisma generate` — generate client
3. `npx esbuild` — bundle TypeScript
4. On startup: `npx prisma db push` — sync schema → `node dist/index.js`

## Verify Deployment

```bash
# Check backend health
curl https://madras-miles-api.onrender.com/api/health

# Check frontend
curl -s -o /dev/null -w "%{http_code}" https://madras-walkathon.web.app
```

## Strava OAuth Setup

Strava App Settings (https://www.strava.com/settings/api):
- Authorization Callback Domain: `madras-walkathon.web.app`
- Client ID: `159567`

## Rollback

### Frontend
Firebase keeps previous versions. Go to Firebase Console → Hosting → Release history → Roll back to previous.

### Backend
Render keeps previous deploys. Go to Render Dashboard → Events → click any previous deploy → **Rollback**.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Firebase shows old version | Clear browser cache or check `npm run build` output |
| Render build fails | Check Render logs → likely a TS error or missing dep |
| API returns 500 | Check Render logs for stack trace |
| DB schema out of sync | Render auto-runs `prisma db push` on deploy |
| CORS errors | Verify `CLIENT_URL` env var on Render matches Firebase URL |
| Strava login fails | Check callback domain in Strava app settings |
