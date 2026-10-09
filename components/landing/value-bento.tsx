const FEATURES = [
  {
    title: "Precise qualification",
    body: "Filter by trade, territory, and verified size. Unconfirmed or out-of-scope records are dropped before you spend time.",
    icon: "filter",
  },
  {
    title: "Multi-market coverage",
    body: "Run searches across Nigeria, Ghana, Kenya, and beyond with territory-specific intelligence for local distribution.",
    icon: "markets",
  },
  {
    title: "Outreach-ready drafts",
    body: "A draft introduction is prepared for every fit. Nothing sends until you review and confirm.",
    icon: "shield",
  },
] as const;

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]["icon"] }) {
  if (name === "filter") {
    return (
      <svg className="se-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M6 8h20M10 16h12M14 24h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "markets") {
    return (
      <svg className="se-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M6 26V14M16 26V8M26 26V18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M4 26h24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="se-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 27s8-4.2 8-10.2V8.2L16 5 8 8.2v8.6C8 22.8 16 27 16 27Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m12.5 15.5 2.4 2.4 4.8-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ValueBento() {
  return (
    <section id="product" className="se-panel" aria-labelledby="product-title">
      <div className="se-wrap">
        <div className="se-sheet">
          <div className="se-sheet-head">
            <h2 id="product-title">Experience that grows with your scale.</h2>
            <p>
              A profile for the trade, the territory, and the size. The list keeps the companies that fit and drops the ones that do not.
            </p>
          </div>
          <div className="se-features">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <FeatureIcon name={feature.icon} />
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
