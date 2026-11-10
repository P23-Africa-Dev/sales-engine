# Sales Engine: Pending Review Leads Feature — Technical Report

**Feature:** Sales Engine "Pending Review" Workflow & Dedicated Management View  
**Target Route:** `/sales-engine/pending-review`  
**Date:** September 2026  
**Scope:** `components/sales-engine/sales-engine-pending-review-view.tsx`, `components/sales-engine/sales-engine-view.tsx`, `lib/api/sales-engine.ts`, `hooks/use-sales-engine-pending-leads.ts`, `hooks/use-sales-engine-pipelines.ts`, `app/(dashboard)/sales-engine/pending-review/page.tsx`

---

## 1. Executive Technical Summary

Previously, the Sales Engine dashboard displayed a "Pending Review" metric card indicating prospective leads discovered during AI research runs that had not yet been transferred into the Factory23 CRM. However, this card was a static informational display with no interactive navigation, leaving users with no dedicated space to review, inspect, qualify, or selectively import unsaved leads outside of the linear chat transcript.

This implementation delivers an end-to-end qualification and ingest pipeline:
1. **Interactive Metric Card Navigation:** The "Pending Review" card on the Sales Engine dashboard (`sales-engine-view.tsx:3954`) is now fully interactive, linking directly to `/sales-engine/pending-review` scoped to the current active ICP build (`?icp_id=${activeProfile.id}`).
2. **Dedicated Route & View:** Implemented `/sales-engine/pending-review` with React `Suspense` boundary and a UI UX Pro Max compliant dashboard view.
3. **Data Ingest & Fallback Engine:** Added `fetchPendingReviewLeads()` in `lib/api/sales-engine.ts` with direct Sales Engine microservice endpoint querying and automated multi-session chat message aggregation fallback.
4. **Optimistic State & Cache Synchronization:** Created `usePendingReviewLeads()` with instant optimistic removals, synchronizing React Query caches across `pending-leads`, `metrics`, and `chat` history.
5. **CRM Pipeline Ingestion:** Integrated `AddToCrmPipelineModal` with pipeline selection, supporting single and batch ingest via `pushLeadToCrm()` and `syncLeadsBatch()`. Once synced, leads immediately reflect in the CRM (`/crm?source=sales_engine`).
6. **Visual Hierarchy & Distinct Backgrounds:** Elevated the view using the signature color palette (`#7BB6B8`, `#E3A5E9`, `#DBDBDB`). The top 3 metric cards feature clean `bg-white` card bodies with color accent bars and interactive click-to-filter triggers, cleanly separating them from the full-color pastel lead cards below.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Sales Engine Dashboard                          │
│                   (/sales-engine, MetricCard:3954)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Click "Review leads →"
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Route: /sales-engine/pending-review                      │
│      (app/(dashboard)/sales-engine/pending-review/page.tsx)           │
│                      [React Suspense Boundary]                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  SalesEnginePendingReviewView                          │
│     (components/sales-engine/sales-engine-pending-review-view.tsx)     │
└───────┬───────────────────────────┬────────────────────────────┬───────┘
        │                           │                            │
        ▼                           ▼                            ▼
┌─────────────────┐       ┌──────────────────┐       ┌───────────────────┐
│ Top Stat Cards  │       │  Controls & View │       │  Lead Cards Grid  │
│ - Total Pending │       │ - ICP Switcher   │       │ - #7BB6B8 Pastel  │
│ - High Fit 80%+ │       │ - Search Input   │       │ - #E3A5E9 Pastel  │
│ - Contact Ready │       │ - Fit Pills      │       │ - #DBDBDB Pastel  │
│ (Click2Filter)  │       │ - Sort Dropdown  │       │ - Monogram Avatar │
│ [bg-white]      │       │ - Grid/List View │       │ - 1-Click Copy    │
└─────────────────┘       └──────────────────┘       │ - Inspect Drawer  │
                                                     │ - Save to CRM     │
                                                     └─────────┬─────────┘
                                                               │
                                                               ▼
                                             ┌───────────────────────────────────┐
                                             │     AddToCrmPipelineModal         │
                                             │ (Select CRM Pipeline Stage)       │
                                             └─────────────────┬─────────────────┘
                                                               │ Confirm
                                                               ▼
                                             ┌───────────────────────────────────┐
                                             │     POST /leads/{id}/sync-to-crm  │
                                             │  - Optimistic UI removal          │
                                             │  - Invalidate SE Metrics query    │
                                             │  - Lead visible in /crm?source=se │
                                             └───────────────────────────────────┘
