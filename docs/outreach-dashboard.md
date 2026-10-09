# Outreach dashboard

The dashboard at `/sales-engine` implements Figma frame `3294:2827`.
Business rows support mouse, Enter, and Space selection. Selection updates the
company, sent emails, prospects, and completed follow-ups in Activity Overview.
Hover styling does not change the selected record. Both tabs have searchable rows.

## Integration status

Existing Sales Engine client integration includes:

- `GET /metrics`: discovery, pending review, CRM, qualified leads, cached companies,
  outreach drafts, and pipeline counts.
- `GET /outreach/recent`: recent activities with channel, preview, dates, and delivery status.
- Pending-review leads: company/person discovery results.

These responses do **not** expose the complete dashboard contract: lifetime
email/SMS/in-person totals, received messages, completion percentages, business
industry/country/account owner/creation details, or per-business sent emails,
prospect counts, and completed follow-ups. The API audit is based on the existing
client and checked-in documentation; it does not assert that unpublished server
endpoints are unavailable.

## Temporary demo data

`data/outreach-dashboard.json` holds the metric array, four business examples,
four outreach examples, and per-business activity values. The 200 badges are
design sample aggregate counts, not the lengths of the four example arrays.
Sample data is labelled below the panel. It does not create records, send
outreach, or overwrite API responses.

`NEXT_PUBLIC_OUTREACH_DASHBOARD_DATA=demo` is the temporary default.
Set `NEXT_PUBLIC_OUTREACH_DASHBOARD_DATA=live` and restart/rebuild to use the
existing activity and company pending-lead integrations. Unsupported live
statistics show an em dash; network failures never fall back to sample data.
The rest of Sales Engine keeps its existing API integrations in either mode.

Before removing demo mode, implement the dashboard response described by
`OutreachDashboardData` in `lib/outreach-dashboard.ts`, then map it into
`OutreachDashboardView`. A recent-feed length must not be used as a lifetime
outreach total, and global metrics must not be presented as per-business values.
