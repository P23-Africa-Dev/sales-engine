# Admin CRM

Route: `/sales-engine/crm`. The shared desktop/mobile navigation links to it.

This is a platform admin oversight workspace across client businesses. It does not provide client outreach execution. All values and mutations are illustrative. No API calls, authentication, CRM connectors, live notifications, or outbound messages are added.

## Views and interactions

- **Overview:** scoped workspace count, estimated open value, closed win rate, flagged-record count, portfolio health, and four analytical charts. The line/area chart groups record creation by day; its second series is the subset currently open, not historical stage transitions. The source donut shows acquisition channels. Stage bars show the current open-record distribution, not funnel conversion. Paired client bars compare open pipeline and closed-won values. All values use EUR without conversion.
- **Client pipelines:** inspect each client’s six-stage pipeline, assignments, stale records, and attention items. Stage cards filter the registry to that client and stage. Per-client review policy controls the stale-deal threshold.
- **Records:** searchable registry with stage/source/active/archive filters, sorting, pagination, record drawers, filtered CSV export, and bulk archive/restore. Select-all applies to every filtered record, including other pages; its selected count remains visible.
- **Data quality:** unassigned records, missing contact emails, and one explicitly seeded duplicate pair. Counts reflect flagged records once. Compare duplicates within the same client and dismiss a flag with a reason; this retains both records and does not merge them.
- **Activity log:** outstanding client follow-ups, an overdue-only filter, and scoped admin audit history. Marking a follow-up complete records a demo decision and removes its scheduled due date.

Drawer actions support assignment to that client’s fixture team, stage/email corrections, review notes, reversible archive/restore, duplicate review, and follow-up completion. Corrections and management actions require a reason. Notes survive subsequent field corrections. Native dialogs trap focus, restore focus, and close with Escape.

Charts animate when each panel enters the viewport and replay on re-entry. Hover and keyboard focus reveal exact counts/value tooltips. Data tables provide an alternative to charts; reduced-motion preferences disable chart motion.

## Data and definitions

`lib/admin-crm.ts` builds 24 sample records from existing Smart Leads business/prospect identities. Contact emails use example.com. The fixture snapshot is 13 Oct 2026; future and historical due dates are relative to it. Audit action timestamps use Africa/Lagos. Refresh resets all demo edits, notes, flags, policies, and audit additions.

- Open: active records excluding Won and Lost.
- Closed win rate: Won / (Won + Lost), or zero with no closed records.
- Overdue: open records with a due date before the snapshot; due-today records are not overdue.
- Stale: open records updated before the selected client’s threshold date.
- Quality: active records missing an owner/email or carrying an unresolved duplicate flag; archived records are excluded.

The UI scope selector is a display filter. Backend authorization, tenant scoping, API mappings, supported stage/currency configuration, duplicate rules, persistence, and real contact data validation are future integration work. This prototype keeps stage definitions fixed while allowing per-client admin review policy changes.

## References

Product structures were inspected in the local Sales Engine client CRM types (leads, pipeline, assignee, notes, activities) and Factory 23/base23 lead fixtures. Admin data quality patterns were informed by [HubSpot duplicate review](https://knowledge.hubspot.com/records/manage-duplicate-records) and [data model health checks](https://knowledge.hubspot.com/data-management/use-the-data-model-health-check); their product permissions and subscription behavior are not implemented here.

## Validation

Production build and TypeScript passed. Browser checks covered record corrections, notes preserved after correction, quality-count updates, archive/restore, scoped audit history, duplicate flag dismissal, stale-deal policy changes, stage drilldown, CSV export, and follow-up completion. Overview captures were inspected at 1440px desktop and 390px mobile. Impeccable detector returned no findings; independent finish-review disposition: ship.
