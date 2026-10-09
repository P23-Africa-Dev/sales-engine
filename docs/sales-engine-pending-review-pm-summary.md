# Sales Engine: Pending Review Leads — Product Summary (for PM)

**Feature:** Dedicated "Pending Review" Leads Qualification & CRM Ingestion  
**Route:** `/sales-engine/pending-review`  
**Date:** September 2026  

---

## 1. What Was Built & Why It Matters

Previously on the Sales Engine dashboard, users could see a "Pending Review" metric showing a count of prospective leads discovered during AI research that hadn't yet been added to the CRM. However, that card was purely informational — clicking it did nothing. Users had to scroll up through long chat transcripts to find and save leads one by one.

We have now transformed this into a **complete lead qualification workflow**:
1. Clicking the **"Pending Review" card** on the Sales Engine dashboard now opens a **dedicated review workspace** (`/sales-engine/pending-review`).
2. Users can see every prospective lead discovered for their active ICP build that has not yet been saved to CRM.
3. Users can inspect, qualify, search, and save individual leads or batch-save multiple leads directly into a chosen CRM pipeline.
4. Once a lead is saved, it **immediately leaves the pending review queue** and is **instantly accessible in the CRM** (`/crm?source=sales_engine`).

---

## 2. What's New for Users

### 1. Clickable Metric Card Navigation
- On `/sales-engine`, hovering over the "Pending Review" card now shows a cursor pointer, elevation lift, and a clear **"Review leads →"** action prompt.
- Clicking it smoothly navigates the user to `/sales-engine/pending-review`, automatically scoped to the active ICP build.

### 2. Interactive Top Summary Cards (Click-to-Filter)
At the top of the new page, three summary cards provide instant insights:
- **Total Pending Leads**
- **High ICP Match (80%+ score)**
- **Contact Enriched (leads with email or phone)**

**Smart Interaction:** Clicking any of these three cards instantly filters the list below. Clicking "High ICP Match" isolates only the top-tier leads; clicking "Contact Enriched" isolates leads ready for immediate outreach.

### 3. Clear Visual Contrast
- To ensure the screen looks structured and easy on the eyes, the **top summary metric cards use a clean solid white background** with colored accent strips and icon badges.
- The **lead cards below use the signature pastel palette** (`#7BB6B8` soft teal, `#E3A5E9` soft lavender, and `#DBDBDB` neutral silver), creating a distinct visual separation between overall metrics and individual leads.

### 4. Lead Cards with Complete Prospect Intelligence
Each lead card provides rich research intelligence:
- **Prospect Name, Title, and Company** with external website link if available.
- **Match Priority Score** (e.g., `92% Fit`) with a breakdown of ICP alignment, search relevance, and buyer intent.
- **AI Targeting Reason:** A concise quote explaining *why* the AI recommended this prospect.
- **Enriched Contact Channels:** Clickable email (`mailto:`), phone (`tel:`), and LinkedIn profile links with enrichment tier status ("Verified direct", "Web verified").
- **1-Click Copy Button:** Copies complete prospect info to the clipboard with an instant checkmark confirmation.

### 5. Individual & Batch "Save to CRM"
- **Individual Ingest:** Clicking "Save to CRM" opens a pipeline selector where the user can pick the target CRM pipeline (defaulting to their preferred pipeline).
- **Batch Ingest:** Users can check individual cards or hit "Select all" to reveal a floating action bar at the bottom: **"Save (X) to CRM"**.
- **Instant UI Feedback:** When saved, the lead vanishes from the pending review list without page reloads, the pending counter decrements, and a confirmation toast appears.
- **Direct CRM Shortcut:** A "View in CRM Pipeline →" button in the header takes users straight to `/crm?source=sales_engine` where all saved leads are waiting.

### 6. Detail Inspection Modal (Power User Feature)
- Clicking the **Eye ("Inspect")** icon on any lead card opens a full modal displaying the deep AI research profile, multi-factor scoring (ICP Fit, Query Match, Buyer Intent), and full contact options with a direct "Save to CRM" button.

### 7. Dual View Modes (Grid & List)
- Users can switch between:
  - **Grid View:** Visual cards cycling through the brand pastel colors.
  - **List View:** Dense, high-productivity row layout with color indicator strips, ideal for sales reps triaging dozens of leads in minutes.

---

## 3. Impact on Sales Rep Productivity

| Metric | Before | Now |
| :--- | :--- | :--- |
| **Discovering pending leads** | Buried inside past chat transcripts | 1 click from the Sales Engine dashboard |
| **Reviewing lead quality** | Plain text excerpts | Rich cards with score gauges, AI reasoning, & contact badges |
| **Adding leads to CRM** | One-by-one manual clicks | 1-click single ingest or bulk batch ingest |
| **Pipeline selection** | Uncontrolled or hidden | User selects target CRM pipeline stage upon save |
| **Queue management** | Unclear which leads were already saved | Auto-removes saved leads from queue; updates live counters |

---

## 4. Next Opportunities for Product Consideration

1. **"Dismiss / Reject" Action:** Adding an optional "Not a Fit" button to archive irrelevant leads so they don't remain in the pending list indefinitely.
2. **Export to CSV:** Allowing sales managers to export unreviewed leads for offline review.
3. **Outreach Draft Generation from Review:** Allowing users to trigger an AI email draft directly from the pending review screen before saving to CRM.
