import { SAMPLE_BOARD } from "@/components/landing/board-sample";

export function QualificationBoard() {
  return (
    <figure className="relative bg-white border border-slate-200/90 shadow-[0_20px_50px_rgba(15,23,42,0.06)] rounded-3xl p-5 sm:p-7">
      <figcaption className="mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Sample board · not a customer list
          </span>
        </div>
        <span className="rounded-full bg-[#18757f]/10 border border-[#18757f]/20 px-3 py-0.5 text-[11px] font-semibold tracking-wide text-[#18757f]">
          Example only
        </span>
      </figcaption>
      
      <div className="grid gap-4 md:grid-cols-3">
        {SAMPLE_BOARD.map((column) => (
          <div key={column.name} className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-3.5 sm:p-4 flex flex-col">
            <div className="mb-3">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-slate-800">
                {column.name}
              </span>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 min-h-[32px]">
                {column.hint}
              </p>
            </div>
            
            <div className="flex flex-col gap-3">
              {column.cards.map((card) => (
                <article
                  key={`${column.name}-${card.company}`}
                  className={`se-card-hover relative bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm ${
                    card.dropped ? "opacity-75 bg-slate-50/50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-bold leading-tight text-slate-900">
                      {card.company}
                    </h3>
                    {card.fit ? (
                      <span className="shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md">
                        Fit
                      </span>
                    ) : null}
                    {card.dropped ? (
                      <span className="shrink-0 bg-rose-50 text-rose-600 border border-rose-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md">
                        Dropped
                      </span>
                    ) : null}
                  </div>
                  
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {card.place}
                  </p>
                  
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {card.note}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
