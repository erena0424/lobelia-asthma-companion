# Google Calendar integration

Backend holds OAuth refresh tokens (option B). At forecast time, tomorrow's **structured** events are fetched and passed to the LLM.

## Google Cloud setup (free)

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick an existing one).
3. **APIs & Services → Library** → enable **Google Calendar API**.
4. **APIs & Services → OAuth consent screen**
  - User type: **External** (for personal Gmail testing)
  - App name: Mirror Lake
  - Add scope: `.../auth/calendar.events.owned.readonly` (read events on calendars the user owns; narrowest scope that covers the feature)
  - Add your Google account as a **test user**
5. **Credentials → Create credentials → OAuth client ID**
  - Application type: **Web application**
  - Authorized redirect URIs:
    - `http://127.0.0.1:8000/v1/calendar/callback`
6. Copy Client ID + Client Secret into `asthma-app/.env`:

```bash
GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:8000/v1/calendar/callback
# Prefer the API landing page so OAuth works without Vite on :5173
GOOGLE_OAUTH_FRONTEND_REDIRECT=http://127.0.0.1:8000/v1/calendar/oauth-done
# Or with frontend running: http://127.0.0.1:5173/Mirror-Lake/#/profile
```

1. Restart API:

```bash
cd asthma-app
docker compose up -d --force-recreate api
# or: ./run_docker.sh up
```

## What the API does


| Step             | Endpoint                                                                      |
| ---------------- | ----------------------------------------------------------------------------- |
| Check status     | `GET /v1/calendar/status`                                                     |
| Start OAuth      | `GET /v1/calendar/connect` (alias: `/v1/calendar/auth-url`) → open `auth_url` |
| Google redirects | `GET /v1/calendar/callback` (stores refresh token)                            |
| Preview events   | `GET /v1/calendar/events?date=YYYY-MM-DD` or `?from=&to=` (month range) |
| Forecast         | `POST /v1/forecast` / `POST /v1/forecasts/today` auto-fetches **tomorrow** events → LLM |
| Disconnect       | `DELETE /v1/calendar/disconnect` (revokes the token at Google, then clears it) |


Dev without Google: `POST /v1/calendar/manual-events` or pass `calendar_events` on forecast.

## Event shape (LLM input)

```json
{
  "id": "abc",
  "title": "Outdoor soccer",
  "start": "2026-07-17T09:00:00-05:00",
  "end": "2026-07-17T10:30:00-05:00",
  "all_day": false,
  "location": "Madison park",
  "description": "Scrimmage",
  "status": "confirmed",
  "html_link": "https://..."
}
```

