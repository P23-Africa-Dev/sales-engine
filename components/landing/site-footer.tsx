import Link from "next/link";
import SalesEngineMark from "@/components/brand/sales-engine-mark";

export function SiteFooter() {
  return (
    <footer className="se-footer">
      <div className="se-wrap se-footer-inner">
        <p className="flex items-center gap-2.5">
          <SalesEngineMark className="h-5 w-5" />
          <span>Sales<i>Engine</i>. A P23 Africa product.</span>
        </p>
        <nav aria-label="Legal">
          <Link href="/login">Sign in</Link>
          <Link href="/register">Register</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
