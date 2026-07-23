# Madras Walkathon — Complete Session Context

## Project
- **App:** Madras Walkathon Challenge — team-based walkathon event management
- **Frontend:** React/Vite/Tailwind → Firebase: https://madras-walkathon.web.app
- **Backend:** Express/Prisma/PostgreSQL → Render: https://madras-walkathon-api.onrender.com
- **GitHub:** https://github.com/Vishwa310/madras-miles.git
- **Local path:** /Users/epxxvis/projects/walky
- **Last commit:** `472a40c` — "fix: rest day week index uses IST date"

## Event Details
- **Duration:** Jul 15 – Aug 7, 2026 (4 weeks)
- **Teams:** 8 teams × 20 players (15 active + 5 standby)
- **Rules:** Max 7km/day, pace 9-16 min/km, 1 rest day/week, Walk type only
- **Substitution:** 8 credits per team, any player can return, rest day shared per slot

## Current State (as of Jul 22, 2026)
- **147 players assigned** (13 still need re-login for permissions, ~3 not logged in)
- **Event is LIVE** — Week 2 started Jul 22
- **Auto-sync:** Configured (weekly Wed/Fri/Sun at 06:00 IST)
- **Hide activities toggle:** Available (shows "Hold your horses" overlay)

## Key Architecture Decisions

### IST Timezone (CRITICAL)
- Server runs in UTC on Render
- ALL date logic uses IST offset (5.5 * 60 * 60 * 1000 ms)
- Challenge dates, daily cap, rest day, time window, week boundaries — all IST
- Frontend uses `toLocaleDateString('en-CA')` for date matching

### Soft Flags
- Activities stay ACCEPTED, `flagReason` field stores admin alerts
- Players never see flags, only admin in grid/attention center
- Flag types: file upload, pause trick, overlapping activities

### Substitution System
- Credit-based (8 per team), not gender-restricted
- Players go STANDBY (not RETIRED) when subbed out
- `wasPlayerActiveOnDate()` checks sub log timeline for validation
- Rest day is per-slot: `getSlotChain()` follows sub chain

### Scoring
- Leaderboard sort: km desc → fewer activities → fewer sub credits → alphabetical
- Daily cap: 7km (sum of creditedMeters for accepted activities that IST day)
- 0 credited = REJECTED (not accepted)
- Split pace: info-only (no scoring impact, no auto-check during sync)

### Sync
- Per-player sync via `POST /api/sync/player/:id`
- Checkpoint system for resume after failure
- Strava token refresh uses hardcoded credentials + form-urlencoded
- Auto-retry on 401 (refreshes token and retries)
- `approval_prompt=force` on OAuth (ensures activity:read_all scope)
- Rate limit: 3s delay between players in batch
- No auto split check (removed — saves API calls)

## Pages/Features
- **Admin Dashboard:** Leaderboard, stats, date picker (point-in-time), sync button
- **Players & Ops:** Team-grouped table, sync all/selected, sub, status toggle, split audit, unassigned panel
- **Teams:** Team cards with color, active/standby lists, audit log, sub credits
- **Team Grid:** Day × Player grid, per-activity cells, override actions, split chips
- **Attention Center:** Rejected + flagged activities, approve/reject/dismiss, filters
- **Sync Control:** Auto-sync scheduler (hourly/daily/weekly), countdown, sync errors, manual sync
- **Config:** Challenge settings, substitution rules, roster, validation rules table, visibility toggle
- **Player Dashboard:** Greeting, team card, trivia, stats, weekly chart, activities (with frosted overlay when hidden)
- **Activities (player):** Grouped by event weeks (W1-W4)
- **Light/Dark theme** with toggle

## Database (Render PostgreSQL)
- Connection: `postgresql://madras_walkathon_db_user:zunrJkXM8QFxZs8HULpL38jjXsukegga@dpg-d93otn7aqgkc73cd75l0-a.oregon-postgres.render.com/madras_walkathon_db`
- Prisma Studio: `./studio.sh`

## Key Files
- `server/src/services/validation.ts` — All activity validation rules
- `server/src/services/scoring.ts` — Leaderboard computation
- `server/src/services/fraud.ts` — Tier 1 fraud detection
- `server/src/routes/sync.ts` — Sync endpoints + auto-sync + split audit
- `server/src/routes/substitutions.ts` — Sub logic with credits
- `server/src/routes/activities.ts` — Activities API + attention center
- `client/src/layouts/AppLayout.tsx` — Nav, theme toggle, admin/player view
- `client/src/pages/AdminDashboard.tsx` — Main dashboard
- `client/src/pages/PlayerDashboard.tsx` — Player view with overlay
- `client/src/pages/TeamGridView.tsx` — Day grid
- `client/src/pages/PlayersOpsPage.tsx` — Player management
- `client/src/pages/AttentionCenter.tsx` — Flagged/rejected review

## Players Needing Action
### Re-login (permission issue — 401):
Diwahar A K, Jayaprakash B, Karthickbabu M, Mohammed Suhaib, Natarajan Thekkan, Prason Poudel, Priya Sundarraman, Vaisnav M, Venkatesh A (Blue Knights), Chandani Parachuri (Orange Warriors)

### Not logged in:
Mahakrishnan Chinaswamy (Yellow Kings), Suganya Mani (Yellow Kings), Killamsetti Praveen Kumar (Blue Knights), S Raghavan (Orange Warriors)

## Recent Fixes (this session)
1. Split pace rule removed from scoring (info-only now)
2. Daily cap unit mismatch fixed (km vs meters)
3. 0 credited → REJECTED (not accepted)
4. Rest day per-slot (sub chain counted together)
5. Leaderboard sort: km → fewer activities → fewer subs → alphabetical
6. Point-in-time dashboard (date picker with IST-correct filtering)
7. Auto-sync time treated as IST
8. Substitution effective date as IST
9. Week boundary in rest day uses IST
10. Player activities visibility toggle with frosted "Hold your horses" overlay
11. Attention Center with filters + dismiss
12. Grid week separator uses event weeks (not calendar Monday)

## Deploy Commands
```bash
# Frontend
cd client && npm run build && firebase deploy --only hosting

# Backend (auto-deploys on git push)
cd server && npx esbuild src/index.ts --bundle --platform=node --outdir=dist --packages=external --format=cjs
git add -A && git commit -m "message" && git push origin main

# Prisma Studio (prod DB)
./studio.sh
```

## Excel Sheet
- Location: `/Users/epxxvis/projects/walky/Walkathon Nominations 2026_Final.xlsx`
- Columns: Team Name, Signum, Full Name, Gender, Email, Mobile, Strava Link, Strava ID, Matching, Status, Role
- Used for bulk player assignment

## Strava OAuth
- Client ID: 159567
- Client Secret: ba7475e523ff37a35c06bf1fb191a9affeed21f9
- Scope: read,activity:read_all
- approval_prompt: force
- Callback: https://madras-walkathon.web.app/auth/callback
