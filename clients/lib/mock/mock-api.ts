/**
 * Demo mock API.
 *
 * The client app currently runs without a backend: every request that would go
 * to the Sales Engine / Factory APIs is answered here from `data/data.json`.
 * Changes (new leads, stage moves, notes…) live in memory and reset on refresh.
 *
 * To go live later: delete the `installMockApi()` call in
 * components/providers/query-provider.tsx and this folder.
 */
import seed from "@/data/data.json";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const MOCK_DELAY_MS = 250;

const API_BASES = [
  process.env.NEXT_PUBLIC_SALES_ENGINE_API_URL,
  process.env.NEXT_PUBLIC_API_BASE_URL,
  "https://api.salesengine.thefactory23.com/api/v1",
  "https://api.thefactory23.com/api/v1",
  "http://127.0.0.1:8001/api/v1",
  "http://localhost:8001/api/v1",
].filter(Boolean) as string[];

const db: Json = JSON.parse(JSON.stringify(seed));
let nextId = 90000;
const newId = () => nextId++;
const nowIso = () => new Date().toISOString();

// ── helpers ──────────────────────────────────────────────────────────────────
const ok = (data: Json, extra: Record<string, unknown> = {}) => ({
  status: 200,
  json: { success: true, message: "OK", errors: null, data, ...extra },
});
const raw = (json: Json, status = 200) => ({ status, json });
const notFound = () => raw({ success: false, message: "Not found (demo data)." }, 404);

function paginate<T>(items: T[], q: URLSearchParams) {
  const perPage = Number(q.get("per_page") || 20);
  const page = Number(q.get("page") || 1);
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return {
    slice: items.slice((page - 1) * perPage, page * perPage),
    page,
    perPage,
    total,
    lastPage,
  };
}

function matchSearch(value: Json, search: string | null) {
  if (!search) return true;
  return JSON.stringify(value).toLowerCase().includes(search.toLowerCase());
}

function crmLeadFromAny(source: Json, overrides: Json = {}) {
  const pipeline = db.crm.pipelines.find((p: Json) => p.id === Number(overrides.pipeline_id)) ?? db.crm.pipelines[0];
  const id = newId();
  const lead = {
    lead_type: "business",
    id,
    company_id: 1,
    pipeline_id: pipeline.id,
    linked_to_map: false,
    created_by_user_id: db.user.id,
    assigned_to_user_id: db.user.id,
    name: source.name ?? source.company ?? "New lead",
    email: source.email ?? null,
    phone: source.phone ?? null,
    location: source.location ?? null,
    contacts: source.contact_person ? [{ id: id * 10, name: source.contact_person, email: source.email, phone: source.phone, location: source.location }] : [],
    company_name: source.company ?? source.name ?? null,
    website: source.website ?? null,
    position: source.title ?? null,
    source: source.source ?? "Sales Engine",
    status: "new",
    priority: "medium",
    budget_amount: 0,
    budget_currency: pipeline.currency_code,
    next_action: source.next_action ?? "Send intro email",
    last_interaction: "Added from Sales Engine",
    last_interaction_at: nowIso(),
    meta: {},
    creator: { id: db.user.id, name: db.user.name, email: db.user.email, avatar_url: null },
    assignee: { id: db.user.id, name: db.user.name, email: db.user.email, avatar_url: null },
    pipeline: { id: pipeline.id, name: pipeline.name, currency_code: pipeline.currency_code },
    notes: [],
    activities: [],
    created_at: nowIso(),
    updated_at: nowIso(),
    ...overrides,
  };
  db.crm.leads.unshift(lead);
  return lead;
}

function cannedAssistantReply(body: string, intent: string) {
  const wantsLeads = /lead|prospect|compan|find|generate/i.test(body) || intent.includes("leads");
  if (wantsLeads) {
    const pool: Json[] = db.discoveryLeads;
    const start = Math.floor(Math.random() * Math.max(1, pool.length - 6));
    const leads = pool.slice(start, start + 6).map((lead: Json) => ({ ...lead, id: newId(), save_status: "draft" }));
    db.discoveryLeads.push(...leads);
    return {
      body: `Here are **${leads.length} prospects** that match your request. They are ranked by ICP fit and recent buying signals. Save the best ones to your CRM or ask me to draft outreach.`,
      leads,
      intent: intent || "generate_leads",
    };
  }
  if (/outreach|email|message|draft/i.test(body)) {
    return {
      body:
        "Here's a draft you can send:\n\n**Subject:** Helping your field team close faster\n\nHi there,\n\nI noticed your team is expanding and thought Sales Engine could help — we turn field activity and social signals into qualified pipeline, automatically. Would you be open to a 15-minute call this week?\n\nBest,\nElijah",
      leads: null,
      intent: "create_outreach",
    };
  }
  return {
    body:
      "Great question. Based on your active ICP (*Lagos Fintech Scale-ups*), the strongest opportunities this week are companies hiring field sales reps and those announcing expansion into new states. Want me to **generate leads** for that segment?",
    leads: null,
    intent: intent || "freeform",
  };
}

