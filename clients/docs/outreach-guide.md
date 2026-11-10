# Understanding Sales Engine outreach

This guide describes the current implementation. It separates an outreach message from a prospect, a CRM record, and a delivery event, because those are different things in the application.

## 1. What outreach means

Outreach is a message intended for a potential customer. Sales Engine can generate a draft from a prompt or a social signal. A user can review the text, edit it, regenerate it, and send a supported email using a configured sender.

An **outreach activity** is the saved database record for that message. It can exist before anything is sent. A draft appearing in the activities page does not mean the recipient received it.

A **prospect** is a person or business you might contact. Discovery creates company and lead records. Saving a discovered lead to CRM adds pipeline membership; it does not itself send a message. One prospect can have several outreach activities.

An **ICP** is the ideal customer profile: the description of the customers you want. It gives discovery and generated messages their business context.

## 2. The two outreach pages

### Dashboard: `/sales-engine`

This is the overview. It calls `GET /api/v1/outreach/dashboard` and starts on **All Outreach**. You can switch to **All Prospects**.

The response contains:

| Field | Meaning |
| --- | --- |
| `counts.outreach` | Number of saved outreach records, including drafts |
| `counts.businesses` | Number of discovered company records available to this organization |
| `metrics` | API-provided channel totals and supported measurements |
| `businesses` | Company/prospect rows and their overview information |
| `outreach` | Outreach rows with message identity, channel, current status and optional company link |
| `pipelines` | The organization's actual CRM pipelines, used by filtering |
| `defaultBusinessId` | Initial company selection for the prospect view |

The API currently builds the prospect list from company records. Therefore, **44 prospect/company rows does not imply 44 CRM memberships or 44 sent messages**. The company overview's `prospects` value counts leads saved in native CRM for that company. Its `emailsSent` counts associated email records with `sent_at`. Follow-ups come from recorded CRM activities of type `follow_up_completed`.

A row with `businessId: null` is valid. Social outreach, for example, can exist without a linked company. It must be selected by its outreach ID, rather than requiring a company ID.

### Activities: `/sales-engine/outreach`

This is the operational message list. It calls:

`GET /api/v1/outreach/activities?page=1&per_page=10&search=&channel=all&status=all&sort=newest`

It supports server pagination, text search, channel/status filtering, sorting, and API-calculated summary counts. The total can be larger than the number of records on the current page. The list response includes a preview, timestamps, delivery status, failure reason, and optional company/lead links. Opening a record loads its full draft separately.

These pages describe the same underlying `outreach_activities` records. They are two views, rather than two separate stores of messages.

## 3. How to create outreach

1. Define or select an ICP.
2. Discover leads in Smart Leads, or review signals in Social Listening.
3. Use the outreach/message-generation action or ask the assistant to draft a message for the intended prospect.
4. The backend creates one or more saved outreach records. A request targeting multiple leads can create a separate record for each recipient.
5. Review the subject, body, channel and recipient. Regenerate if needed.
6. For email, configure and verify the sender/inbox, then submit the reviewed message.
7. Check the activities page for queued, sent, delivered or failed status.

The generic draft API is `POST /api/v1/outreach/draft`. Its controller validates the prompt, ICP and optional channel/sending options; the draft service resolves target leads and saves the generated messages. Social Listening also has its own signal-to-outreach generation flow, which records `social_signal_id`.

The CRM email panel offers another path: compose a message for a saved CRM lead. `POST /api/v1/crm/leads/{id}/emails` creates an outreach activity and queues the reviewed email. A UUID `request_id` prevents the same compose submission from creating duplicate records when retried.

Generating or saving a draft and sending it are distinct operations. The draft endpoint also supports an explicit send option; ordinary draft generation should not be interpreted as delivery.

## 4. Create, read, update and delete reference

All paths below are relative to `/api/v1` and require the Sales Engine session and organization context.

| Operation | API | Result |
| --- | --- | --- |
| Create draft | `POST /outreach/draft` | Generate and persist draft record(s) |
| Read overview | `GET /outreach/dashboard` | Dashboard rows, counts and metrics |
| Read list | `GET /outreach/activities` | Paginated and filtered records |
| Read latest widget items | `GET /outreach/recent` | Limited recent records; unsuitable for complete list totals |
| Read full message | `GET /outreach/activities/{id}` | Full message body, subject and draft metadata |
| Regenerate | `POST /outreach/activities/{id}/regenerate` | Update the existing message using generation instructions |
| Send reviewed email | `POST /outreach/activities/{id}/send` | Queue the supplied reviewed subject/body and recipient |
| Delete | `DELETE /outreach/activities/{id}` | Remove the saved record; cannot recall an already delivered email |
| Read sender settings | `GET /outreach/sender-settings` | Current sender configuration |
| Update sender settings | `PUT /outreach/sender-settings` | Save sender configuration |
| CRM email history | `GET /crm/leads/{id}/emails` | Outgoing messages linked to a native CRM lead |
| Compose CRM email | `POST /crm/leads/{id}/emails` | Save and queue a reviewed message |

