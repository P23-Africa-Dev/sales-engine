const STEPS = [
  {
    title: "You name the account.",
    body: "Trade, territory, and size. Blank places stay open. A company known to be somewhere else does not stay on the list.",
    icon: "pen",
  },
  {
    title: "The engine checks the fit.",
    body: "Each company comes back with where it sits and why it stayed. You open CRM when one is worth working.",
    icon: "check",
  },
  {
    title: "A note is ready when you are.",
    body: "The draft is a short introduction you can edit. Nothing sends until you say so.",
    icon: "note",
  },
] as const;

function StepIcon({ name }: { name: (typeof STEPS)[number]["icon"] }) {
  if (name === "pen") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="m8.5 12.2 2.3 2.3 4.8-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 5.5h12v13l-6-3.2-6 3.2v-13Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="se-steps" aria-labelledby="how-title">
      <div className="se-wrap">
        <div className="se-steps-intro">
          <h2 id="how-title">The list is the work.</h2>
          <p>Three moves replace an unverified prospect sheet with a list you can actually send from.</p>
        </div>
        <ol>
          {STEPS.map((step) => (
            <li key={step.title}>
              <div className="se-step-icon">
                <StepIcon name={step.icon} />
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
