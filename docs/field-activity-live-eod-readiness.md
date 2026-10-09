# Field Activity Live Map + EOD Pile — Production Readiness Checklist

Use this checklist after deploy. Do **not** require production credentials for engineering verification; pair with staging when possible.

## Lifecycle metrics to watch (logs)

Search application logs for:

- `field_activity.lifecycle.session_started` — clock-in created/reused session (+ `seed_point_persisted`)
- `field_activity.lifecycle.points_ingested` — GPS batch accepted (`persisted_count`)
- `field_activity.lifecycle.session_completed` — manual or auto clock-out (`unknown_stop_count`)
- `field_activity.lifecycle.auto_clock_out_hook` / `attendance_clock_in_hook` — attendance bridge
- `field_activity.live.hydrated` — management live hydrate served (`agent_count`, `route_point_count`)
- `field_activity.realtime_publish_failed` — WS publish errors (should stay rare)

## Management map

1. Enable Field Activity for the company.
2. Agent clocks in from PWA/APK/web.
3. Open `/map` → **Clocked In**.
4. Confirm agent pin appears; after movement uploads, **route polyline** grows.
5. After a ≥15 min dwell, a **stop marker** appears (or after hydrate refresh).
6. **Follow agent** keeps the camera on that agent.
7. **Follow all** auto-fits when multiple agents are active.
8. **Focus** hides left chrome; **Exit focus** restores it.
9. Agent clocks out → pin/trail leave live set; journey appears under Operations → Agent → Journey History.

## Agent EOD + pile

1. Manual clock-out opens **Day Review** (PWA and web agent attendance).
2. Classify a stop → pending count decreases.
3. **Pile for later** dismisses review; **Review inbox** badge remains until classified.
4. Multi-day pending sessions remain in inbox across days.
5. Soft banner appears next day when there is backlog and no active session.
6. Auto clock-out at closing time still ends the session and leaves pending stops in inbox.

## Tracking health signals

- Active sessions without `last_recorded_at` growth for >15 minutes while clocked in → background GPS issue (APK battery / permission).
- Live hydrate `agent_count` > 0 but empty `route.point_count` → points not persisting (check reporter + seed point).
- `field_activity.location` events present in Redis/WS relay but map trail static → frontend WS handler / store issue.
