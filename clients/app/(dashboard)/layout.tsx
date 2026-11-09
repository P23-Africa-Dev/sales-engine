import "../client-styles.css";
import { Navbar } from "@/components/layout/navbar";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;

  if (!token) {
    redirect("/login");
  }

  return (
    <div className="dashboard-shell w-full min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full overflow-auto">{children}</main>
    </div>
  );
}
