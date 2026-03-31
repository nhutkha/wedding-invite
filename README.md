# Wedding Invite Fullstack

React + Vite frontend with Express backend. Data is persisted with PostgreSQL in production (SQLite fallback for local if `DATABASE_URL` is not set).

Current frontend mode renders the localized Template 42 file (`web/public/template42-localized.html`) and includes a dedicated setup page for non-technical users.

## How To Change Text And Images

### Easiest Way (Dedicated Setup Page)

1. Start both apps:

```bash
npm run dev
```

2. Open setup page:

- `http://localhost:5173/setup`

3. In the setup UI:

- Choose `Text` or `Image` tab.
- Click an item from the left list or click directly on the preview canvas.
- Edit value in the Inspector panel.
- For images, you can upload directly from Inspector (auto-saved into `web/public/custom-assets/`).
- Click **Luu thay doi**.

4. Open preview page:

- `http://localhost:5173`

### Advanced Way (JSON + Script)

Use the local customization config so you do not have to edit the giant HTML manually.

1. Edit `scripts/template42-customize.json`:
- `textReplacements`: replace old text with new text.
- `assetReplacements`: replace old image path with your local image path.
- Put your new images in `web/public/custom-assets/` and use paths like `/custom-assets/your-file.jpg`.

2. Run:

```bash
npm run customize:template42
```

3. Start app:

```bash
npm run dev
```

Notes:
- If you want strict matching (fail when old text/path is not found), set `"strict": true`.
- Replacement is direct string matching, so `from` must match exactly what is currently in `web/public/template42-localized.html`.

## Quick Start

1. Install dependencies in each app (already installed if you follow the implementation flow):

```bash
npm install
npm install --prefix web
npm install --prefix server
```

2. Run both web and API in parallel:

```bash
npm run dev
```

3. Open the app:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`

## Exact Template 42 Mirror

- Source mirror file: `web/public/template42.html`
- This file includes a `<base href="https://cinelove.me/" />` so original template assets/scripts resolve correctly.
- Frontend currently displays only this mirrored template for visual parity.

## Environment Variables

- Frontend: copy `web/.env.example` to `web/.env`
- Backend: copy `server/.env.example` to `server/.env`
- For persistent production data, set `DATABASE_URL` (PostgreSQL connection string)

## API Routes

- `GET /api/health`
- `GET /api/invitation/:slug`
- `GET /api/wishes?slug=...`
- `POST /api/rsvp`
- `POST /api/wishes`
- `POST /api/gifts`
- `POST /api/analytics/events`
- `GET /api/template42/setup/config`
- `GET /api/template42/setup/snapshot`
- `POST /api/template42/setup/upload`
- `POST /api/template42/setup/apply`
- `POST /api/template42/setup/reset`
- `GET /api/template42/editor/items`
- `POST /api/template42/editor/apply`

## Backend Note

- Backend API and SQLite persistence are still available from previous implementation.
- They are not used by the mirror page in current exact-clone mode.

## Deploy To Firebase Hosting (Easiest)

This project now includes a one-command deployment helper.

### 1. Prepare once

Install Node.js LTS and login to Firebase account when prompted.

### 2. Deploy with one command

From project root:

```bash
npm run deploy:firebase -- -ProjectId YOUR_FIREBASE_PROJECT_ID -ApiBaseUrl https://YOUR_BACKEND_DOMAIN/api
```

If you do not have a public backend yet, you can still deploy frontend only:

```bash
npm run deploy:firebase -- -ProjectId YOUR_FIREBASE_PROJECT_ID
```

### What the script does

- creates/updates `web/.env.production`
- installs dependencies
- builds `web/dist`
- writes Firebase project id to `.firebaserc`
- runs Firebase login
- deploys Hosting

### Files added for deploy

- `firebase.json`
- `.firebaserc`
- `.firebaseignore`
- `scripts/deploy-firebase.ps1`
- `web/.env.production.example`

## One-Click Fullstack Deploy (Frontend + Backend together)

This repo supports single-service deployment on Render Free.

### What you click

1. Push this repo to GitHub.
2. Open this URL (replace `YOUR_GITHUB_USERNAME` and `YOUR_REPO_NAME`):

```text
https://render.com/deploy?repo=https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME
```

3. Click **Deploy**.

Render reads `render.yaml`, provisions a PostgreSQL database, builds frontend (`web/dist`), starts backend, and serves both from one domain.

### Result

- Website: `https://YOUR-SERVICE.onrender.com`
- API: `https://YOUR-SERVICE.onrender.com/api`

No Firebase step is required in this one-click mode.

### Important note about free tier

- RSVP/wishes/gifts now persist on PostgreSQL in Render (via `DATABASE_URL`) so data does not reset like local SQLite.
- If your Render account cannot create free PostgreSQL in Blueprint, create a free DB on Neon/Supabase and set `DATABASE_URL` manually in Render service environment.
