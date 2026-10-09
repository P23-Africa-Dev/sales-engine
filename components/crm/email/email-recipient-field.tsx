"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useInternalUsers } from "@/hooks/use-internal-users";
import type { EmailRecipient } from "@/lib/api/crm-emails";

type EmailRecipientFieldProps = {
    label: string;
    recipients: EmailRecipient[];
    onChange: (recipients: EmailRecipient[]) => void;
    companyId?: number | string;
    placeholder?: string;
};

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function EmailRecipientField({
    label,
    recipients,
    onChange,
    companyId,
    placeholder = "Add email...",
}: EmailRecipientFieldProps) {
    const [input, setInput] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowSearch(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setShowSearch(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const { data: internalUsers = [] } = useInternalUsers({
        company_id: companyId,
    });

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return internalUsers.slice(0, 8);
        return internalUsers
            .filter((user) =>
                user.name.toLowerCase().includes(q) ||
                user.email.toLowerCase().includes(q),
            )
            .slice(0, 8);
    }, [internalUsers, search]);

    const addRecipient = (recipient: EmailRecipient) => {
        if (recipients.some((item) => item.email.toLowerCase() === recipient.email.toLowerCase())) {
            return;
        }
        onChange([...recipients, recipient]);
        setInput("");
        setSearch("");
        setShowSearch(false);
    };

    const commitInput = () => {
        const email = input.trim().toLowerCase();
        if (!isValidEmail(email)) return;
        addRecipient({ email, name: null });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            commitInput();
        }
    };

    return (
        <div ref={containerRef} className="flex items-start gap-3 py-3 border-b border-gray-50">
            <label className="text-[12px] font-bold text-gray-400 w-12 shrink-0 uppercase tracking-wider pt-1.5">
                {label}
            </label>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    {recipients.map((recipient) => (
                        <button
                            key={recipient.email}
                            type="button"
                            onClick={() => onChange(recipients.filter((item) => item.email !== recipient.email))}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1215] px-3 py-1.5 text-[11px] font-medium text-white"
                        >
                            {recipient.name ?? recipient.email}
                            <X size={10} className="opacity-70" />
                        </button>
                    ))}
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setShowSearch(true)}
                        placeholder={placeholder}
                        className="min-w-[140px] flex-1 outline-none text-[13px] text-[#0B1215] placeholder:text-gray-300 bg-transparent"
                    />
                </div>
                {showSearch && (
                    <div className="mt-2 rounded-xl border border-gray-100 bg-white shadow-sm">
                        <div className="flex items-center gap-2 border-b border-gray-50 px-3 py-2">
                            <Search size={14} className="text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search internal users..."
                                className="flex-1 outline-none text-[12px] text-[#0B1215]"
                            />
                        </div>
                        <div className="max-h-40 overflow-y-auto p-1">
                            {filteredUsers.map((user) => (
                                <button
                                    key={user.id}
                                    type="button"
                                    onClick={() => addRecipient({
                                        email: user.email,
                                        name: user.name,
                                        user_id: user.id,
                                    })}
                                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-gray-50"
                                >
                                    <div>
                                        <p className="text-[12px] font-medium text-[#0B1215]">{user.name}</p>
                                        <p className="text-[10px] text-gray-500">{user.email}</p>
                                    </div>
                                </button>
                            ))}
                            {filteredUsers.length === 0 && (
                                <p className="px-3 py-2 text-[11px] text-gray-400">No internal users found.</p>
                            )}
                        </div>
                        <p className="border-t border-gray-50 px-3 py-2 text-[10px] text-gray-400">
                            Press Enter or Tab to add external email. Click a chip to remove.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
