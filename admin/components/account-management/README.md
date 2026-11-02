# Account Management

Platform admin directory of Sales Engine organizations. Data loads from `/api/v1/admin/organizations` (Sanctum platform-admin token). Creating an account invites the owner by email; passwords are never returned or stored in plaintext on this screen.

## UI conventions

Retain the dashboard’s dark teal shell and mint primary actions. The business directory uses a white table surface, quiet borders, clear numeric columns, and labeled status pills. A pale detail panel shows the selected business; its prospect total uses a dark teal inset. Mint row highlighting identifies selection.

## Directory

- Search matches organization name and owner email. Industry, prospect-pool range, and status filters combine.
- Pagination is server-driven (six per page by default).
- Deep-link: `/sales-engine/account-management?organization_id={id}` selects that org when present.
- Impersonation / demo client sign-in is out of v1.

## Create and edit

Create requires name + owner email (invitation). Edit can change name, industry, country, scope, and status (status changes require a reason → audit). Setup assistant remains local heuristics only.
