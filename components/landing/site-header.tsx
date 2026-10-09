import SalesEngineMark from "@/components/brand/sales-engine-mark";
import Link from "next/link";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#why", label: "Why it holds" },
  { href: "#how", label: "How it works" },
] as const;

export function SiteHeader() {
  return (
    <header className="se-header">
      <div className="se-wrap se-header-inner">
        <Link href="/" className="se-brand">
          <SalesEngineMark className="h-6 w-6 text-[#143028]" />
          <span>Sales<i>Engine</i></span>
        </Link>
        <nav className="se-nav-desktop" aria-label="Page">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="se-header-actions">
          <Link href="/login" className="se-btn se-btn-ghost">
            Login
          </Link>
          <Link href="/register" className="se-btn se-btn-solid">
            Sign up
          </Link>
          <details className="se-menu">
            <summary aria-label="Open menu">
              <span />
              <span />
            </summary>
            <nav aria-label="Page">
              {LINKS.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
