"use client";

import {
  ArrowLeft,
  BookmarkPlus,
  ChevronDown,
  Info,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Save,
  FileText,
  Activity,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLead, useUpdateLead, useAddLeadNote, useAddLeadActivity, useCrmAssignees, useCrmLabels } from "@/hooks/use-crm";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  ApiLeadPriority,
  ApiLeadStatus,
  LeadApiItem,
  LeadNote,
  LeadActivity,
  LeadContact,
  UpdateLeadPayload,
} from "@/lib/api/crm";
import { getActiveCompanyContext } from "@/lib/company-context";
import { AddLeadModal } from "@/components/crm/add-lead-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmailPanel } from "@/components/crm/email/email-panel";
import { isValidUrl, normalizeWebsite, parseProfileUrls } from "@/lib/crm/lead-fields";
import { getLeadDetailDisplay, toTrimmedString } from "@/lib/crm/lead-details";
import { LeadContactHeroSlider, LeadContactsSlider, type LeadContactErrors } from "@/components/crm/lead-contacts";

const PRIORITY_OPTIONS = [
  { label: "Low", color: "#6B7280" },
  { label: "Medium", color: "#3B82F6" },
  { label: "High", color: "#F59E0B" },
  { label: "Urgent", color: "#EF4444" },
];

/* --- Notes Panel --------------------------------------- */

function NotesPanel({ leadId, notes = [], basePath = "/admin" }: { leadId: string | number; notes: LeadNote[]; basePath?: "/admin" | "/agent" }) {
  const [noteContent, setNoteContent] = useState("");
  const { mutate: addNote, isPending } = useAddLeadNote({
    onSuccess: () => {
      setNoteContent("");
      toast.success("Note added successfully");
    }
  }, basePath);

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    addNote({ leadId, payload: { note: noteContent } });
  };

  return (
    <div className="se-dark-surface se-lead-panel flex flex-col h-full rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 min-h-[500px]">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 pb-4 border-b border-gray-100">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#12343c] flex items-center justify-center border border-[#294f5d] shadow-sm shrink-0">
          <FileText size={18} className="text-orange-600" />
        </div>
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#0B1215]">Notes</h2>
          <p className="text-[10px] sm:text-[11px] text-gray-400 font-normal">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
            <FileText size={40} className="mb-3 opacity-20" />
            <p className="text-[14px] italic">No notes yet.</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-gray-700">{note.creator?.name || "System"}</span>
                <span className="text-[10px] text-gray-400">
                  {note.created_at ? new Date(note.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">{note.note}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-auto border-t border-gray-100 pt-4">
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Type a new note..."
          className="w-full h-[100px] resize-none outline-none text-[13px] text-[#374151] placeholder:text-gray-300 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3"
        />
        <button
          onClick={handleAddNote}
          disabled={!noteContent.trim() || isPending}
          className="se-primary w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[12px] text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Add Note"}
        </button>
      </div>
    </div>
  );
}

/* --- Activities Panel ---------------------------------- */

