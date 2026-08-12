# Conduit Game

Three.js/WebGPU prototype for Conduit plus a small Early Access web frontend.

## Install

```bash
bun install
```

## Run Game Dev Client

```bash
bun run dev
```

This starts the existing game prototype through Bun's dev server.

## Run Early Access Server

```bash
bun run dev:server
```

Default URL:

```text
http://localhost:8787/
```

Routes:

```text
/              Public frontend, login/register, profile, showcase
/admin         Admin-only showcase CMS page
/game          Redirects to the configured game client URL
/api/health    Server health check
```

Local development uses two processes:

```bash
bun run dev          # game client on http://localhost:3000/
bun run dev:server   # frontend/backend on http://localhost:8787/
```

`/game` redirects to `http://localhost:3000/` by default. For deployment or another local port, set:

```bash
CONDUIT_GAME_URL=https://example.com/game bun run server
```

## Server Config

Default config:

```text
config/server.config.json
```

The config controls:

```text
server.host
server.port
server.publicBaseUrl
game.launchUrl
storage.databasePath
storage.uploadDir
storage.uploadPublicPath
frontend.dir
frontend.publicDir
auth.registrationEnabled
auth.sessionDays
cms.seedDefaultMedia
cms.maxUploadBytes
```

For deployment, either edit `config/server.config.json` or point the server to another file:

```bash
CONDUIT_CONFIG=/opt/conduit/server.config.json bun run server
```

Environment variables still override the JSON config:

```text
HOST
PORT
CONDUIT_PUBLIC_BASE_URL
CONDUIT_GAME_URL
CONDUIT_DB_PATH
CONDUIT_UPLOAD_DIR
```

The server uses SQLite through Bun's built-in `bun:sqlite`.

Local runtime data:

```text
data/conduit.sqlite
public/uploads/
```

Both are ignored by git.

## Admin CMS

Registered accounts are always created with the `player` role. Admin access is assigned explicitly in the SQLite database.

Example:

```bash
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('data/conduit.sqlite'); db.query(\"UPDATE users SET role = 'admin' WHERE email = ?\").run('admin@example.com');"
```

Admin users can open `/admin`, upload images/videos, create showcase entries, edit existing entries, delete entries, and publish/unpublish items.

Initial CMS scope:

```text
image/video uploads
external media URLs
title
description
sort order
published flag
```

This is intentionally small. It is meant to support an Early Access landing page, not a full content platform.
