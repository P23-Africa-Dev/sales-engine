"use client";

import { ChevronLeft, ChevronRight, Mail, MapPin, Phone, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";

import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import PhoneNumberInput from "@/components/ui/phone-number-input";
import type { LeadContact } from "@/lib/api/crm";

export type LeadContactErrors = Partial<Record<"name" | "email" | "phone" | "location", string>>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-0.5 text-right text-[11px] text-red-500">{message}</p>;
}

export function LeadContactsSlider({
  contacts,
  activeIndex,
  errors = [],
  onActiveIndexChange,
  onChange,
  onAdd,
  onRemove,
}: {
  contacts: LeadContact[];
  activeIndex: number;
  errors?: LeadContactErrors[];
  onActiveIndexChange: (index: number) => void;
  onChange: (index: number, contact: LeadContact) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const contact = contacts[activeIndex] ?? contacts[0];
  const contactErrors = errors[activeIndex] ?? {};
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < contacts.length - 1;

  if (!contact) return null;

  const setField = (field: keyof Pick<LeadContact, "name" | "email" | "phone" | "location">, value: string) => {
    onChange(activeIndex, { ...contact, [field]: value });
  };

  return (
    <section className="mb-5 space-y-4" aria-label="Lead contact details">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-center text-[12px] font-medium text-gray-500">
          Lead Contact Details
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add another contact"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-[#0B1215] shadow-sm transition hover:border-[#6FA8A6] hover:bg-[#F1F8F7]"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
        <button
          type="button"
          aria-label="Previous contact"
          disabled={!canGoBack}
          onClick={() => onActiveIndexChange(activeIndex - 1)}
          className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-[#0B1215] disabled:cursor-not-allowed disabled:opacity-25"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-[12px] font-semibold text-[#0B1215]">
            Contact {activeIndex + 1} of {contacts.length}
          </p>
          <p className="text-[10px] text-gray-400">
            {activeIndex === 0 ? "Primary contact" : "Additional contact"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {contacts.length > 1 && (
            <button
              type="button"
              aria-label={`Remove contact ${activeIndex + 1}`}
              onClick={() => onRemove(activeIndex)}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label="Next contact"
            disabled={!canGoForward}
            onClick={() => onActiveIndexChange(activeIndex + 1)}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-[#0B1215] disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div key={activeIndex} className="animate-in fade-in slide-in-from-right-2 space-y-4 duration-200">
        <div>
          <FormRow label="Name *" labelClassName="w-28">
            <InlineInput
              value={contact.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="E.g John Doe"
              className="col-span-2"
            />
          </FormRow>
          <FieldError message={contactErrors.name} />
        </div>

        <div>
          <FormRow label="Email" labelClassName="w-28">
            <InlineInput
              type="email"
              value={contact.email ?? ""}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="E.g john.doe@example.com"
              className="col-span-2"
            />
          </FormRow>
          <FieldError message={contactErrors.email} />
        </div>

        <div>
          <FormRow label="Phone" labelClassName="w-28">
            <div className="col-span-2 w-full">
              <PhoneNumberInput
                value={contact.phone ?? ""}
                onChange={(value) => setField("phone", value)}
                placeholder="E.g 555-0199"
                defaultCountry="GB"
                variant="compact"
              />
            </div>
          </FormRow>
          <FieldError message={contactErrors.phone} />
        </div>

        <div>
          <FormRow label="Location" labelClassName="w-28">
            <InlineInput
              value={contact.location ?? ""}
              onChange={(event) => setField("location", event.target.value)}
              placeholder="E.g New York, USA"
              className="col-span-2"
            />
          </FormRow>
          <FieldError message={contactErrors.location} />
        </div>
      </div>
    </section>
  );
}

export function LeadContactsView({ contacts }: { contacts: LeadContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <section aria-label="Lead contacts" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-[#0B1215]">Contacts</h2>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-500">
          {contacts.length} total
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {contacts.map((contact, index) => (
          <article key={contact.id ?? `${contact.name}-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#094B5C] shadow-sm">
                  <User size={14} />
                </div>
                <p className="truncate text-[13px] font-semibold text-[#0B1215]">{contact.name}</p>
              </div>
              {index === 0 && (
                <span className="rounded-full bg-[#E5F2F0] px-2 py-1 text-[9px] font-semibold text-[#094B5C]">
                  Primary
                </span>
              )}
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              {contact.email && <p className="flex items-center gap-2"><Mail size={12} />{contact.email}</p>}
              {contact.phone && <p className="flex items-center gap-2"><Phone size={12} />{contact.phone}</p>}
              {contact.location && <p className="flex items-center gap-2"><MapPin size={12} />{contact.location}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LeadContactHeroSlider({ contacts }: { contacts: LeadContact[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, Math.max(contacts.length - 1, 0));
  const contact = contacts[safeIndex];

  if (!contact) return null;

  const canGoBack = safeIndex > 0;
  const canGoForward = safeIndex < contacts.length - 1;

  return (
    <section
      aria-label="Lead contact details"
      className="space-y-5 border-b border-white/10 pb-6"
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7DD3FC]">
            Contact Details
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            Contact {safeIndex + 1} of {contacts.length}
            {safeIndex === 0 ? " · Primary" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous contact"
            disabled={!canGoBack}
            onClick={() => setActiveIndex(safeIndex - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next contact"
            disabled={!canGoForward}
            onClick={() => setActiveIndex(safeIndex + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        key={safeIndex}
        className="grid animate-in grid-cols-1 gap-x-6 gap-y-4 fade-in slide-in-from-right-2 duration-200 min-[480px]:grid-cols-2 sm:gap-x-8"
      >
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Name</span>
          <p className="truncate text-[16px] font-semibold text-white">{contact.name || "N/A"}</p>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Phone Number</span>
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="truncate text-[16px] font-semibold text-white hover:underline">
              {contact.phone}
            </a>
          ) : (
            <p className="text-[16px] font-semibold text-white">N/A</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Email Address</span>
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="truncate text-[16px] font-semibold text-[#7DD3FC] hover:underline">
              {contact.email}
            </a>
          ) : (
            <p className="text-[16px] font-semibold text-white">N/A</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Location</span>
          <p className="truncate text-[16px] font-semibold text-white">{contact.location || "N/A"}</p>
        </div>
      </div>
    </section>
  );
}
