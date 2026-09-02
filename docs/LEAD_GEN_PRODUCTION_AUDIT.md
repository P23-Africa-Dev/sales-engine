# Lead Generation Production Audit (2026-09-02)

## Cluster health (`sales-engine` namespace)

| Pod | Status |
|-----|--------|
| backend | Running |
| queue-worker | Running |
| scheduler | Running |
| redis | Running |

Queue worker is deployed — `ProcessChatIntentJob` can process async Generate Leads requests.

## Root cause: 15 Sales Engine leads vs 2 in CRM

These counts measure **different things**:

| Metric | Source | Meaning |
|--------|--------|---------|
| Old "Lead Metrics" (~15) | `leads` table in Sales Engine DB | All discovery leads ever created |
| CRM Pipeline (~2) | Factory23 `leads` table | Only rows pushed via `CrmSyncService` |

Most discovery leads were saved to Sales Engine automatically but **never explicitly synced to CRM**. With `autoSyncCrm` defaulting to `false`, only manual or partial auto-sync created the 2 CRM rows.

## Fix applied

1. New leads from chat discovery are **`save_status=draft`** until user clicks Save / Save All.
2. Metrics split: **`leads_in_crm`**, **`leads_pending_review`**, **`leads_discovered`** (saved only).
3. CRM push only via explicit save endpoints — no auto-sync on discovery.
4. In-chat pending message replaces timeout toast; background polling resumes on reload.

## Verification queries (production DB)

```sql
-- Sales Engine DB
SELECT save_status, COUNT(*) FROM leads WHERE organization_id = ? GROUP BY save_status;
SELECT COUNT(*) FROM leads WHERE organization_id = ? AND synced_to_f23_at IS NOT NULL;

-- Factory23 CRM DB
SELECT COUNT(*) FROM leads WHERE company_id = ? AND source = 'sales_engine' AND deleted_at IS NULL;
```

## Integration checklist

- `GET /api/v1/integrations/factory23/status` → `configured`, `linked`, `organization_enabled`
- Org has `f23_company_id` set
- `FACTORY23_CRM_SYNC_ENABLED` or org-level sync enabled for Save to CRM