function ActivitiesPanel({ leadId, activities = [], basePath = "/admin" }: { leadId: string | number; activities: LeadActivity[]; basePath?: "/admin" | "/agent" }) {
  const [activityType, setActivityType] = useState("call");
  const [description, setDescription] = useState("");
  const { mutate: logActivity, isPending } = useAddLeadActivity({
    onSuccess: () => {
      setDescription("");
      toast.success("Activity logged");
    }
  }, basePath);

  const handleLogActivity = () => {
    if (!description.trim()) return;
    logActivity({
      leadId,
      payload: { type: activityType, description, happened_at: new Date().toISOString() }
    });
  };

  return (
    <div className="se-dark-surface se-lead-panel flex flex-col h-full rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 min-h-[500px]">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 pb-4 border-b border-gray-100">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#12343c] flex items-center justify-center border border-[#294f5d] shadow-sm shrink-0">
          <Activity size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#0B1215]">Activities</h2>
          <p className="text-[10px] sm:text-[11px] text-gray-400 font-normal">{activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 relative before:absolute before:inset-y-0 before:left-[19px] before:w-px before:bg-gray-200">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 relative z-10 bg-white">
            <Activity size={40} className="mb-3 opacity-20" />
            <p className="text-[14px] italic">No activities yet.</p>
          </div>
        ) : (
          activities.map((act) => (
            <div key={act.id} className="relative z-10 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm">
                <Activity size={16} className="text-gray-500" />
              </div>
              <div className="flex-1 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold text-gray-700 capitalize">{act.type.replace('_', ' ')}</span>
                  <span className="text-[10px] text-gray-400">
                    {act.happened_at ? new Date(act.happened_at).toLocaleString() : ''}
                  </span>
                </div>
                <p className="text-[12px] text-gray-600 font-medium mb-1">By {act.creator?.name || "System"}</p>
                {act.description && <p className="text-[12px] text-gray-500">{act.description}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-auto border-t border-gray-100 pt-4 space-y-3">
        <SearchableSelect
          value={activityType}
          onChange={setActivityType}
          options={[
            { value: "call", label: "Call" },
            { value: "meeting", label: "Meeting" },
            { value: "email", label: "Email Sent" },
            { value: "note", label: "Note Added" },
            { value: "status_change", label: "Status Change" },
            { value: "other", label: "Other" },
          ]}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-[13px] text-gray-700"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Activity description..."
          className="w-full outline-none text-[13px] text-[#374151] placeholder:text-gray-300 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
        />
        <button
          onClick={handleLogActivity}
          disabled={!description.trim() || isPending}
          className="se-primary w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[12px] text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Logging..." : "Log Activity"}
        </button>
      </div>
    </div>
  );
}

/* --- Lead Interaction Panel (Tabs) ----------------------- */

function LeadInteractionPanel({
  leadId,
  leadName,
  leadEmail,
  companyId,
  notes,
  activities,
  basePath = "/admin",
}: {
  leadId: string | number;
  leadName: string;
  leadEmail?: string | null;
  companyId?: number | string;
  notes: LeadNote[];
  activities: LeadActivity[];
  basePath?: "/admin" | "/agent";
}) {
  const [activeTab, setActiveTab] = useState<"emails" | "notes" | "activities">("emails");

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full min-h-[500px]">
      <div className="flex items-center gap-1 sm:gap-2 mb-4 bg-[#022228] border border-[#294f5d] p-1.5 rounded-full w-fit max-w-full">
        <button
          onClick={() => setActiveTab("emails")}
          className={`px-4 sm:px-5 py-2 rounded-full text-[12px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2ae9c9] ${activeTab === "emails" ? "se-primary" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
        >
          Emails
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          className={`px-4 sm:px-5 py-2 rounded-full text-[12px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2ae9c9] ${activeTab === "notes" ? "se-primary" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
        >
          Notes
        </button>
        <button
          onClick={() => setActiveTab("activities")}
          className={`px-4 sm:px-5 py-2 rounded-full text-[12px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2ae9c9] ${activeTab === "activities" ? "se-primary" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
        >
          Activities
        </button>
      </div>

      <div className="se-lead-interactions flex-1 h-full min-h-0">
        {activeTab === "emails" && (
          <EmailPanel
            className="se-dark-surface se-lead-panel min-h-[500px] p-6 sm:p-8"
            leadId={leadId}
            leadName={leadName}
            leadEmail={leadEmail}
            companyId={companyId}
            basePath={basePath}
          />
        )}
        {activeTab === "notes" && <NotesPanel leadId={leadId} notes={notes} basePath={basePath} />}
        {activeTab === "activities" && <ActivitiesPanel leadId={leadId} activities={activities} basePath={basePath} />}
      </div>
    </div>
  );
}

/* --- Dropdown Component ---------------------------------- */


function PillDropdown({
  value,
  color,
  options,
  onChange,
  disabled,
}: {
  value: string;
  color: string;
  options: { label: string; color: string }[];
  onChange: (label: string, color: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-[11px] font-medium transition-opacity hover:opacity-85"
        style={{ backgroundColor: color }}
      >
        {value}
        {!disabled && <ChevronDown size={11} />}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[150px]">
            {options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  onChange(opt.label, opt.color);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: opt.color }}
                />
                <span className="text-[12px] text-[#0B1215] font-normal">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --- Map Preview Component ------------------------------- */

function MapPreview({ name, location }: { name: string; location: string }) {
  return (
    <div className="relative w-full h-full bg-[#E8F0E8] rounded-[14px] overflow-hidden">
      {/* Fake map grid lines */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute w-full h-px bg-[#C5D5C5]"
            style={{ top: `${(i + 1) * 12}%` }}
          />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute h-full w-px bg-[#C5D5C5]"
            style={{ left: `${(i + 1) * 16}%` }}
          />
        ))}
      </div>

      {/* Diagonal "streets" */}
      <div className="absolute inset-0">
        <div
          className="absolute bg-white/60 h-0.5"
          style={{
            width: "140%",
            top: "40%",
            left: "-20%",
            transform: "rotate(-25deg)",
          }}
        />
        <div
          className="absolute bg-white/60 h-0.5"
          style={{
            width: "140%",
            top: "55%",
            left: "-20%",
            transform: "rotate(15deg)",
          }}
        />
        {/* Street label */}
        <div
          className="absolute text-[8px] text-[#6B8A6B] font-medium"
          style={{
            top: "20%",
            right: "15%",
            transform: "rotate(-30deg)",
          }}
        >
          Dresta Street
        </div>
      </div>

      {/* Location marker pin */}
      <div className="absolute" style={{ top: "22%", left: "38%" }}>
        <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-md" />
      </div>

      {/* Avatar + name tooltip */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/avatars/default-ghost.svg"
            alt={name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm">
          <p className="text-[9px] font-semibold text-[#0B1215]">{name}</p>
          <p className="text-[7px] text-gray-500 font-normal">
            {location}
          </p>
        </div>
      </div>

      {/* Compass / location icon */}
      <div className="absolute bottom-3 right-3 w-7 h-7 bg-[#D8B4FE] rounded-full flex items-center justify-center shadow-sm">
        <MapPin size={14} className="text-white" />
      </div>
    </div>
  );
}


type EditLeadForm = {
  contacts: LeadContact[];
  companyName: string;
  website: string;
  position: string;
  profileUrls: string[];
  status: ApiLeadStatus;
  source: string;
  priority: ApiLeadPriority;
  assigned_to_user_id: string;
  next_action: string;
};

/* --- Page Component -------------------------------------- */

export default function LeadDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const leadId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { user } = useAuthStore();
  const { apiCompanyId } = getActiveCompanyContext(user);
  const companyId = apiCompanyId ?? undefined;
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { data: labels = [] } = useCrmLabels(companyId, "/admin");
  const statusOptions = labels.map(label => ({ label: label.name, color: label.color, slug: label.slug }));

  // Real data fetching
  const { data: leadData, isLoading, isPending, isError } = useLead(leadId, companyId, "/admin");
  const { mutate: updateLead, isPending: isUpdating } = useUpdateLead({
    onSuccess: () => {
      toast.success("Lead updated successfully");
      setIsEditing(false);
    }
  });

  // Assignees list
  const { data: usersData } = useCrmAssignees(companyId, "/admin");
  const internalUsers = usersData || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditLeadForm>({
    contacts: [{ name: "", email: "", phone: "", location: "", sort_order: 0 }],
    companyName: "",
    website: "",
    position: "",
    profileUrls: [""],
    status: "new",
    source: "",
    priority: "medium",
    assigned_to_user_id: "",
    next_action: "",
  });
  const [activeContactIndex, setActiveContactIndex] = useState(0);
  const [contactErrors, setContactErrors] = useState<LeadContactErrors[]>([]);

  const buildEditForm = (lead: LeadApiItem): EditLeadForm => ({
    contacts: lead.contacts?.length
      ? lead.contacts.map((contact, index) => ({
          name: toTrimmedString(contact.name),
          email: toTrimmedString(contact.email),
          phone: toTrimmedString(contact.phone),
          location: toTrimmedString(contact.location),
          sort_order: index,
        }))
      : [{
          name: toTrimmedString(lead.name),
          email: toTrimmedString(lead.email),
          phone: toTrimmedString(lead.phone),
          location: toTrimmedString(lead.location),
          sort_order: 0,
        }],
    companyName: toTrimmedString(lead.company_name),
    website: toTrimmedString(lead.website),
    position: toTrimmedString(lead.position),
    profileUrls: Array.isArray(lead.profile_urls) && lead.profile_urls.length
      ? lead.profile_urls.map(toTrimmedString).filter(Boolean)
      : [""],
    status: lead.status || "new",
    source: toTrimmedString(lead.source),
    priority: lead.priority || "medium",
    assigned_to_user_id: lead.assigned_to_user_id ? String(lead.assigned_to_user_id) : "",
    next_action: toTrimmedString(lead.next_action),
  });

  const startEditing = () => {
    if (!leadData) return;
    setEditForm(buildEditForm(leadData));
    setActiveContactIndex(0);
    setContactErrors([]);
    setIsEditing(true);
  };

  const updateField = <K extends keyof EditLeadForm>(field: K, value: EditLeadForm[K]) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateContact = (index: number, contact: LeadContact) => {
    setEditForm((current) => ({
      ...current,
      contacts: current.contacts.map((item, itemIndex) => itemIndex === index ? contact : item),
    }));
    setContactErrors((current) => current.map((item, itemIndex) => itemIndex === index ? {} : item));
  };

  const addContact = () => {
    setEditForm((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        { name: "", email: "", phone: "", location: "", sort_order: current.contacts.length },
      ],
    }));
    setActiveContactIndex(editForm.contacts.length);
  };

  const removeContact = (index: number) => {
    setEditForm((current) => ({
      ...current,
      contacts: current.contacts
        .filter((_, itemIndex) => itemIndex !== index)
        .map((contact, sortOrder) => ({ ...contact, sort_order: sortOrder })),
    }));
    setContactErrors((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setActiveContactIndex((current) => Math.max(0, Math.min(current, editForm.contacts.length - 2)));
  };

  const handleSave = () => {
    const nextContactErrors = editForm.contacts.map<LeadContactErrors>((contact) => {
      const errors: LeadContactErrors = {};
      const name = toTrimmedString(contact.name);
      const email = toTrimmedString(contact.email);
      if (!name) errors.name = "Name is required.";
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Enter a valid email address.";
      }
      return errors;
    });
    const firstContactError = nextContactErrors.findIndex((errors) => Object.keys(errors).length > 0);
    if (firstContactError >= 0) {
      setContactErrors(nextContactErrors);
      setActiveContactIndex(firstContactError);
      toast.error(`Check Contact ${firstContactError + 1}.`);
      return;
    }

    const cleanedProfileUrls = parseProfileUrls(editForm.profileUrls);
    if (editForm.website.trim() && !isValidUrl(editForm.website)) {
      toast.error("Enter a valid website URL.");
      return;
    }
    if (cleanedProfileUrls.some((url) => !isValidUrl(url))) {
      toast.error("One or more profile URLs are invalid.");
      return;
    }

    const contacts = editForm.contacts.map((contact, index) => ({
      name: toTrimmedString(contact.name),
      email: toTrimmedString(contact.email) || null,
      phone: toTrimmedString(contact.phone) || null,
      location: toTrimmedString(contact.location) || null,
      sort_order: index,
    }));
    const primaryContact = contacts[0];
    const payload: UpdateLeadPayload = {
      name: primaryContact.name,
      email: primaryContact.email,
      phone: primaryContact.phone,
      location: primaryContact.location,
      contacts,
      company_name: editForm.companyName.trim() || null,
      website: editForm.website.trim() ? normalizeWebsite(editForm.website) : null,
      position: editForm.position.trim() || null,
      profile_urls: cleanedProfileUrls.length > 0 ? cleanedProfileUrls : null,
      status: editForm.status,
      source: editForm.source,
      priority: editForm.priority,
      next_action: editForm.next_action,
      assigned_to_user_id: editForm.assigned_to_user_id
        ? Number(editForm.assigned_to_user_id)
        : null,
    };
    updateLead({ leadId, payload });
  };

  if (!mounted || isLoading || (isPending && Boolean(leadId))) {
    return (
      <div className="se-workspace min-h-screen bg-[#F4F7F9] p-4 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0B1215]/20 border-t-[#0B1215] rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !leadData) {
    return (
      <div className="se-workspace min-h-screen bg-[#F4F7F9] p-4 flex flex-col items-center justify-center">
        <h2 className="text-xl font-bold text-gray-800">Lead not found</h2>
        <button onClick={() => router.back()} className="mt-4 text-blue-500 hover:underline">Go back</button>
      </div>
    );
  }

  const assignOptions = [
    { label: "Unassigned", color: "#6B7280", value: "" },
    ...internalUsers.map(u => ({ label: u.name, color: "#3B82F6", value: String(u.id) }))
  ];

  const currentAssignee = internalUsers.find(u => u.id === leadData.assigned_to_user_id);
  const currentAssigneeLabel = currentAssignee ? currentAssignee.name : "Unassigned";
  const leadDisplay = getLeadDetailDisplay(leadData);
  const leadContacts = leadData.contacts?.length
    ? leadData.contacts.map((c, i) => ({
        ...c,
        name: toTrimmedString(c.name),
        email: toTrimmedString(c.email) || null,
        phone: toTrimmedString(c.phone) || null,
        location: toTrimmedString(c.location) || null,
        sort_order: i,
      }))
    : [{
        name: toTrimmedString(leadData.name),
        email: toTrimmedString(leadData.email) || null,
        phone: toTrimmedString(leadData.phone) || null,
        location: toTrimmedString(leadData.location) || null,
        sort_order: 0,
      }];

  return (
    <div className="se-workspace min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-10">
      {isAddOpen && <AddLeadModal onClose={() => setIsAddOpen(false)} />}
      <div className="max-w-350 mx-auto flex flex-col gap-6">
        {/* -- Header ---------------------------------------- */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="se-control p-2 rounded-xl hover:bg-white/80 transition-all shrink-0"
              id="lead-back-btn"
            >
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-2xl font-semibold text-white tracking-tight truncate">
              Lead Details
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="se-primary flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 bg-white rounded-[14px] text-[13px] font-semibold text-[#64748B] hover:border-gray-300 transition-all shadow-sm whitespace-nowrap"
              id="add-new-lead-btn"
              onClick={() => setIsAddOpen(true)}
            >
              <BookmarkPlus size={16} />
              <span className="hidden min-[480px]:inline">Add New Lead</span>
              <span className="min-[480px]:hidden">Add</span>
            </button>
            {isEditing ? (
              <button
                onClick={handleSave}
                disabled={isUpdating}
                className="se-primary flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-bold hover:opacity-90 transition-all shadow-lg disabled:opacity-70"
                id="save-lead-btn"
              >
                {isUpdating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
                {isUpdating ? "Saving..." : "Save"}
              </button>
            ) : (
              <button
                onClick={startEditing}
                className="se-primary flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-bold hover:opacity-90 transition-all shadow-lg"
                id="edit-lead-btn"
              >
                <Pencil size={16} />
                Edit
              </button>
            )}
          </div>
        </div>

        {/* -- Main Content Grid ----------------------------- */}
        <div className="flex flex-col lg:flex-row gap-8 items-stretch">
          {/* -- LEFT COLUMN -------------------------------- */}
          <div className="flex-[1.2] flex flex-col gap-8 min-w-[50%]">
            {/* -- Hero Card (dark) ------------------------- */}
            <div className="se-dark-surface bg-[#0B1A1E] rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col sm:flex-row gap-6 sm:gap-8">
              {/* Left Part: White Info Card */}
              <div className="flex flex-col items-center gap-4 shrink-0 w-full sm:w-[180px]">
                <div className="bg-[#f0bbf7] border border-[#c860d2]/60 rounded-[24px] sm:rounded-[28px] p-4 shadow-xl flex flex-col items-center w-full">
                  <div className="relative w-24 sm:w-full aspect-square mb-4">
                    <div className="absolute inset-0 bg-black/20 rounded-[22px] blur-xl translate-y-4" />
                    <div className="relative w-full h-full rounded-[22px] overflow-hidden bg-[#f0bbf7] ring-1 ring-[#c860d2]/40 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/avatars/default-ghost.svg"
                        alt={leadData.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <h3 className="text-[#0B1215] text-[18px] font-semibold text-center leading-none mb-1.5 tracking-tight">
                    {leadData.name}
                  </h3>
                  <p className="text-[#6e1878]/75 text-[12px] font-normal text-center mb-3">
                    {leadData.created_at ? formatDistanceToNow(new Date(leadData.created_at), { addSuffix: true }) : "Unknown time"}
                  </p>
                  <span className="bg-[#0EA5E9] text-white text-[10px] font-semibold px-4 py-1 rounded-full uppercase tracking-tighter shadow-sm">
                    {leadData.priority || "Medium"}
                  </span>
                </div>
                {/* Action icons */}
                <div className="flex items-center gap-4">
                  {leadDisplay.email && leadDisplay.email !== "N/A" ? (
                    <a
                      href={`mailto:${leadDisplay.email}`}
                      className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-all shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100"
                      title={`Email ${leadDisplay.email}`}
                    >
                      <MessageSquare size={20} className="text-[#0B1215]" />
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-12 h-12 rounded-full bg-white/50 flex items-center justify-center opacity-50 cursor-not-allowed shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100"
                      title="No email available"
                    >
                      <MessageSquare size={20} className="text-[#0B1215]" />
                    </button>
                  )}
                  {leadDisplay.phone && leadDisplay.phone !== "N/A" ? (
                    <a
                      href={`tel:${leadDisplay.phone}`}
                      className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-all shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100"
                      title={`Call ${leadDisplay.phone}`}
                    >
                      <Phone size={20} className="text-[#0B1215]" />
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-12 h-12 rounded-full bg-white/50 flex items-center justify-center opacity-50 cursor-not-allowed shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100"
                      title="No phone available"
                    >
                      <Phone size={20} className="text-[#0B1215]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right Part: Fields & Map */}
              <div className="flex-1 flex flex-col gap-6 w-full min-w-0">
                {isEditing ? (
                  <div className="se-lead-edit rounded-[20px] border border-[#294f5d] bg-[#12343c] p-4 sm:p-5">
                    <LeadContactsSlider
                      contacts={editForm.contacts}
                      activeIndex={activeContactIndex}
                      errors={contactErrors}
                      onActiveIndexChange={setActiveContactIndex}
                      onChange={updateContact}
                      onAdd={addContact}
                      onRemove={removeContact}
                    />
                  </div>
                ) : (
                  <LeadContactHeroSlider contacts={leadContacts} />
                )}
                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-4">
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Company Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.companyName}
                        onChange={(e) => updateField("companyName", e.target.value)}
                        className="bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-semibold w-full outline-none focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-white text-[16px] font-semibold truncate">
                        {leadData.company_name || "N/A"}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Website
                    </label>
                    {isEditing ? (
                      <input
                        type="url"
                        value={editForm.website}
                        onChange={(e) => updateField("website", e.target.value)}
                        className="bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-semibold w-full outline-none focus:border-blue-500"
                      />
                    ) : leadData.website ? (
                      <a
                        href={leadData.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#7DD3FC] text-[16px] font-semibold truncate hover:underline"
                      >
                        {leadData.website}
                      </a>
                    ) : (
                      <p className="text-white text-[16px] font-semibold truncate">N/A</p>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Position
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.position}
                        onChange={(e) => updateField("position", e.target.value)}
                        className="bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-semibold w-full outline-none focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-white text-[16px] font-semibold truncate">
                        {leadData.position || "N/A"}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-gray-400 text-[11px] font-medium mb-1">
                      Profile URLs
                    </label>
                    {isEditing ? (
                      <div className="space-y-2">
                        {(editForm.profileUrls.length ? editForm.profileUrls : [""]).map((url, index) => (
                          <div key={index} className="flex gap-2">
                            <input
                              type="url"
                              value={url}
                              onChange={(e) => {
                                const next = [...(editForm.profileUrls.length ? editForm.profileUrls : [""])];
                                next[index] = e.target.value;
                                updateField("profileUrls", next);
                              }}
                              className="flex-1 bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-semibold w-full outline-none focus:border-blue-500"
                              placeholder="https://linkedin.com/in/username"
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => updateField("profileUrls", [...editForm.profileUrls, ""])}
                          className="text-[11px] font-semibold text-[#7DD3FC] hover:text-white"
                        >
                          + Add another URL
                        </button>
                      </div>
                    ) : (leadData.profile_urls?.length ?? 0) > 0 ? (
                      <div className="flex flex-col gap-1">
                        {leadData.profile_urls?.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#7DD3FC] text-[14px] font-semibold truncate hover:underline"
                          >
                            {url}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white text-[16px] font-semibold truncate">N/A</p>
                    )}
                  </div>
                </div>
                {/* Map */}
                <div className="w-full h-[160px] sm:flex-1 rounded-[24px] overflow-hidden shadow-inner">
                  <MapPreview name={leadData.name} location={leadDisplay.mapLocationLabel} />
                </div>
              </div>
            </div>

            {/* -- Lead Details Card ------------------------ */}
            <div className="se-dark-surface se-lead-panel rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex-1">
              <div className="flex items-center gap-4 mb-8 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm">
                  <Info size={20} className="text-[#0B1215]" />
                </div>
                <h2 className="text-[18px] font-semibold text-[#0B1215]">
                  Lead Details
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 sm:gap-x-12 gap-y-6 sm:gap-y-8">
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Status
                  </label>
                  <PillDropdown
                    value={isEditing ? (statusOptions.find(o => o.slug === editForm.status)?.label || "New Lead") : (statusOptions.find(o => o.slug === leadData.status)?.label || "New Lead")}
                    color={statusOptions.find(o => o.slug === (isEditing ? editForm.status : leadData.status))?.color || "#2563EB"}
                    options={statusOptions}
                    onChange={(label) => {
                      const value = statusOptions.find(option => option.label === label)?.slug || leadData.status;
                      updateField("status", value as ApiLeadStatus);
                    }}
                    disabled={!isEditing}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Pipeline
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadDisplay.pipelineName}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Uploaded By
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold">
                    {leadDisplay.creatorName}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Last Interaction
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadDisplay.lastInteraction}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Interaction Date
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadDisplay.lastInteractionAt}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Source
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.source}
                      onChange={(e) => updateField("source", e.target.value)}
                      className="bg-white border border-gray-100 rounded-xl px-4 py-1.5 text-[#0B1215] text-[14px] font-medium w-full outline-none focus:border-blue-500 shadow-sm"
                    />
                  ) : (
                    <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                      {leadDisplay.source}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Assign to
                  </label>
                  {isEditing ? (
                    <SearchableSelect
                      value={editForm.assigned_to_user_id || ""}
                      onChange={(v) => updateField("assigned_to_user_id", v)}
                      options={assignOptions}
                      className="bg-white border border-gray-100 rounded-xl px-3 py-1.5 text-[14px] min-w-40"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-[11px] font-medium w-fit" style={{ backgroundColor: currentAssignee ? "#3B82F6" : "#EF4444" }}>
                      {currentAssigneeLabel}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Next Action
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.next_action}
                      onChange={(e) => updateField("next_action", e.target.value)}
                      className="bg-white border border-gray-100 rounded-xl px-4 py-1.5 text-[#0B1215] text-[14px] font-medium w-full outline-none focus:border-blue-500 shadow-sm"
                    />
                  ) : (
                    <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                      {leadDisplay.nextAction}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Priority
                  </label>
                  <PillDropdown
                    value={isEditing ? (editForm.priority ? editForm.priority.charAt(0).toUpperCase() + editForm.priority.slice(1) : "Medium") : (leadData.priority ? leadData.priority.charAt(0).toUpperCase() + leadData.priority.slice(1) : "Medium")}
                    color={PRIORITY_OPTIONS.find(o => o.label.toLowerCase() === (isEditing ? editForm.priority : leadData.priority))?.color || "#3B82F6"}
                    options={PRIORITY_OPTIONS}
                    onChange={(label) => {
                      updateField("priority", label.toLowerCase() as ApiLeadPriority);
                    }}
                    disabled={!isEditing}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Budget
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadDisplay.budget}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Map Link
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold truncate">
                    {leadDisplay.mapLinkState}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Created
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold">
                    {leadDisplay.createdAt}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                    Updated
                  </label>
                  <p className="text-[#0B1215] text-[16px] font-semibold">
                    {leadDisplay.updatedAt}
                  </p>
                </div>
                {leadDisplay.convertedAt ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-400 text-[12px] font-medium uppercase tracking-widest">
                      Converted
                    </label>
                    <p className="text-[#0B1215] text-[16px] font-semibold">
                      {leadDisplay.convertedAt}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* -- RIGHT COLUMN: Interaction Panel ------- */}
          <LeadInteractionPanel
            leadId={leadId}
            leadName={leadDisplay.name}
            leadEmail={leadDisplay.email !== "N/A" ? leadDisplay.email : null}
            companyId={companyId}
            notes={leadData.notes || []}
            activities={leadData.activities || []}
            basePath="/admin"
          />
        </div>
      </div>
    </div>
  );
}
