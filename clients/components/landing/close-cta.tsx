import Link from "next/link";

export function CloseCta() {
  return (
    <section className="se-close" aria-labelledby="close-title">
      <div className="se-wrap se-close-inner">
        <div>
          <h2 id="close-title">Start with the profile, not a spreadsheet.</h2>
          <p>After you register, Sales Engine opens. CRM sits beside it when a company is ready to work.</p>
        </div>
        <Link href="/register" className="se-btn se-btn-solid">
          Create your profile
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 12 12 4M12 4H6.5M12 4v5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
