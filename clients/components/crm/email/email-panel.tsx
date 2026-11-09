"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Pencil, Settings, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { seRequest } from "@/lib/api/sales-engine";
import { getSalesEngineOrgId } from "@/lib/sales-engine/session";
import type { ApiRoleBasePath } from "@/lib/api/crm";
import { OutreachSettingsModal } from "@/components/sales-engine/outreach-settings-modal";

type NativeEmail = { id: number; subject: string | null; body: string | null; to_email: string | null; delivery_status: string | null; created_at: string; bounce_reason: string | null };

export function EmailPanel({ leadId, leadName, leadEmail, className = "" }: { className?: string; leadId: number | string; leadName: string; leadEmail?: string | null; companyId?: number | string; basePath?: ApiRoleBasePath }) {
  const client = useQueryClient();
  const key = ["crm", "emails", getSalesEngineOrgId(), leadId];
  const emails = useQuery({ queryKey: key, queryFn: () => seRequest<{ items: NativeEmail[] }>({ method: "GET", path: `/crm/leads/${leadId}/emails` }) });
  const [compose, setCompose] = useState(false);
  const [selected, setSelected] = useState<NativeEmail | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recipient, setRecipient] = useState(typeof leadEmail === "string" ? leadEmail : "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => seRequest<{ activity: NativeEmail }>({ method: "POST", path: `/crm/leads/${leadId}/emails`, body: { to_email: recipient, subject, body, request_id: requestId } }),
    onSuccess: () => { toast.success("Email queued. Delivery status will update after sending."); setCompose(false); setRequestId(null); setSubject(""); setBody(""); void client.invalidateQueries({ queryKey: ["crm"] }); void client.invalidateQueries({ queryKey: ["sales-engine", "outreach"] }); },
    onError: (error) => toast.error(error.message),
  });
  const startCompose = () => { setRequestId(crypto.randomUUID()); setCompose(true); setSelected(null); };
  return <>
  <div className={`rounded-2xl border border-gray-100 bg-white p-5 ${className}`}>
    <div className="mb-4 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold text-inherit"><Mail size={16} /> Emails for {leadName}</h3><div className="flex gap-2"><button type="button" onClick={() => setSettingsOpen(true)} className="rounded-lg border p-2" aria-label="Sender settings"><Settings size={15} /></button><button type="button" onClick={startCompose} className="flex items-center gap-2 rounded-lg bg-dash-dark px-3 py-2 text-xs text-white"><Pencil size={13} /> Compose</button></div></div>
    <p className="mb-4 text-xs text-gray-500">Outgoing email history uses your Sales Engine sender. Incoming mailbox synchronization is unavailable.</p>
    {compose ? <form onSubmit={(event) => { event.preventDefault(); send.mutate(); }} className="space-y-3">
      <button type="button" onClick={() => setCompose(false)} disabled={send.isPending} className="flex items-center gap-1 text-xs text-gray-500"><ArrowLeft size={14} /> Back</button>
      <label className="block text-xs">Recipient<input type="email" required value={recipient} onChange={e => setRecipient(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
      <label className="block text-xs">Subject<input required maxLength={255} value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
      <label className="block text-xs">Message<textarea required maxLength={20000} value={body} onChange={e => setBody(e.target.value)} rows={8} className="mt-1 w-full rounded-lg border p-2" /></label>
      <button disabled={send.isPending} className="rounded-lg bg-dash-dark px-4 py-2 text-sm text-white">{send.isPending ? "Queuing…" : "Send reviewed email"}</button>
    </form> : selected ? <div><button onClick={() => setSelected(null)} className="mb-3 text-xs text-gray-500">Back to history</button><h4 className="font-semibold">{selected.subject || "No subject"}</h4><p className="text-xs text-gray-500">To: {selected.to_email} · {selected.delivery_status || "Draft"}</p><p className="mt-4 whitespace-pre-wrap text-sm">{selected.body}</p>{selected.bounce_reason && <p className="mt-3 text-sm text-red-600">{selected.bounce_reason}</p>}</div> : emails.isLoading ? <p className="text-sm text-gray-500">Loading email history…</p> : emails.isError ? <div role="alert" className="text-sm text-red-600">Could not load emails. <button onClick={() => { void emails.refetch(); }}>Retry</button></div> : emails.data?.items.length ? <div className="divide-y">{emails.data.items.map(email => <button type="button" key={email.id} onClick={() => setSelected(email)} className="block w-full py-3 text-left"><p className="text-sm font-semibold">{email.subject || "No subject"}</p><p className="text-xs text-gray-500">{email.to_email} · {email.delivery_status || "Draft"} · {new Date(email.created_at).toLocaleDateString()}</p></button>)}</div> : <p className="py-8 text-center text-sm text-gray-400">No outgoing emails yet.</p>}
  </div>
  <OutreachSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </>;
}
