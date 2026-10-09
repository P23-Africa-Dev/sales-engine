"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AuthModeTabs() {
  const pathname = usePathname();
  return (
    <nav className="auth-mode-tabs" aria-label="Account access">
      <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined}>Sign In</Link>
      <Link href="/register" aria-current={pathname === "/register" ? "page" : undefined}>Sign Up</Link>
    </nav>
  );
}
