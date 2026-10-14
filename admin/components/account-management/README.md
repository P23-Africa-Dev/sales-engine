# Account Management

This client-side demo presents one mock business per account. Account data, credentials, edits, additions, filters, and sign-in context live in React state and reset when the view remounts or the page reloads. There are no backend or AI calls.

## UI conventions

Retain the dashboard’s dark teal shell and mint primary actions. The business directory uses a white table surface, quiet borders, clear numeric columns, and labeled status pills. A pale detail panel shows the selected business; its prospect total uses a dark teal inset. Mint row highlighting identifies selection. Keep visible labels, keyboard-accessible business buttons, focus treatments, and status/error announcements when extending the view.

## Directory and account context

- Search matches business name, owner, and username without case sensitivity. Industry, prospect-pool range, and status filters combine; pool ranges are under 1,000, 1,000–2,999, and 3,000 or more.
- Pagination shows six businesses per page. Changing a filter returns to page one; Clear filters restores the current account scope.
- Selecting a row changes the detail panel only. Selection may remain visible in the panel even when filtering hides its row.
- Signing in sets the active account, selects its business, and resets filters. Summary totals, status counts, and directory rows then use that account’s single business. Return to all accounts clears active scoping and resets filters.
- Use the selected business’s displayed username and seeded password `Demo123!` to try sign-in. Credentials are matched exactly. Newly created or edited accounts use the credentials saved in the form. This is demo context switching, not production authentication.

## Create and edit

Add business opens the creation drawer; either edit control opens it with the selected business’s values. The form covers business name, industry, country, owner, username/email, password and confirmation, setup scope, and starting prospect pool. Successful creation selects the new Active business and returns to the full directory. Editing preserves its existing status and creation date.

Browser validation requires the labeled text and credential fields, an email-formatted username, passwords of at least eight characters, and a prospect pool from 0 through 1,000,000. The form also checks matching passwords and case-insensitive username uniqueness, excluding the account being edited. Business name, username, and owner are trimmed before saving.

The setup assistant is deterministic: it fills a blank username from the business name and sets the pool to 1,250 for Logistics or 500 otherwise. It never contacts an AI service. Review its suggestions before saving. Cancel, the close control, or Escape dismisses the drawer without saving; modal dialogs restore focus when closed.

## Responsive behavior

Keep the table inside its horizontal scrolling container so columns remain readable on narrow screens; at 480px and below the table has a 510px minimum width. At 800px and below, the detail panel stacks beneath the directory and search/filter controls wrap. The detail panel retains a compact two-column internal layout for the business identity and prospect total.
