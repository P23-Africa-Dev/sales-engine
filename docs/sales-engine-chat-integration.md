# Sales Engine: Chat API Integration

## Status

Updated September 2026. `ChatWorkspace` sends messages through the Sales Engine API with **async discovery** for heavy intents and **ICP-scoped chat history** persistence.

## What changed (September 2026)

### Async heavy intents (fixes timeouts)

`quick_research` and `generate_leads` no longer block the browser for 60+ seconds:

1. `POST /chat/sessions/{id}/messages` returns **202** quickly with `discovery_run_id` and `status: "processing"`.
2. The frontend polls `GET /discovery/runs/{id}` every 2s (up to 5 minutes), showing **real pipeline stages** in the thinking bubble.
3. When complete, it reloads `GET /chat/sessions/{id}/messages` and appends the assistant reply.

`create_outreach` stays synchronous with a **120s** client timeout (`NEXT_PUBLIC_CHAT_OUTREACH_TIMEOUT_MS`).

### ICP-scoped chat history

- Each active ICP build has its own chat session (`icp_profile_id` on the backend).
- On load and ICP switch, the UI calls `GET /chat/sessions/current?icp_profile_id=` and hydrates the transcript.
- **Clear chat history** in the ICP dropdown menu wipes messages for the current ICP only.

## Key files

| File                                            | Role                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `lib/api/sales-engine.ts`                       | `fetchCurrentChatSession`, `pollDiscoveryRunUntilComplete`, async `sendChatMessage` |
| `hooks/use-sales-engine-chat.ts`                | `useChatHistory`, `useSendChatMessage(icpId)`, `useClearChatHistory`                |
| `components/sales-engine/sales-engine-view.tsx` | `ChatWorkspace` history hydration + real progress stages                            |

See `sales-engine-backend/docs/FRONTEND_INTEGRATION.md` §5 for the API contract.