// ── Ely replies ──────────────────────────────────────────────────────────────
function elyReply(message: string): string {
  const text = message.toLowerCase();
  const leads: Json[] = db.crm.leads;
  const byStatus = (s: string) => leads.filter((l) => l.status === s);
  const names = (list: Json[], n = 3) => list.slice(0, n).map((l) => `**${l.name}**`).join(", ");
  if (/pipeline|deal|forecast|revenue|how.*(doing|going)/.test(text)) {
    return `Your pipeline has **${leads.length} leads**. ${byStatus("proposal").length} are in *Proposal Sent* and ${byStatus("won").length} closed won. New leads are up **12.5%** this week.\n\nThe deals most likely to close next: ${names(byStatus("proposal"))}.`;
  }
  if (/follow|call|today|priorit|who should/.test(text)) {
    return `Here's who I'd contact first today:\n\n1. ${names(byStatus("qualified"), 1)}: qualified, and the decision maker opened your email twice\n2. ${names(byStatus("proposal").slice(1), 1)}: proposal viewed yesterday\n3. ${names(byStatus("contacted").slice(2), 1)}: no reply in 5 days, so try WhatsApp\n\nWant me to draft the follow-ups?`;
  }
  if (/lead|prospect|find|generate/.test(text)) {
    return `I found **6 new prospects** matching your *Lagos Fintech Scale-ups* ICP, including ${db.discoveryLeads.slice(10, 13).map((l: Json) => `**${l.name}**`).join(", ")}. They're waiting in **Smart Leads → Pending Review** for you to approve.`;
  }
  if (/email|draft|write|message|outreach/.test(text)) {
    return `Here's a draft:\n\n**Subject:** Helping your field team close faster\n\nHi {{first_name}},\n\nI noticed your team is expanding across Lagos. Sales Engine turns field visits and social buying signals into qualified pipeline automatically. Teams like yours see 30% more meetings in the first month.\n\nOpen to a 15-minute call this week?\n\nBest,\n${db.user.name}`;
  }
  if (/map|agent|field|where|territor/.test(text)) {
    const agents: Json[] = db.map.attendanceSnapshots;
    return `**${agents.length} agents** are clocked in right now: ${agents.map((a) => `${a.agent_name} (${a.zone})`).join(", ")}. They've logged **${agents.length * 2} client visits** so far today. Open the **Map** tab to see their live routes.`;
  }
  if (/signal|social|listening/.test(text)) {
    return `Social Listening picked up **${db.socialListeningMetrics.signals_detected} signals** this cycle, **${db.socialListeningMetrics.high_opportunities}** of them high-intent. The top one is from **${db.socialSignals[0].company}**: "${db.socialSignals[0].signal}"`;
  }
  return `I can help with your pipeline, follow-ups, new prospects, outreach drafts and field activity. For example, try *"Who should I call today?"* or *"How is my pipeline doing?"*`;
}

