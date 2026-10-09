"use client";

export type ResearchSource = {
  title: string;
  url?: string | null;
  snippet?: string | null;
  provider?: string | null;
  icp_relevance_reason?: string | null;
};

function domainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function ResearchSourcesList({ sources }: { sources: ResearchSource[] }) {
  if (!sources.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#616263]">
        Sources
      </p>
      <ol className="space-y-2">
        {sources.map((source, index) => {
          const domain = domainFromUrl(source.url);
          const title = source.title.trim() || "Untitled source";
          const content = (
            <>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#f0bbf7] text-[9px] font-bold text-[#6e1878]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold leading-[14px] text-[#09232d]">
                    {title}
                  </p>
                  {domain && (
                    <p className="mt-0.5 truncate text-[9px] text-[#616263]">{domain}</p>
                  )}
                  {source.snippet && (
                    <p className="mt-1 line-clamp-2 text-[10px] leading-[13px] text-[#09232d]/70">
                      {source.snippet}
                    </p>
                  )}
                  {source.icp_relevance_reason && (
                    <p className="mt-1 line-clamp-2 text-[9px] italic leading-[12px] text-[#616263]">
                      {source.icp_relevance_reason}
                    </p>
                  )}
                </div>
              </div>
            </>
          );

          if (source.url) {
            return (
              <li
                key={`${source.url}-${index}`}
                className="rounded-[14px] border border-[#e8e8e8] bg-[#fafafa] px-2.5 py-2 transition hover:border-[#c860d2]/80 hover:bg-[#fae6fc]"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {content}
                </a>
              </li>
            );
          }

          return (
            <li
              key={`${title}-${index}`}
              className="rounded-[14px] border border-[#e8e8e8] bg-[#fafafa] px-2.5 py-2"
            >
              {content}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function researchSourcesFromMeta(meta?: Record<string, unknown> | null): ResearchSource[] {
  const research = meta?.research;
  if (!research || typeof research !== "object") return [];
  const sources = (research as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) return [];

  return sources
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      title: typeof row.title === "string" ? row.title : "",
      url: typeof row.url === "string" ? row.url : null,
      snippet: typeof row.snippet === "string" ? row.snippet : null,
      provider: typeof row.provider === "string" ? row.provider : null,
      icp_relevance_reason:
        typeof row.icp_relevance_reason === "string" ? row.icp_relevance_reason : null,
    }))
    .filter((row) => row.title.trim() !== "");
}