There is no generic draft-update PATCH endpoint in this flow. Regeneration updates the saved draft; sending accepts the user's reviewed subject/body. Read the response and refetch the list rather than assuming that any local text edit has been persisted.

## 5. What View Full Activity now shows

The earlier dashboard dialog contained static examples such as “Email Opened,” “Link Clicked,” and relative times. Those were UI placeholders and did not come from the API. They have been removed.

For a linked company, the dialog now calls:

`GET /outreach/activities?business_id={companyId}&page=1&per_page=10&sort=newest`

It shows the actual associated records and their current statuses and timestamps, with pagination. For outreach without a company, it calls `GET /outreach/activities/{activityId}` to retrieve the real message; its status/date come from that selected dashboard record.

**This is a record history, not a complete delivery-event timeline.** The current API exposes the latest status and selected timestamps. It does not return a chronological array of every open, click, or delivery attempt. The UI must not invent such events. A complete event timeline would require an additional persisted event model and API.

## 6. Delivery states and counts

- **Draft:** message exists but has not been submitted for sending.
- **Queued:** accepted for processing; a worker still needs to send it.
- **Sent:** submitted to the mail provider. This is not proof of delivery.
- **Delivered:** provider reported delivery.
- **Opened / clicked:** tracking reported engagement; these are not guaranteed to be available for every message.
- **Failed / bounced / dropped / spam:** a failure or provider classification; inspect the failure reason.

In the activities summary, delivered includes records currently marked delivered, opened or clicked. Opened includes opened or clicked. Clicked counts clicked. Failure counts include failed, bounced, dropped and spam. These are counts of records in their current states, not the number of individual webhook events.

Email channel totals include stored `email` and `email draft` records. Draft suffixes are normalized for display and filtering. The dashboard's email total therefore includes drafts; its sent percentage uses sent records. Missing inbound/SMS/in-person measurements must not be treated as proof of zero real-world activity. API `null` means unavailable.

WhatsApp draft generation and email sending are different capabilities. The reviewed sender in the current outreach preview is for email; do not assume a saved WhatsApp draft was delivered through WhatsApp. Verify the specific sending integration and consent requirements before treating it as a supported automatic delivery path.

## 7. Your example response

Your activities response contains four records, all currently marked `delivered`. Its metrics correctly report four total, four delivered and four email records; zero current opens/clicks are recorded.

The first three records have company and lead IDs. Blessing Ibunge's record, ID 16, has neither. It is still a valid outreach record and can be opened using its own activity ID.

The dashboard's 44 company/prospect rows and four outreach records are consistent: discovering a company does not automatically generate or send a message for it.

## 8. Troubleshooting and code map

If a page makes no request, inspect authentication hydration and React Query's `enabled` condition. Do not clear active query observers during authentication initialization. Dashboard and activity-list queries refetch on mount so navigation checks the API again.

If the API returns an error, do not report a successful send or fabricate delivery events. Sender verification, configured provider credentials, a running queue worker, and provider webhooks are separate dependencies. Refreshing the UI cannot repair those dependencies.

Frontend entry points:

- `components/dashboard/live-outreach-dashboard.tsx`: dashboard API query.
- `components/dashboard/outreach-dashboard-view.tsx`: tabs, selection and overview UI.
- `components/dashboard/outreach-activity-history.tsx`: API-backed history dialog content.
- `components/sales-engine/sales-engine-outreach-view.tsx`: activities page.
- `components/sales-engine/outreach-preview-modal.tsx`: review/regenerate/send interface.
- `hooks/use-sales-engine-outreach.ts`: queries and mutations.
- `lib/api/sales-engine.ts`: API methods and response types.

Backend entry points:

- `OutreachDashboardController`: overview and paginated activity APIs.
- `OutreachController`: draft/detail/regenerate/send/delete routes.
- `OutreachDraftService`: generation and record creation.
- `OutreachSendService` and `SendOutreachEmailJob`: email queueing and dispatch.
- `NativeCrmEmailController`: native CRM email composition/history.
- `SendGridWebhookController`: provider event handling.
