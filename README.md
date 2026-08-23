# Dartmania

Dartmania is a touchscreen-friendly darts scoring app for home or bar play.
It supports creating games, recording throws, undoing throws, ending games,
and browsing/deleting game history.

## Features

- Create a game with up-to 8 players and options (mode, format, rounds, double-out)
- Record throws and keep live scores
- Undo the last throw
- End a game and review history

## Build and Run (Docker)

Build the image locally and run it:

```
docker build -t dartmania .
docker run --rm -p 8003:8003 -v dartmania-data:/data dartmania
```

The app listens on http://localhost:8003.

## Build and Publish (GHCR)

The production compose file uses the pre-built image from GHCR
(`ghcr.io/szkly/dartmania`). To publish a new image:

1. Log in to GHCR (requires a GitHub token with `write:packages` scope):

   ```
   echo "$GITHUB_TOKEN" | docker login ghcr.io -u szkly --password-stdin
   ```

2. Build the image, tagging it as `latest` and with the release version:

   ```
   VERSION=1.0.7
   docker build -t ghcr.io/szkly/dartmania:latest -t ghcr.io/szkly/dartmania:$VERSION .
   ```

3. Push both tags:

   ```
   docker push ghcr.io/szkly/dartmania:latest
   docker push ghcr.io/szkly/dartmania:$VERSION
   ```

   For ARM hosts (e.g. DietPi on Raspberry Pi), build and push multi-arch
   instead:

   ```
   docker buildx build \
     -t ghcr.io/szkly/dartmania:latest \
     -t ghcr.io/szkly/dartmania:$VERSION \
     --push .
   ```

4. On the target host, pull and restart:

   ```
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

## Production (Docker Compose)

Uses the pre-built image from GHCR (`ghcr.io/szkly/dartmania`), no local build needed:

```
docker compose -f docker-compose.prod.yml up -d
```

Update to the latest image:

```
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Pin a specific version instead of `latest`:

```
DARTMANIA_TAG=1.0.6 docker compose -f docker-compose.prod.yml up -d
```

## Two Instances Side-by-Side

Two independent games on one screen: the kiosk compose file runs two
containers (ports 8003 and 8004, separate database volumes):

```
docker compose -f docker-compose.kiosk.yml up -d
```

The app ships `public/kiosk.html`, which shows both instances side by side in
a single window (served at `/kiosk` too):

```
google-chrome --kiosk http://localhost:8003/kiosk
```

Ports/hosts are configured at the top of `public/kiosk.html` if needed.

On DietPi: install Chromium via `dietpi-software`, select it in
`dietpi-autostart` (kiosk mode) and set `http://localhost:8003/kiosk`
as the kiosk URL. No window management needed - the split happens inside
the page.

## Simple Architecture

- Node/Express server serves the static UI from `public/`
- REST endpoints under `/api` manage game state
- SQLite database stored at `DB_PATH` (default `/data/dartmania.sqlite`)

## Screenshots

![Main screen](screenshots/1.png)
![Game setup](screenshots/2.png)
![In-game scoring](screenshots/3.png)
![Round details](screenshots/4.png)
![History](screenshots/5.png)
![Player stats](screenshots/6.png)
![Checkout options](screenshots/7.png)
![Winner screen](screenshots/8.png)
