"use client";

import { CheckCheck, Mail, Paperclip, Send, Star } from "lucide-react";
import type { EmailMessageView } from "./email-types";

type EmailThreadItemProps = {
    email: EmailMessageView;
    onClick: () => void;
    onStar: () => void;
};

export function EmailThreadItem({ email, onClick, onStar }: EmailThreadItemProps) {
    const isSent = email.direction === "sent";

    return (
        <div
            onClick={onClick}
            className={`w-full flex items-start gap-2.5 sm:gap-3.5 p-3 sm:p-4 rounded-[16px] sm:rounded-[18px] transition-all duration-200 text-left group relative cursor-pointer ${
                !email.isRead
                    ? "bg-blue-50/60 hover:bg-blue-50/90 border border-blue-100/50"
                    : "hover:bg-gray-50 border border-transparent hover:border-gray-100"
            }`}
        >
            <div className="shrink-0 mt-0.5">
                <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-sm ${
                        isSent
                            ? "bg-[#0B1215] text-white"
                            : "bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white"
                    }`}
                >
                    {isSent ? (
                        <Send size={15} className="rotate-[-30deg]" />
                    ) : (
                        <Mail size={16} />
                    )}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className={`text-[13px] truncate ${
                                !email.isRead
                                    ? "font-semibold text-[#0B1215]"
                                    : "font-medium text-[#374151]"
                            }`}
                        >
                            {isSent ? `To: ${email.to}` : email.from}
                        </span>
                        {isSent && email.status === "sent" && (
                            <CheckCheck size={13} className="text-[#10B981] shrink-0" />
                        )}
                        {email.status === "failed" && (
                            <span className="text-[10px] text-red-500 font-medium">Failed</span>
                        )}
                        {email.status === "sending" && (
                            <span className="text-[10px] text-amber-600 font-medium">Sending</span>
                        )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-normal shrink-0 whitespace-nowrap">
                        {email.timeAgo}
                    </span>
                </div>

                <p
                    className={`text-[12px] truncate mb-1 ${
                        !email.isRead
                            ? "font-medium text-[#0B1215]"
                            : "font-normal text-gray-600"
                    }`}
                >
                    {email.subject}
                </p>

                <p className="text-[11px] text-gray-400 truncate leading-relaxed">
                    {email.body.split("\n")[0]}
                </p>

                {email.attachments && email.attachments.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                        <Paperclip size={11} className="text-gray-300" />
                        <span className="text-[10px] text-gray-400 font-normal">
                            {email.attachments.length} attachment
                            {email.attachments.length > 1 ? "s" : ""}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex flex-col items-center gap-2 shrink-0">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStar();
                    }}
                    className={`p-0.5 transition-opacity ${email.isStarred ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
                >
                    <Star
                        size={14}
                        className={
                            email.isStarred
                                ? "fill-amber-400 text-amber-400 !opacity-100"
                                : "text-gray-300"
                        }
                    />
                </button>
                {!email.isRead && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shadow-[0_0_6px_rgba(59,130,246,0.4)]" />
                )}
            </div>
        </div>
    );
}
