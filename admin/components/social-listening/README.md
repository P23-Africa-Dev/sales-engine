# Admin social listening

Route: `/sales-engine/social-listening`. The shared navigation links to it.

This is a cross-business oversight workspace. Client account identities and prospect companies come from the existing Smart Leads fixtures. Social excerpts, intent scores, review decisions, scan history, and settings are illustrative fixtures in `lib/social-listening.ts`; they are not fetched from either sales-engine project.

## Views

- **Overview:** scoped monitoring counts and four animated analytics charts: capture trends (7/14 days), source distribution, stacked client review status, and buying-stage mix with average intent scores. Client bars open their business workspace. Charts use the same signals as the portfolio and review queue, with keyboard inspection and expandable data tables. The date range ends at the 09 Oct 2026 fixture snapshot; capture dates are illustrative and include zero-activity days. Approved trend values describe current review status grouped by capture date, not historical approval events. Animations begin when each chart scrolls into view and replay on re-entry, while respecting reduced-motion preferences. Line points, source segments, client bars, and buying stages expose hover/focus tooltips with exact values.
- **Businesses:** searchable business selector, ICP summary, monitoring configuration, recent evidence, pause/resume, and manual scan queueing.
- **Signal review:** cross-business search, source/status filters, pagination, CSV export, bulk review, and an evidence drawer. Approve, suppress, and return-to-review actions require a reason.
- **Scan operations:** per-source run summaries, run history, failure diagnostics, and retry queueing. Paused clients and clients with queued runs cannot queue another scan.
- **Activity log:** fixture history and admin actions performed during the current session, scoped to the selected business.

Configuration edits control enabled sources, keywords, cadence, minimum score, freshness, and client CRM destination. They describe future scan behavior and do not retroactively remove captured evidence. Source summaries reflect fixture run history, not a live provider check.

All mutations use React state and reset on refresh. Queued scans remain queued because no worker is connected. Review approval records an admin quality decision; it does not create a CRM record or send outreach. Native dialogs provide focus containment, Escape dismissal, and focus restoration.

No API, authentication, provider, or CRM integrations are included. Before integration, business scoping and admin authorization must also be enforced by the backend; the UI scope selector is a display filter.
