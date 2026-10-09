import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, Mail, Sparkles } from "lucide-react";
import "./auth.css";

function ProductPreview() {
  return (
    <div className="auth-product-preview" aria-hidden="true">
      <section className="auth-preview-card auth-preview-outreach">
        <div className="auth-preview-title"><span>Outreach overview</span><span>This month ↗</span></div>
        <div className="auth-preview-summary"><div className="auth-preview-ring" /><div><small>Every conversation counts</small><strong>Reach further.</strong><span className="auth-preview-legend">Emails · SMS · In person</span></div></div>
        <div className="auth-preview-progress"><span>Sent</span><span>Received</span><i /><i /></div>
        <div className="auth-preview-bottom">A clearer view of your outreach<ArrowUpRight size={11} /></div>
      </section>
      <section className="auth-preview-card auth-preview-leads">
        <div className="auth-preview-title"><span>Smart Leads</span><Sparkles size={12} /></div>
        <p className="auth-preview-subtitle">The right fit, ready to connect.</p>
        {[['N', 'NordTech Solutions', 'Industrial Equipment'], ['M', 'Meridian Systems', 'Business Services'], ['A', 'Atlas Engineering', 'Manufacturing']].map(([initial, name, industry]) => (
          <div className="auth-preview-lead" key={initial}><span>{initial}</span><div><strong>{name}</strong><small>{industry}</small></div><Check size={12} /></div>
        ))}
        <div className="auth-preview-bottom">Discover your next account<ArrowUpRight size={11} /></div>
      </section>
      <section className="auth-preview-card auth-preview-message">
        <div className="auth-preview-title"><span>A more personal first hello</span><Mail size={12} /></div>
        <span className="auth-preview-message-label">OUTREACH DRAFT</span>
        <p>Hi Michael,<br />Let’s start a conversation.</p>
        <div className="auth-preview-message-lines"><i /><i /></div>
        <div className="auth-preview-send">Make a connection<ArrowUpRight size={11} /></div>
      </section>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="se-auth">
      <div className="auth-frame">
        <main className="auth-form-panel">
          <Link href="/" className="auth-logo">
            <Image src="/dashboard-design/84470.svg" alt="" width={28} height={28} />
            <span>Sales<i>Engine</i></span>
          </Link>
          <div className="auth-form-area"><div className="auth-form-card">{children}</div></div>
          <footer className="auth-form-footer"><span>© {new Date().getFullYear()} Sales Engine</span><div><Link href="/files/Factory23%20Terms%20of%20Service.pdf">Terms & Conditions</Link><span>·</span><Link href="/files/Factory23%20Privacy%20Policy.pdf">Privacy Policy</Link></div></footer>
        </main>
        <aside className="auth-brand-panel">
          <ProductPreview />
          <div className="auth-brand-story">
            <div className="auth-brand-mark"><Image src="/dashboard-design/84470.svg" alt="" width={32} height={32} /></div>
            <h1>From the first lead<br />to the <em>next conversation.</em></h1>
            <p>Discover the right prospects, make your outreach personal, and bring every opportunity together.</p>
          </div>
          {/* <div className="auth-brand-rule" aria-hidden="true"><span /><span /><span /></div> */}
        </aside>
      </div>
    </div>
  );
}
