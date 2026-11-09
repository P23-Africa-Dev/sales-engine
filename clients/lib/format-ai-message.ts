/**
 * Convert assistant plain/markdown-ish text into readable plain text.
 */
export function formatPlainAiMessage(content: string): string {
  if (!content) {
    return "";
  }

  let text = content;

  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^-{3,}\s*$/gm, "");
  text = text.replace(/^\s*[-*]\s+/gm, "• ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Convert assistant plain/markdown-ish text into safe HTML for chat display.
 */
export function formatAiMessageHtml(content: string): string {
  const text = formatPlainAiMessage(content);

  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return escaped.replace(/\n/g, "<br />");
}
