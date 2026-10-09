# Map: Route History Panel (Disabled)

## Request

On `/map`, clicking an agent in the **Live Feeds** sidebar (especially under **Tracking history**) previously opened two UI surfaces:

1. **Active Agent Command Panel** — agent/task summary with follow controls (kept).
2. **Route History panel** — right-side slide-in with route playback, timeline, and legend (disabled).

Product asked to **hide the Route History panel** while keeping all other selection behavior (map focus, command panel, feed highlight, etc.). The implementation should remain easy to restore if the feature is requested again.

## What was changed

### 1. `components/map/live-feeds-panel.tsx`

**Tracking history** agents (the collapsed “Tracking history (N)” section at the bottom of Live Feeds) now use the same click handler as active agents: `onSelectTask(task.taskId)` only. They no longer call `onViewHistoryTask`.

The legacy `selectHistoryTask` helper is kept (with `onViewHistoryTask` commented out) for easy re-enable.

Previously, history clicks called both `onSelectTask` and `onViewHistoryTask`, which opened route history in addition to the command panel.

### 2. `components/map/map-view.tsx`

Both map provider variants (Mapbox and Google) no longer render `RouteHistoryPanel` when `historyTask` is set. The JSX block is wrapped in a comment referencing this doc.

`handleViewHistoryTask` is a no-op (body commented out) so route history cannot open even if something calls it.

### Left intact (for easy re-enable)

- `historyTask` state and `setHistoryTask`
- `handleViewHistoryTask` callback
- `onViewHistoryTask` prop on `LiveFeedsPanel`
- `RouteHistoryPanel` component and import
- Map marker click → `handleSelectTask` only (never opened route history)

## How to re-enable

1. In `live-feeds-panel.tsx`, restore history-specific handling (e.g. call `selectHistoryTask` or `onViewHistoryTask?.(task)` from tracking history cards).
2. Uncomment `setHistoryTask(...)` in `handleViewHistoryTask` in `map-view.tsx` (both Mapbox and Google).
3. Uncomment the `{historyTask && <RouteHistoryPanel ... />}` blocks in `map-view.tsx` (both Mapbox and Google sections).

No other code changes are required.

## Related files

| File | Role |
|------|------|
| `components/map/live-feeds-panel.tsx` | Feed click → `selectHistoryTask` |
| `components/map/map-view.tsx` | `handleViewHistoryTask`, panel render |
| `components/map/RouteHistoryPanel.tsx` | Route history UI |

## Date

August 31, 2026
