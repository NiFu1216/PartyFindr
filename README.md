# PartyFindr

Find local self-hosted parties near you. Plain HTML/CSS/JS frontend + Node.js/Express backend with SQLite + JWT auth.

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000

## Files

- `server.js` — Express backend, SQLite database, JWT auth, REST API
- `public/index.html` — single-page HTML shell with `<template>` pages
- `public/style.css` — all styling (dark, pink/purple theme)
- `public/index.js` — frontend logic: hash router, Leaflet map, page rendering
- `public/api.js` — tiny `fetch()` wrapper that adds the JWT token
- `partyfindr.db` — SQLite database (created automatically on first run)

## Features

- Email + password registration with date-of-birth age verification (16+) and checkbox attestation
- JWT session tokens stored in `localStorage`
- Leaflet + OpenStreetMap interactive map (no API key required)
- Open-Meteo weather badges per party (no API key required)
- Nominatim/OpenStreetMap reverse geocoding for party location names (no API key required)
- Host parties by clicking on the map; set capacity and age range
- Click a party marker → "Attend party" button (enforces capacity & age range)
- Manage your hosted parties in the SPA with edit and delete actions
- Profile page lists parties you've joined
- All page loads done asynchronously via `fetch()` (AJAX)

## Second frontend component

`public/host-dashboard.html` with `public/host-dashboard.js` is a separate host-facing frontend. It communicates with `/auth/me`, `/parties`, `/parties/:id`, `PUT /parties/:id`, and `DELETE /parties/:id`.

## API endpoints

| Method | Path                     | Auth | Description                |
|--------|--------------------------|------|----------------------------|
| POST   | /auth/register           | no   | Create account             |
| POST   | /auth/login              | no   | Log in                     |
| GET    | /auth/me                 | yes  | Current user               |
| GET    | /parties                 | no   | List all parties           |
| GET    | /parties/:id             | no   | Get one party              |
| POST   | /parties                 | yes  | Create a party             |
| PUT    | /parties/:id             | yes  | Update a hosted party      |
| DELETE | /parties/:id             | yes  | Delete a hosted party      |
| POST   | /parties/:id/attend      | yes  | Join a party               |
| GET    | /me/attended             | yes  | Parties you joined         |

Set the JWT secret in production via `JWT_SECRET` env var.
