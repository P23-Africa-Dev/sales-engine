# Field Activity Timeline — Daily Journey

Enterprise Daily Journey system built on top of Field Activity Intelligence. Extends attendance-bound field sessions into a replayable working-day experience for managers and agents.

## Architecture

```
Clock In → FieldActivitySession (day)
         → GPS points (sampled ingest)
         → Stop detection / classification
         → FieldDailySummary (EOD)
         → Journey APIs (list / detail / timeline / route)
         → Workforce Journey History + Full Journey View
         → ELY tools (field.journey_history / field.journey_detail)
```

One journey = one `field_activity_sessions` row for a working day (attendance-linked).

## Journey lifecycle

1. Agent clocks in with Field Activity enabled → session starts.
2. GPS points persist; stops detected after dwell threshold.
3. Stops auto-match CRM / org locations where possible; unknowns classified by agent.
4. Clock out / EOD → session completed + daily summary.
5. Managers/agents open Journey History → View Journey → full-day replay.

## APIs

### Management

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/field-activity/agents/{agent}/journeys` | List journeys (preset / from-to) |
| GET | `/field-activity/journeys/{session}` | Full journey (timeline, stats, downsampled route) |

### Agent

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/agent/field-activity/journeys` | Own journey history |
| GET | `/agent/field-activity/journeys/{session}` | Own journey detail |

Query params: `company_id`, `preset` (`today|this_week|last_week|last_30_days|last_90_days`), `from`, `to`, `per_page`, `include_route`, `include_timeline`.

Route geometry is downsampled (max ~800 points) for map performance. Raw points remain in `field_location_points`.

## Backend services

- `FieldJourneyService` — list cards, detail, timeline events, route geometry, neighbor-day navigation, playback-ready metadata.
- Existing Field Activity services unchanged (session, movement, stop detection, CRM bridge, EOD summary).

## ELY tools

- `field.journey_history` — list structured journeys for an agent/date range.
- `field.journey_detail` — timeline + stats for one day (no raw GPS dump).

Agents are scoped to self; managers can query any company agent.

## Frontend

### Management (Workforce → Attendance)

- `JourneyHistoryPanel` under Attendance History (same card pattern).
- Full page: `/operations/journeys/[sessionId]` — left timeline, center map, right stats, prev/next day.
- Map Clocked-In panel links to Journey History via Workforce attendance.

### Agent web

- Same panel on agent attendance view (`mode=mine`).
- Full page: `/agent/operations/journeys/[sessionId]`.

### Agent PWA

- `/field-activity/journeys` list + `/field-activity/journeys/[id]` timeline detail.
- Entry from Field Activity header.

## Permissions

- Managers (`owner|admin|supervisor`): any agent in company.
- Agents: own journeys only.
- Feature gated by existing `companies.field_activity_enabled`.

## Performance notes

- List APIs use session + summary aggregates (not raw GPS).
- Detail route is downsampled; optional `include_route=false` for ELY/list-adjacent calls.
- Indexes already present on session/user/date and location points by session.

## Playback readiness

Detail payload includes:

```json
{
  "playback": {
    "supported": true,
    "point_count": 120,
    "duration_seconds": 28800,
    "speeds": ["1x", "2x", "4x"]
  },
  "route": { "coordinates": [...], "timestamps": [...] }
}
```

Animated scrubber can be added later without schema changes.

## Tests

`php artisan test --filter=FieldJourneyApiTest`

Covers management list/detail, agent own-only access, and management-route forbid for agents.

## Deploy / rollback

1. Deploy backend + frontend (no new migrations required for Journey layer).
2. Ensure Field Activity migrations already applied and feature enabled per company.
3. Rollback: remove Journey routes/UI; underlying Field Activity tables remain intact.

## Enablement checklist

- [ ] `field_activity_enabled = true` for company (Insight settings).
- [ ] Agents clock in via Capacitor/PWA with location permission.
- [ ] Open Workforce → Attendance → select agent → Journey History → View Journey.
- [ ] Ask ELY: “Show John’s journey yesterday.”
