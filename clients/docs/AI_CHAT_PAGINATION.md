# AI Chat Pagination

This document describes the backend-only AI conversation pagination contract implemented for Factory23 Copilot AI threads.

## Purpose

- Improve performance for chat history retrieval by avoiding full thread payloads.
- Support infinite-scroll / cursor-based loading in the frontend without requiring frontend changes.
- Ensure tenant-scoped access to AI conversations.
- Keep the existing AI context memory model intact while returning paged message slices.

## Endpoints

### GET /api/v1/copilot/threads/{thread}

Fetches the latest page for a Copilot thread.

Query parameters:
- `company_id` (optional): resolve request scope explicitly for multi-tenant contexts.
- `cursor` (optional): opaque message ID cursor for paging.
- `limit` (optional): maximum number of messages per page; defaults to `20`, max `50`.

Response:
- `data.thread.thread_id`: thread identifier.
- `data.thread.message_count`: total number of messages in thread.
- `data.thread.messages`: latest page of messages.
- `data.thread.pagination`: pagination metadata.

Example:

```http
GET /api/v1/copilot/threads/abc123?company_id=1&limit=20
```

### GET /api/v1/copilot/threads/{thread}/messages

Fetches an older page of thread messages using a cursor returned by the list endpoint.

Query parameters:
- `company_id` (optional)
- `cursor` (optional): last seen message ID from the previous page.
- `limit` (optional): maximum page size.

Response:
- `data.conversation_id`: thread identifier.
- `data.messages`: page of older messages.
- `data.pagination.has_more`: whether additional older pages exist.
- `data.pagination.next_cursor`: cursor to fetch the next older page.
- `data.pagination.loaded_count`: number of messages returned in this page.

Example:

```http
GET /api/v1/copilot/threads/abc123/messages?company_id=1&cursor=msg-456&limit=20
```

## Pagination semantics

- The thread is stored in Redis as an ordered message list.
- `GET /threads/{thread}` returns the newest `limit` messages.
- `next_cursor` points to the oldest message in the current page.
- When a cursor is provided, the service returns the previous page of messages before that cursor.
- Pages are always returned in chronological order for the selected slice.

## Tenant isolation

- Requests are validated against the resolved `company_id`.
- Thread access requires the thread to exist in the tenant scope of the requesting user.
- If a thread does not belong to the requested company, the endpoint returns `404`.

## Implementation details

- `ConversationMemoryService::getThreadMessages()` performs thread lookup and cursor-based slicing.
- `CopilotService::getThreadPage()` wraps pagination behavior for business logic.
- `CopilotController::messages()` exposes the paginated messages endpoint.
- Existing `/copilot/chat` flows remain unchanged.

## Testing

New backend tests cover:
- latest page retrieval with `GET /threads/{thread}`
- older page retrieval via `GET /threads/{thread}/messages`
- cross-company access rejection

These tests are implemented in `backend/src/tests/Feature/AI/CopilotChatHistoryPaginationTest.php`.