```

---

## 3. Detailed Component & Module Breakdown

### 3.1. API & Ingestion Engine (`lib/api/sales-engine.ts`)
Added `fetchPendingReviewLeads(icpProfileId?: string): Promise<ChatLead[]>`:
- **Direct Endpoint Attempt:** Calls `GET /leads?save_status=draft` with optional `icp_profile_id`. If the Sales Engine backend exposes the leads endpoint directly, results are filtered for unsynced candidates (`!lead.crm_synced && lead.save_status !== "saved" && !lead.crm_duplicate`).
- **Resilient Fallback Layer:** If the direct endpoint is unavailable or returns 404, it gathers chat sessions across the target ICP build (or all user ICP profiles plus default session) via `fetchCurrentChatSession()`. It then extracts `message.leads` from all session assistant replies, filters unsaved leads, and deduplicates by `lead.id`.

### 3.2. State Management & Query Hooks (`hooks/use-sales-engine-pending-leads.ts`)
- **Query Key:** `["sales-engine", "pending-leads", "list", icpId ?? "all"]`.
- **Automatic Token Invalidation:** Resets Sales Engine authentication session upon 401 response.
- **Optimistic Removal Helpers:**
  - `removeLeadLocally(leadId: number)`: Updates TanStack Query cache synchronously, removing the synced lead with zero UI lag.
  - `removeLeadsLocally(leadIds: number[])`: Batch removes multiple leads from the active cache.
- **Cache Invalidation Coordinator:** `invalidateAll()` purges `pending-leads`, `SALES_ENGINE_METRICS_KEYS.all`, and `SALES_ENGINE_CHAT_KEYS.all`.

### 3.3. Pipeline Ordering Hook (`hooks/use-sales-engine-pipelines.ts`)
Extracted CRM pipeline discovery into a standalone hook:
- Resolves active company context and user role (`/admin` vs `/agent`).
- Loads available CRM pipelines and user preferences (`preferred_pipeline_id`, `company_default_pipeline_id`).
- Orders pipelines placing the user's default/preferred pipeline first for fast 1-click confirmation.

### 3.4. Page Route (`app/(dashboard)/sales-engine/pending-review/page.tsx`)
- Configured metadata: `title: "Pending Review Leads | Sales Engine | The Factory"`.
- Wrapped in `<Suspense fallback={<div className="min-h-screen bg-[#f8f8f8]" />} >` to support dynamic search parameters (`?icp_id=...`) without de-optimizing the route.

### 3.5. Metric Card Navigation (`components/sales-engine/sales-engine-view.tsx`)
- Updated `MetricCard` to accept optional `actionLabel?: string`.
- Line 3943 (`Lead Metrics`): `href="/crm?source=sales_engine"` and `actionLabel="View in CRM →"`.
- Line 3954 (`Pending Review`): `href={activeProfile?.id ? "/sales-engine/pending-review?icp_id=" + activeProfile.id : "/sales-engine/pending-review"}` and `actionLabel="Review leads →"`.

### 3.6. UI UX Pro Max View (`components/sales-engine/sales-engine-pending-review-view.tsx`)
- **Top Metric Cards (`#7BB6B8`, `#E3A5E9`, `#DBDBDB`):**
  - Built with solid `bg-white` backgrounds to maintain clear contrast with the cards below.
  - Features 6px top theme color accent strips and matching theme-colored icon circles.
  - Interactive click-to-filter triggers: clicking Card 1 sets `fitFilter = "all"`, Card 2 sets `fitFilter = "high"`, Card 3 sets `fitFilter = "contact_ready"`.
  - Active selection receives high-contrast `border-2 border-[#09232d]` and an "Active" badge.
- **Controls & Toolbar:**
  - Debounced search input across name, company, role, location, and AI summary.
  - Fit score filter pills (All, High Fit 80%+, Medium Fit 60-79%, Contact Ready).
  - Sorting dropdown (`highest_score`, `lowest_score`, `name_asc`, `company_asc`).
  - View mode toggle between **Grid View** (`Grid3X3`) and **List View** (`LayoutList`).
- **Lead Cards Grid:**
  - Cycles dynamically through `#7BB6B8` (soft teal), `#E3A5E9` (soft lavender), and `#DBDBDB` (neutral silver).
  - Styled with custom elevation `shadow-[0_6px_5px_rgba(0,0,0,0.15),0_2px_1.5px_rgba(0,0,0,0.3)]` and `rounded-[22px]`.
  - Card components: circular white avatar with initial monogram, score badge with multi-factor tooltip, location & source badges, AI reasoning quote block, contact links (mailto, phone, LinkedIn), 1-click copy button, and "Save to CRM" button.
- **Lead Inspection Modal (`framer-motion`):**
  - Displays multi-dimension score breakdown (**ICP Fit %**, **Query Match %**, **Buyer Intent %**).
  - Full research profile, target reasoning, and direct "Save Lead to CRM" confirmation button.
- **Floating Sticky Batch Action Bar (`framer-motion`):**
  - Smooth bottom-center entrance when leads are selected.
  - Displays selected count, "Select all matching", "Deselect", and "Save (X) to CRM" batch button.

---

## 4. Verification & Testing

- **Static Type Check:** Executed `npx tsc --noEmit` across the entire repository — **0 errors**.
- **Lint & Syntax:** Clean syntax with all modules resolved.
- **Browser State:** Dev server running synchronously with zero runtime crashes or unhandled promise rejections.
