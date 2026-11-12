"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  createSignalType,
  deleteSignalType,
  listManagedSignalTypes,
  updateSignalType,
  type SignalTypeDefinitionApi,
  type SignalTypeInput,
} from "@/lib/api/sales-engine";

type Draft = {
  label: string;
  triggerDescription: string;
  recencyWindowDays: number;
  targetRoles: string;
  searchPhrases: string;
};

function toDraft(type?: SignalTypeDefinitionApi): Draft {
  return {
    label: type?.label ?? "",
    triggerDescription: type?.triggerDescription ?? "",
    recencyWindowDays: type?.recencyWindowDays ?? 90,
    targetRoles: (type?.targetRoles ?? []).join(", "),
    searchPhrases: (type?.searchPhrases ?? []).join("\n"),
  };
}

function toInput(draft: Draft): SignalTypeInput {
  return {
    label: draft.label.trim(),
    triggerDescription: draft.triggerDescription.trim(),
    recencyWindowDays: Math.min(365, Math.max(1, Math.round(draft.recencyWindowDays) || 90)),
    targetRoles: draft.targetRoles.split(",").map((role) => role.trim()).filter(Boolean),
    searchPhrases: draft.searchPhrases.split("\n").map((phrase) => phrase.trim()).filter(Boolean),
  };
}

/**
 * Lets an account adapt the events it watches for: switch built-in types off, reword them,
 * set who to contact and how long an event stays relevant, or add its own types.
 * Built-in types are never changed for other accounts; editing one saves an account copy.
 */
export function SignalTypeEditor({ packs }: { packs: string[] }) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<SignalTypeDefinitionApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const activePacks = packs.filter((pack) => pack !== "none");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTypes(await listManagedSignalTypes());
    } catch {
      setError("Could not load event types. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const visible = types.filter((type) => activePacks.includes(type.pack));

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key);
    setError("");
    try {
      await action();
      await load();
      setEditingKey(null);
    } catch {
      setError("That change could not be saved. Check the fields and try again.");
    } finally {
      setBusyKey(null);
    }
  };

  const startEdit = (type?: SignalTypeDefinitionApi) => {
    setEditingKey(type?.key ?? "__new__");
    setDraft(toDraft(type));
  };

  if (activePacks.length === 0) {
    return null;
  }

  const editor = (key: string, onSave: () => void) => (
    <div className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <input
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        placeholder="Name, e.g. Government tender win"
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] outline-none focus:border-[#09232D]/40"
      />
      <textarea
        value={draft.triggerDescription}
        onChange={(e) => setDraft({ ...draft, triggerDescription: e.target.value })}
        placeholder="What counts as this event, e.g. A named company wins a public tender in the territory."
        rows={2}
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] outline-none focus:border-[#09232D]/40"
      />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-gray-600">
          Relevant for (days)
          <input
            type="number"
            min={1}
            max={365}
            value={draft.recencyWindowDays}
            onChange={(e) => setDraft({ ...draft, recencyWindowDays: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 text-[12px] outline-none"
          />
        </label>
        <label className="col-span-2 text-[11px] text-gray-600">
          Who to contact (comma separated; empty = your ICP roles)
          <input
            value={draft.targetRoles}
            onChange={(e) => setDraft({ ...draft, targetRoles: e.target.value })}
            placeholder="Export Director, Head of Sales"
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 text-[12px] outline-none"
          />
        </label>
      </div>
      <label className="block text-[11px] text-gray-600">
        News search wording (one per line; {"{industry}"}, {"{territory}"} and {"{role}"} are filled from your ICP)
        <textarea
          value={draft.searchPhrases}
          onChange={(e) => setDraft({ ...draft, searchPhrases: e.target.value })}
          placeholder="{industry} wins tender {territory}"
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 font-mono text-[11px] outline-none"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditingKey(null)}
          className="rounded-lg px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-100 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busyKey === key || !draft.label.trim() || !draft.triggerDescription.trim()}
          onClick={onSave}
          className="rounded-lg bg-[#09232D] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40 cursor-pointer"
        >
          {busyKey === key ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-100 bg-[#FAFAFA] px-3 py-2">
      <button
        type="button"
        onClick={() => {
          if (!open) {
            void load();
          }
          setOpen(!open);
        }}
        className="flex w-full items-center justify-between text-[12px] font-medium text-[#09232D] cursor-pointer"
        aria-expanded={open}
      >
        Customise these events
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
          {loading && types.length === 0 && <p className="text-[11px] text-gray-500">Loading…</p>}
          {visible.map((type) => (
            <div key={type.key} className="rounded-lg bg-white px-3 py-2 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-[12px] font-semibold ${type.active === false ? "text-gray-400 line-through" : "text-[#09232D]"}`}>
                    {type.label}
                    {type.isOwn && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">edited</span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-gray-500">
                    {type.triggerDescription} · {type.recencyWindowDays} days
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => run(type.key, () => updateSignalType(type.key, { active: type.active === false }))}
                    disabled={busyKey === type.key}
                    className="rounded-md px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100 cursor-pointer"
                  >
                    {type.active === false ? "Turn on" : "Turn off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(type)}
                    className="rounded-md px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100 cursor-pointer"
                  >
                    Edit
                  </button>
                  {type.isOwn && (
                    <button
                      type="button"
                      title={type.key.startsWith("custom_") ? "Delete this event type" : "Back to the built-in version"}
                      onClick={() => run(type.key, () => deleteSignalType(type.key))}
                      className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                    >
                      {type.key.startsWith("custom_") ? <Trash2 size={13} /> : <RotateCcw size={13} />}
                    </button>
                  )}
                </div>
              </div>
              {editingKey === type.key && editor(type.key, () => run(type.key, () => updateSignalType(type.key, toInput(draft))))}
            </div>
          ))}
          {editingKey === "__new__" ? (
            editor("__new__", () =>
              run("__new__", () => createSignalType({ ...toInput(draft), pack: activePacks[0] })),
            )
          ) : (
            <button
              type="button"
              onClick={() => startEdit()}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#09232D] hover:bg-white cursor-pointer"
            >
              <Plus size={13} /> Add your own event type
            </button>
          )}
        </div>
      )}
    </div>
  );
}
