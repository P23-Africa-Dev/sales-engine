# Sales Engine: UI Update Summary (for Product)

**What happened:** We had two versions of the Sales Engine chat/social-listening screen being worked on in parallel — one branch had newer visual/interaction improvements, the other had the real backend hooked up (CRM sync, live social listening data, ICP profiles). This merges the two together: **you keep everything that's already live and working, plus you gain the newer UI improvements on top of it.**

Nothing about the working CRM sync, live social signals, or ICP profile system was removed or changed. This was purely additive on the UI side.

---

## What's new for users

### 1. A confirmation step before generating prospects
Previously, asking the assistant to "find prospects" would just run immediately against whatever ICP profile happened to be active. Now, before it runs, the chat shows a small card asking the user to confirm (or switch) which ICP profile to use, and to hit "Confirm & Generate." This prevents someone from accidentally generating a batch of prospects against the wrong targeting profile.

- If the user hasn't set up an ICP profile yet, the card tells them so and links to "Manage ICP Builds" instead of letting them proceed.
- If a user types a specific number ("find me 20 prospects in Lagos"), that number is respected. If they don't specify one, it defaults to 100 and shows "Target: 100 prospects" under their message so it's clear what's about to happen.

### 2. "Leads" renamed to "Prospects" throughout the UI
Button labels, the welcome message, ICP builder copy, and section headers were updated for consistency ("Generate New Leads" → "Generate New Prospects", etc.). This is cosmetic — no data or behavior changed.

### 3. Social Listening: Google Search added as a signal source
Alongside LinkedIn, X/Twitter, and Reddit, the social listening table and filters now support Google Search as a source, with its own icon and appropriate "See Search Result" / "Intent Search Query" labeling in the detail panel.

### 4. Social Listening: expandable signal detail
Individual social signals now show a short summary by default, with a "Show Full" / "Show Summary" toggle to expand to the complete original post/text. Previously it was one or the other with no way to switch.

### 5. Social Listening: polish
- Table rows now have a cleaner selected/active state and are keyboard-navigable (not just mouse hover).
- The signals table scrollbar was restyled to be thinner and less visually noisy.
- The "Scan" button icon was updated.

### 6. Minor: "how many searches do I have left?" now gets an answer
If a user asks something like "how many searches do I have left," the assistant now replies with a locally-tracked usage count instead of ignoring the question or misrouting it. **Note:** this counter is currently just a local, cosmetic tracker — it is not yet tied to a real backend-enforced limit. If usage limits are meant to be a real, enforced product feature, that still needs to be built properly on the backend.

---

## What was intentionally left out (for now)

The older UI branch also included a pop-up for picking a specific CRM pipeline when saving a prospect (e.g., "New Leads" vs. "Qualified" vs. "In Negotiation"). We did **not** bring this in, because there's currently no backend support for it — the real "save to CRM" action doesn't have a way to receive a pipeline choice yet. Rather than ship a button that looks functional but silently does nothing, we left it out. If pipeline selection on save is something the team wants, it needs a small backend addition first (an endpoint to list pipelines, and support for passing a chosen pipeline when syncing a prospect to CRM).

---

## One thing worth a decision from Product

Before this merge, the Sales Engine screen defaulted to opening on the **Social Listening** tab. After merging in the other branch's version, it now defaults to the **Smart Lead** (chat) tab instead. This is a small but visible change — worth confirming which tab you actually want users to land on first, since it may have been a leftover setting from local testing rather than a deliberate choice.

---

## Bottom line

- Real, working integrations (CRM sync, live social listening feed, ICP profiles) are fully intact — nothing was lost.
- Users get a handful of real UI/UX improvements: the confirmation-before-generating safeguard, Google Search as a monitored source, expandable signal detail, and general terminology/polish cleanup.
- Nothing was faked or stubbed in to "look done" — where a UI idea from the other branch had no real backend behind it (the CRM pipeline picker), it was left out rather than shipped half-working.
- Recommend a quick walkthrough of the confirm-before-generate flow and the expandable signal detail before this goes to users, since those got the most rework.
