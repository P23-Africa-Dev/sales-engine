import { AuthModeTabs } from "@/components/auth/auth-mode-tabs";
import LoginForm from "@/components/forms/login-form";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;

  if (token) {
    redirect("/sales-engine");
  }

  return (
    <div className="w-full max-w-[460px] flex flex-col gap-6">
      <div className="auth-page-heading">
        <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 mb-2.5">
          Welcome to Sales Engine
        </h2>
        <p className="auth-page-description">Sign in to continue building your next opportunity.</p>
      </div>

      <AuthModeTabs />
      <LoginForm />
    </div>
  );
}