function elyStream(payload: Json): Response {
  const threadId = payload?.thread_id || `thr-${Date.now()}`;
  const reply = elyReply(payload?.message ?? "");
  const encoder = new TextEncoder();
  const frame = (event: string, data: Json) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const words = reply.split(/(\s+)/);
  const stream = new ReadableStream({
    async start(controller) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      controller.enqueue(frame("meta", { thread_id: threadId }));
      controller.enqueue(frame("processing", { label: "Checking your CRM and outreach…" }));
      await wait(700);
      for (let i = 0; i < words.length; i += 3) {
        controller.enqueue(frame("delta", { chunk: words.slice(i, i + 3).join("") }));
        await wait(35);
      }
      controller.enqueue(frame("done", { thread_id: threadId, message: reply, tool: null, sources: ["CRM"], payload: null }));
      controller.close();
      const ely = db.ely;
      const now = nowIso();
      ely.messages[threadId] = [
        ...(ely.messages[threadId] ?? []),
        { id: `u-${Date.now()}`, role: "user", content: payload?.message ?? "", sources: [], tool: null, payload: null, created_at: now },
        { id: `a-${Date.now()}`, role: "assistant", content: reply, sources: ["CRM"], tool: null, payload: null, created_at: now },
      ];
      if (!ely.threads.some((t: Json) => t.thread_id === threadId)) {
        ely.threads.unshift({ thread_id: threadId, title: String(payload?.message ?? "New chat").slice(0, 40), created_at: now, updated_at: now, message_count: 2, last_message_preview: reply.slice(0, 80) });
      }
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

// ── routes ───────────────────────────────────────────────────────────────────
type Ctx = { method: string; path: string; q: URLSearchParams; body: Json };

function route({ method, path, q, body }: Ctx): { status: number; json: Json } {
  let m: RegExpMatchArray | null;
  const GET = method === "GET";

  // Auth (native Sales Engine responses are not wrapped in `data`)
  if (path === "/auth/login" || path === "/auth/register") {
    return raw({ token: "demo-token", token_type: "Bearer", user: db.user, organization: db.organization });
  }
  if (path === "/auth/me") {
    return raw({ user: db.user, organizations: [{ id: db.organization.id, role: "owner" }], current_organization: { id: db.organization.id } });
  }
  if (path === "/auth/logout") return ok({});
  if (/^\/(admin|agent)\/profile/.test(path) || path === "/profile" || path === "/me") return ok({ user: db.user, ...db.user });

  // Dashboard / outreach
  if (path === "/outreach/dashboard") return ok(db.outreachDashboard);
  if (path === "/metrics") return ok(db.metrics);
  if (path === "/outreach/recent") return ok(db.outreachActivities);
  if (path === "/outreach/activities" && GET) {
    const all: Json[] = db.outreachActivities;
    const channel = q.get("channel");
    const status = q.get("status");
    const items = all
      .filter((a) => (!channel || channel === "all" || a.channel === channel) && (!status || status === "all" || a.delivery_status === status) && matchSearch(a, q.get("search")))
      .sort((a, b) => (q.get("sort") === "oldest" ? 1 : -1) * (new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()));
    const p = paginate(items, q);
    const count = (fn: (a: Json) => boolean) => all.filter(fn).length;
    return ok({
      items: p.slice,
      total: p.total,
      last_page: p.lastPage,
      current_page: p.page,
      metrics: {
        total: all.length,
        deliveredCount: count((a) => ["delivered", "opened", "clicked"].includes(a.delivery_status)),
        openedCount: count((a) => ["opened", "clicked"].includes(a.delivery_status)),
        clickedCount: count((a) => a.delivery_status === "clicked"),
        failedCount: count((a) => ["bounced", "dropped"].includes(a.delivery_status)),
        emailCount: count((a) => a.channel === "email"),
        whatsappCount: count((a) => a.channel === "whatsapp"),
      },
    });
  }
  if ((m = path.match(/^\/outreach\/activities\/(\d+)(\/\w+)?$/))) {
    const id = Number(m[1]);
    const act = db.outreachActivities.find((a: Json) => a.id === id);
    if (m[2] === "/send") {
      if (act) Object.assign(act, { delivery_status: "sent", updated_at: nowIso(), last_event_at: nowIso() });
      return ok({ message_id: `demo-${id}`, sent: true, delivery_status: "sent", activity_id: id });
    }
    if (method === "DELETE") {
      db.outreachActivities = db.outreachActivities.filter((a: Json) => a.id !== id);
      return ok({ deleted: true, id });
    }
    const draft = {
      channel: act?.channel === "whatsapp" ? "whatsapp" : "email",
      subject: "Quick idea for your sales team",
      body: act?.preview ?? "Hi there — would you be open to a quick chat this week?",
      sent: act?.delivery_status === "sent",
      to_email: "prospect@example.com",
      activity_id: id,
      name: act?.name ?? null,
      regeneration_count: m[2] === "/regenerate" ? 1 : 0,
    };
    if (m[2] === "/regenerate") draft.body = `${draft.body}\n\n(P.S. Happy to share a 2-minute demo video if that's easier.)`;
    return ok(draft);
  }
  if (path === "/outreach/sender-settings") return ok(db.outreachSenderSettings);
  if (path === "/outreach/inboxes") return ok(GET ? db.outreachInboxes : { id: newId(), email: body?.email, status: "confirmed", is_default: false });
  if (path.startsWith("/outreach/inboxes/")) return ok(db.outreachInboxes[0]);
  if (path.startsWith("/outreach/domain")) return ok(null);
  if (path === "/outreach/setup-request") return ok(GET ? null : { id: newId(), status: "pending", created_at: nowIso() });

  // Integrations / geo
  if (path.startsWith("/integrations/factory23")) return ok(path.endsWith("/ensure") ? { linked: true, token_registered: true, status: db.factory23Status } : db.factory23Status);
  if (path.startsWith("/geo/places")) {
    const query = (q.get("q") || "").toLowerCase();
    const places = ["Lagos, Nigeria", "Abuja, Nigeria", "Port Harcourt, Nigeria", "Ibadan, Nigeria", "Kano, Nigeria", "Accra, Ghana", "Nairobi, Kenya", "Cape Town, South Africa", "Kigali, Rwanda", "London, United Kingdom", "Berlin, Germany"]
      .filter((p) => p.toLowerCase().includes(query))
      .map((label) => ({ label, type: "city", country: label.split(", ")[1], gl: "ng" }));
    return ok(places);
  }

  // ICP profiles
  if (path === "/icp-profiles/suggest-search-brief") {
    return ok({
      brief: "Fast-growing B2B companies in Lagos hiring field sales teams or expanding into new states, led by a Head of Sales or COO.",
      keywords: ["field sales", "merchant acquisition", "expansion", "distribution", "hiring sales reps"],
      source: "heuristic",
      industries: ["Fintech", "FMCG & Retail"],
      decisionMakers: ["Head of Sales", "COO"],
      companySizes: ["51-200"],
      exclusions: [],
      minMatchScore: 65,
    });
  }
  if (path === "/icp-profiles") {
    if (GET) return ok(db.icpProfiles);
    const profile = { id: String(newId()), name: body?.name ?? "New ICP", description: body?.description ?? "", isActive: false, leadCount: 0, lastUpdated: nowIso(), config: body?.config ?? {} };
    db.icpProfiles.push(profile);
    return ok(profile);
  }
  if ((m = path.match(/^\/icp-profiles\/([^/]+)(\/\w+)?$/))) {
    const profile = db.icpProfiles.find((p: Json) => p.id === m![1]);
    if (!profile) return notFound();
    if (method === "DELETE") {
      db.icpProfiles = db.icpProfiles.filter((p: Json) => p.id !== m![1]);
      return ok(null);
    }
    if (m[2] === "/activate") {
      db.icpProfiles.forEach((p: Json) => (p.isActive = p.id === profile.id));
      return ok(profile);
    }
    if (m[2] === "/duplicate") {
      const copy = { ...JSON.parse(JSON.stringify(profile)), id: String(newId()), name: `${profile.name} (copy)`, isActive: false };
      db.icpProfiles.push(copy);
      return ok(copy);
    }
    if (method === "PATCH" || method === "PUT") Object.assign(profile, body, { lastUpdated: nowIso() });
    return ok(profile);
  }

  // Chat (Ely)
  if (path === "/chat/sessions" || path.startsWith("/chat/sessions/current")) return ok(db.chatSession);
  if ((m = path.match(/^\/chat\/sessions\/(\d+)\/messages$/))) {
    if (GET) return ok(db.chatMessages);
    if (method === "DELETE") {
      db.chatMessages = [];
      return ok({ cleared: true });
    }
    const userMessage = { id: newId(), role: "user", body: body?.body ?? "", intent: body?.intent ?? "freeform", leads: null, meta: null, created_at: nowIso() };
    const reply = cannedAssistantReply(body?.body ?? "", body?.intent ?? "");
    const assistantMessage = { id: newId(), role: "assistant", body: reply.body, intent: reply.intent, leads: reply.leads, meta: reply.leads ? { lead_count: reply.leads.length } : null, created_at: nowIso() };
    db.chatMessages.push(userMessage, assistantMessage);
    return ok({ user_message: userMessage, assistant_message: assistantMessage, status: "completed", pending: false });
  }
  if ((m = path.match(/^\/discovery\/runs\/(\d+)/))) {
    return ok({ id: Number(m[1]), status: "completed", stages: ["completed"], progress: { step: 4, total_steps: 4 }, result_summary: {}, cancelled: true });
  }

  // Pending review / save to CRM
  if (path.startsWith("/crm/discovery-pending")) return ok({ items: db.pendingReviewLeads, last_page: 1 });
  if (path === "/crm/leads/from-discovery") {
    const ids: number[] = body?.lead_ids ?? [];
    const synced = ids.map((leadId) => {
      const source = [...db.discoveryLeads, ...db.pendingReviewLeads].find((l: Json) => l.id === leadId) ?? { name: `Lead ${leadId}` };
      source.save_status = "saved";
      source.native_crm_saved = true;
      const lead = crmLeadFromAny(source, { pipeline_id: body?.pipeline_id });
      source.native_crm_lead_id = lead.id;
      return { lead_id: leadId, crm_lead_id: lead.id, pipeline_id: lead.pipeline_id, save_status: "saved", synced: true };
    });
    db.pendingReviewLeads = db.pendingReviewLeads.filter((l: Json) => !ids.includes(l.id));
    return ok({ synced, errors: [] });
  }
  if (path === "/crm/leads/from-social-signal") {
    const ids: number[] = body?.signal_ids ?? [];
    const synced = ids.map((signalId) => {
      const signal = db.socialSignals.find((s: Json) => s.id === signalId) ?? {};
      const lead = crmLeadFromAny({ name: signal.company, location: signal.location, contact_person: signal.profile, source: "Social Listening" }, { pipeline_id: body?.pipeline_id });
      Object.assign(signal, { lead_id: lead.id, native_crm_saved: true, status: "added_to_crm" });
      return { lead_id: lead.id, signal_id: signalId, crm_lead_id: lead.id };
    });
    return ok({ synced, errors: [] });
  }

  // Social listening
  if (path === "/social-listening/signals") {
    const items = db.socialSignals.filter(
      (s: Json) =>
        s.status !== "dismissed" &&
        matchSearch(s, q.get("search")) &&
        (!q.get("source") || s.platform === q.get("source") || s.source.toLowerCase().includes(q.get("source")!.toLowerCase())) &&
        (!q.get("buying_stage") || s.buyingStage.toLowerCase() === q.get("buying_stage")!.toLowerCase()),
    );
    const p = paginate(items, q);
    return raw({ data: p.slice, meta: { current_page: p.page, last_page: p.lastPage, per_page: p.perPage, total: p.total } });
  }
  if ((m = path.match(/^\/social-listening\/signals\/(\d+)(\/\w+)?$/))) {
    const signal = db.socialSignals.find((s: Json) => s.id === Number(m![1]));
    if (!signal) return notFound();
    if (m[2] === "/outreach") return ok({ subject: `Saw your post, ${signal.profile.split(" ")[0]}`, body: signal.suggestedMessage, to_email: signal.enrichment?.contacts?.[0]?.email ?? null, activity_id: newId(), sent: Boolean(body?.send), channel: "email" });
    if (m[2] === "/reminder") return ok({ id: signal.id, remind_at: body?.remind_at ?? nowIso() });
    if (m[2] === "/dismiss") {
      signal.status = "dismissed";
      return ok(signal);
    }
    return ok(signal);
  }
  if (path.startsWith("/signal-types")) return ok(db.signalTypes);
  if (path === "/social-listening/metrics") return ok(db.socialListeningMetrics);
  if (path === "/social-listening/settings") {
    if (!GET) Object.assign(db.socialListeningSettings, body);
    return ok(db.socialListeningSettings);
  }
  if (path.startsWith("/social-listening/runs")) {
    const run = db.socialListeningMetrics.latest_run;
    return ok({ ...run, bootstrapped: true, latest_run: run });
  }

  // CRM (native)
  const crm = db.crm;
  if (path.startsWith("/crm/assignees")) return ok({ items: crm.assignees });
  if (path.startsWith("/crm/pipelines")) {
    if (GET) return ok({ items: crm.pipelines });
    if ((m = path.match(/^\/crm\/pipelines\/(\d+)\/delete$/))) {
      crm.pipelines = crm.pipelines.filter((p: Json) => p.id !== Number(m![1]));
      return ok({ deleted_pipeline_id: Number(m[1]) });
    }
    if ((m = path.match(/^\/crm\/pipelines\/(\d+)/))) {
      const pipeline = crm.pipelines.find((p: Json) => p.id === Number(m![1]));
      if (path.endsWith("/set-default")) crm.pipelines.forEach((p: Json) => (p.is_default = p === pipeline));
      else Object.assign(pipeline ?? {}, body);
      return ok({ pipeline });
    }
    const pipeline = { id: newId(), company_id: 1, currency_code: "NGN", sort_order: crm.pipelines.length, is_default: false, ...body };
    crm.pipelines.push(pipeline);
    return ok({ pipeline });
  }
  if (path.startsWith("/crm/preferences")) {
    if (!GET && body?.pipeline_id) crm.preferences.preferred_pipeline_id = Number(body.pipeline_id);
    return ok(crm.preferences);
  }
  if (path.startsWith("/crm/labels")) {
    if (GET) return ok({ items: crm.labels });
    if (path === "/crm/labels/reorder") {
      const order: Json[] = body?.label_ids ?? body?.ids ?? [];
      crm.labels.sort((a: Json, b: Json) => order.indexOf(a.id) - order.indexOf(b.id));
      crm.labels.forEach((l: Json, i: number) => (l.sort_order = i));
      return ok({ items: crm.labels });
    }
    if ((m = path.match(/^\/crm\/labels\/(\d+)\/delete$/))) {
      crm.labels = crm.labels.filter((l: Json) => l.id !== Number(m![1]));
      return ok({ deleted_label_id: Number(m[1]), deleted_leads_count: 0 });
    }
    if ((m = path.match(/^\/crm\/labels\/(\d+)$/))) {
      const label = crm.labels.find((l: Json) => l.id === Number(m![1]));
      Object.assign(label ?? {}, body);
      return ok({ label });
    }
    const name = body?.name ?? "New stage";
    const label = { id: newId(), company_id: 1, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), color: body?.color ?? "#6B5BD2", sort_order: crm.labels.length, is_default: false };
    crm.labels.push(label);
    return ok({ label });
  }
  if (path.startsWith("/crm/leads/analytics")) return ok({ ...crm.analytics, total_leads: crm.leads.length });
  if (path.startsWith("/crm/leads/agent-uploads-overview")) return ok(crm.agentUploadsOverview);
  if (path.startsWith("/crm/leads/pipeline")) {
    const leads = crm.leads.filter((l: Json) => !q.get("pipeline_id") || l.pipeline_id === Number(q.get("pipeline_id")));
    return ok({ total: leads.length, stages: crm.labels.map((l: Json) => ({ status: l.slug, name: l.name, color: l.color, count: leads.filter((x: Json) => x.status === l.slug).length })) });
  }
  if (path.startsWith("/crm/leads/import")) return ok({ imported_count: 0, updated_count: 0, skipped_count: 0, failed_rows: [], skipped_rows: [], total_rows: 0, duplicates: [] });
  if (path === "/crm/leads" || path.startsWith("/crm/leads?")) {
    if (!GET) return ok({ lead: crmLeadFromAny(body ?? {}, body ?? {}) });
    const slugs = crm.labels.map((l: Json) => l.slug);
    const items = crm.leads.filter(
      (l: Json) =>
        (!q.get("pipeline_id") || l.pipeline_id === Number(q.get("pipeline_id"))) &&
        (!q.get("status") || l.status === q.get("status")) &&
        (q.get("uncategorized") !== "true" && q.get("uncategorized") !== "1" ? true : !slugs.includes(l.status)) &&
        (!q.get("priority") || l.priority === q.get("priority")) &&
        (!q.get("assigned_to_user_id") || l.assigned_to_user_id === Number(q.get("assigned_to_user_id"))) &&
        (!q.get("source") || l.source === q.get("source")) &&
        matchSearch({ n: l.name, e: l.email, c: l.company_name, loc: l.location }, q.get("search")),
    );
    const p = paginate(items, q);
    return ok({
      items: p.slice,
      pagination: { next_page_url: p.page < p.lastPage ? `?page=${p.page + 1}` : null, prev_page_url: p.page > 1 ? `?page=${p.page - 1}` : null, per_page: p.perPage, current_page: p.page, total: p.total, last_page: p.lastPage },
    });
  }
  if ((m = path.match(/^\/crm\/leads\/(\d+)(\/[\w/]+)?$/))) {
    const lead = crm.leads.find((l: Json) => l.id === Number(m![1]));
    if (!lead) return notFound();
    const sub = m[2] ?? "";
    if (sub === "/notes" && !GET) {
      const note = { id: newId(), lead_id: lead.id, company_id: 1, note: body?.note ?? "", creator: lead.creator, created_at: nowIso(), updated_at: nowIso() };
      lead.notes = [note, ...(lead.notes ?? [])];
      return ok({ note });
    }
    if (sub === "/activities" && !GET) {
      const activity = { id: newId(), lead_id: lead.id, company_id: 1, ...body, happened_at: body?.happened_at ?? nowIso(), creator: lead.creator, created_at: nowIso() };
      lead.activities = [activity, ...(lead.activities ?? [])];
      return ok({ activity });
    }
    if (sub.startsWith("/emails")) return ok({ items: [], threads: [], pagination: { next_page_url: null, prev_page_url: null, per_page: 20 } });
    if (method === "DELETE") {
      crm.leads = crm.leads.filter((l: Json) => l.id !== lead.id);
      return ok({ deleted_lead_id: lead.id });
    }
    if (method === "PATCH" || method === "PUT") {
      Object.assign(lead, body, { updated_at: nowIso() });
      if (body?.pipeline_id) {
        const pipeline = crm.pipelines.find((p: Json) => p.id === Number(body.pipeline_id));
        if (pipeline) lead.pipeline = { id: pipeline.id, name: pipeline.name, currency_code: pipeline.currency_code };
      }
    }
    return ok({ lead });
  }

  // Map
  const map = db.map;
  if (path === "/map/provider") return ok({ provider: map.provider });
  if (path.startsWith("/map/poi-display")) return ok({ enabled: false, global_enabled: false });
  if (path === "/map-credits/transactions") return ok({ items: [], pagination: { next_page_url: null, prev_page_url: null, per_page: 20 } });
  if (path.startsWith("/map-credits")) return ok(map.credits);
  if ((m = path.match(/^\/(admin|agent)\/locations(?:\/(\d+))?$/))) {
    if (m[2]) {
      const location = map.savedLocations.find((l: Json) => l.id === Number(m![2]));
      if (method === "DELETE") {
        map.savedLocations = map.savedLocations.filter((l: Json) => l.id !== Number(m![2]));
        return ok({ deleted: true });
      }
      if (location && method !== "GET") Object.assign(location, body);
      return location ? ok({ location }) : notFound();
    }
    if (!GET) {
      const location = { id: newId(), company_id: 1, can_manage: true, is_active: true, type: "business", description: null, address: null, contact_number: null, email: null, meta: null, created_at: nowIso(), updated_at: nowIso(), ...body };
      map.savedLocations.unshift(location);
      return ok({ location });
    }
    const num = (k: string) => (q.get(k) == null ? null : Number(q.get(k)));
    const [minLat, maxLat, minLng, maxLng] = [num("min_lat"), num("max_lat"), num("min_lng"), num("max_lng")];
    const items = map.savedLocations.filter(
      (l: Json) =>
        (minLat == null || l.latitude >= minLat) && (maxLat == null || l.latitude <= maxLat) &&
        (minLng == null || l.longitude >= minLng) && (maxLng == null || l.longitude <= maxLng) &&
        (!q.get("type") || l.type === q.get("type")) && matchSearch({ n: l.name, a: l.address }, q.get("q")),
    );
    const p = paginate(items, q);
    return ok({ items: p.slice, pagination: { next_page_url: p.page < p.lastPage ? `?page=${p.page + 1}` : null, prev_page_url: null, per_page: p.perPage, current_page: p.page, total: p.total, last_page: p.lastPage } });
  }
  const mapMeta = { company_id: 1, palette: ["#2AE9C9", "#6B5BD2", "#E0A100", "#E85D9A", "#42A8A1"], generated_at: nowIso(), trail_lookback_days: 7, max_trail_points_per_agent: 200 };
  if (path === "/admin/territories/coverage-points") return ok({ items: map.coverage, meta: mapMeta });
  if (path === "/admin/territories") return ok({ items: map.territories, meta: mapMeta });
  if ((m = path.match(/^\/admin\/territories\/(\d+)$/))) {
    const territory = map.territories.find((t: Json) => t.user_id === Number(m![1]));
    if (territory && !GET) Object.assign(territory, body, { updated_at: nowIso() });
    return ok({ territory });
  }
  if (path === "/agent/territory") return ok({ territory: map.territories[0], coverage: map.coverage[0], meta: mapMeta });
  const today = new Date().toISOString().slice(0, 10);
  if (path === "/attendance/map-snapshots") return ok({ date: today, items: map.attendanceSnapshots });
  if (path === "/agent/attendance/map-snapshot") return ok({ date: today, items: map.attendanceSnapshots.slice(0, 1) });
  if (path === "/field-activity/live") return ok({ date: today, agents: map.fieldActivityLive });
  if (path.startsWith("/places")) return ok({ items: [], places: [], predictions: [] });

  // Ely (copilot) — chat itself streams; see elyStream()
  const ely = db.ely;
  if (path === "/copilot/threads") return ok({ items: ely.threads });
  if (path === "/copilot/threads/search") {
    const term = (q.get("q") || q.get("query") || "").toLowerCase();
    const items = ely.threads.filter((t: Json) => JSON.stringify(t).toLowerCase().includes(term)).map((t: Json) => ({ thread_id: t.thread_id, title: t.title, updated_at: t.updated_at, snippet: t.last_message_preview, match_message_id: "", match_role: "assistant", message_count: t.message_count }));
    return ok({ items, pagination: { has_more: false, next_cursor: null, scanned_threads: ely.threads.length } });
  }
  if ((m = path.match(/^\/copilot\/threads\/([^/]+)(\/messages)?$/))) {
    const id = decodeURIComponent(m[1]);
    const messages = ely.messages[id] ?? [];
    if (method === "DELETE") {
      ely.threads = ely.threads.filter((t: Json) => t.thread_id !== id);
      return ok({ deleted: true });
    }
    const pagination = { has_more: false, next_cursor: null, loaded_count: messages.length };
    if (m[2]) return ok({ conversation_id: id, messages, pagination });
    return ok({ thread: { thread_id: id, company_id: 1, user_id: db.user.id, created_at: nowIso(), updated_at: nowIso(), messages, message_count: messages.length, pagination } });
  }
  if (path.startsWith("/copilot/forecast/overview")) return ok({ ...ely.forecast, forecast: { ...ely.forecast.forecast, horizon_days: Number(q.get("horizon") || 7) } });
  if (path.startsWith("/copilot/assignees")) return ok({ items: crm.assignees.map((a: Json) => ({ ...a, user_id: a.id })) });
  if (path === "/copilot/email/regenerate" || path === "/copilot/email/enhance") {
    const subject = body?.subject || "Quick follow-up";
    const text = `Hi there,\n\nFollowing up on my last note — I'd love to show you how Sales Engine helps teams like yours turn field activity into pipeline. Would Thursday at 11am work for a quick call?\n\nBest,\n${db.user.name}`;
    return ok({ subject, body_text: text, previous: { subject: body?.subject ?? "", body_text: body?.body_text ?? "" } });
  }
  if (path.startsWith("/copilot/reports/weekly-summary")) return ok({ report_id: "demo-report", status: "completed", queued: true, progress: 100, error: null, available: false });
  if (path === "/copilot/chat") {
    const reply = elyReply(body?.message ?? "");
    return ok({ thread_id: body?.thread_id || "thr-demo-new", role: "owner", company_id: 1, intent: { type: "answer", tool: null, confidence: 0.9 }, response: { content: reply, tool: null, sources: ["CRM"], payload: null } });
  }

  if (path === "/countries") {
    return ok({ countries: [["Nigeria", "NG"], ["Ghana", "GH"], ["Kenya", "KE"], ["South Africa", "ZA"], ["Rwanda", "RW"], ["United Kingdom", "GB"]].map(([label, code]) => ({ label, value: code, code })) });
  }

  // Factory endpoints still referenced by shared components
  if (path.startsWith("/meetings/attendees")) return ok({ items: crm.assignees, users: crm.assignees });
  if (path.startsWith("/meetings")) return ok(GET ? { items: [], meetings: [] } : { meeting: { id: newId(), ...body } });
  if (path.startsWith("/internal-users")) return ok({ items: crm.assignees, users: crm.assignees, zones: [] });
  if (path.startsWith("/notifications")) return ok({ items: [], unread_count: 0 });

  // Fallback: empty list for reads, echo for writes
  return ok(GET ? [] : { ...(body ?? {}), id: newId() });
}

// ── fetch patch ──────────────────────────────────────────────────────────────
function resolveApiPath(url: string): string | null {
  for (const base of API_BASES) {
    if (url.startsWith(base)) return url.slice(base.length) || "/";
  }
  return null;
}

export function installMockApi() {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { __mockApiInstalled?: boolean };
  if (w.__mockApiInstalled) return;
  w.__mockApiInstalled = true;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const apiPath = resolveApiPath(url) ?? (url.startsWith("/api/support/proxy") ? url.replace("/api/support/proxy", "") : null);
    if (apiPath === null) return realFetch(input, init);

    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const [pathname, search = ""] = apiPath.split("?");
    let body: Json = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    if (pathname === "/copilot/chat" && body?.stream) return elyStream(body);
    let result: { status: number; json: Json };
    try {
      result = route({ method, path: pathname.replace(/\/+$/, "") || "/", q: new URLSearchParams(search), body });
    } catch (error) {
      console.warn("[mock-api] handler error", method, pathname, error);
      result = ok(method === "GET" ? [] : {});
    }

    if (pathname.endsWith("/export")) {
      const rows = db.crm.leads.map((l: Json) => [l.name, l.email, l.phone, l.status].join(","));
      return new Response(["name,email,phone,status", ...rows].join("\n"), {
        status: 200,
        headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="crm-leads.csv"' },
      });
    }
    return new Response(JSON.stringify(result.json), { status: result.status, headers: { "Content-Type": "application/json" } });
  };
}
