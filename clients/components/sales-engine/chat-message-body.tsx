"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessageBodyProps = {
  content: string;
  variant?: "assistant" | "welcome" | "user";
};

/** GLM sometimes returns numbered lists without line breaks — fix before markdown parse. */
function normalizeAssistantMarkdown(content: string): string {
  const withBreaks = content
    .replace(/\r\n/g, "\n")
    .replace(/([.!?])\s+(\d+\.\s+)/g, "$1\n\n$2")
    .replace(/(\S)\s+(\d+\.\s+\*\*)/g, "$1\n\n$2")
    .replace(/(\S)\s+(-\s+\*\*)/g, "$1\n$2")
    .replace(/(\S)\s+(-\s+[A-Za-z])/g, "$1\n$2");

  // Fix "1. 1. 1." runs and preserve start numbers across blank-separated list blocks
  // so <ol start> renders correctly.
  const lines = withBreaks.split("\n");
  let counter = 0;
  let inRun = false;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (match) {
      const ordinal = Number(match[2]);
      if (!inRun) {
        counter = ordinal > 0 ? ordinal : 1;
        inRun = true;
      } else {
        counter += 1;
      }
      lines[i] = `${match[1]}${counter}. ${match[3]}`;
    } else if (lines[i].trim() === "") {
      continue;
    } else {
      inRun = false;
      counter = 0;
    }
  }

  return lines.join("\n").trim();
}

const assistantComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 last:mb-0 leading-[16px]">{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-[#09232d]">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-2 mt-1 text-[14px] font-semibold leading-[18px]">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-2 mt-3 text-[13px] font-semibold leading-[17px]">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-1.5 mt-2 text-[12px] font-semibold leading-[16px]">{children}</h3>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({
    children,
    start,
  }: {
    children?: ReactNode;
    start?: number;
  }) => (
    <ol
      start={start}
      className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0"
    >
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-[16px] pl-0.5">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[#0b5c7a] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-3 border-l-2 border-[#09232d]/20 pl-3 italic text-[#09232d]/80 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[#09232d]/10" />,
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-[#09232d]/8 px-1 py-0.5 font-mono text-[11px]">{children}</code>
  ),
};

export function ChatMessageBody({ content, variant = "assistant" }: ChatMessageBodyProps) {
  if (variant === "user") {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  if (variant === "welcome") {
    return <div className="whitespace-pre-line leading-[15px]">{content}</div>;
  }

  return (
    <div className="chat-message-markdown text-[12px] leading-[16px] text-[#09232d]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={assistantComponents}>
        {normalizeAssistantMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
