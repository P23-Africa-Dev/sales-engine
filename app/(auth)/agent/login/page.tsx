import AgentLoginForm from "@/components/forms/agent-login-form";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/session";
import { getServerSessionState } from "@/lib/auth/server-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AgentLoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;

  if (token) {
    const session = await getServerSessionState(token);

    if (session.isAuthenticated) {
      redirect(session.role === "agent" ? "/agent/dashboard" : "/dashboard");
    }
  }

  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 mb-2.5">
          Login to Continue
        </h2>
      </div>

      <AgentLoginForm />
    </div>
  );
}
