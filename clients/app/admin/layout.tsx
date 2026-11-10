import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/session";
import { Navbar } from "@/components/admin/layout/navbar";
import { FloatingAIButton } from "@/components/layout/floating-ai-button";
import "./admin-globals.css";
import "./admin-outreach-dashboard.css";

export const metadata: Metadata = {
  title: "Sales Engine Admin",
  description: "Platform admin view across client businesses.",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(AUTH_TOKEN_COOKIE)?.value;
  if (!token) redirect("/login");

  return (
    <div className="admin-view dashboard-shell w-full min-h-screen flex flex-col bg-[#041014]">
      <Navbar />
      <main className="flex-1 w-full">{children}</main>
      <FloatingAIButton />
    </div>
  );
}
