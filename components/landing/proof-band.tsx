function ProfileMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 8.5h8M8 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ListMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ProofBand() {
  return (
    <section id="why" className="se-why" aria-labelledby="why-title">
      <div className="se-wrap">
        <h2 id="why-title">Why they prefer Sales Engine</h2>
        <div className="se-modules">
          <article className="se-module">
            <p className="se-stat">3k+</p>
            <h3>Companies checked across the corridors you named.</h3>
            <p>Nigeria, Ghana, and the trading hubs already on the board.</p>
          </article>
          <article className="se-module">
            <h3>Qualification without the waiting list.</h3>
            <p>The profile goes in. Fits stay. A company known to sit outside the territory does not.</p>
            <div className="se-flow" aria-hidden="true">
              <i>
                <ProfileMark />
              </i>
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#7d939c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <i>
                <ListMark />
              </i>
            </div>
          </article>
          <article className="se-module">
            <div className="se-chart-label">
              <span>Illustrative shape</span>
              <span>Not a live count</span>
            </div>
            <h3>The list gets quieter as the bad fits leave.</h3>
            <svg className="se-chart" viewBox="0 0 360 120" role="img" aria-label="A rising curve drawn as an example, not live pipeline data.">
              <defs>
                <linearGradient id="se-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#178f98" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#178f98" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 96 C40 92 60 88 90 80 C130 68 150 74 190 58 C230 42 260 46 300 28 C324 18 340 16 360 12 V120 H0 Z"
                fill="url(#se-area)"
              />
              <path
                d="M0 96 C40 92 60 88 90 80 C130 68 150 74 190 58 C230 42 260 46 300 28 C324 18 340 16 360 12"
                fill="none"
                stroke="#178f98"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            </svg>
          </article>
        </div>
      </div>
    </section>
  );
}
