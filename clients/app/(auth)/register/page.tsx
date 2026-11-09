import { AuthModeTabs } from "@/components/auth/auth-mode-tabs";
import SignupForm from "@/components/forms/signup-form";

export default function RegisterPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-6">
      <div className="auth-page-heading">
        <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 md:mb-2.5 mb-[18px]">
          Create your account
        </h2>
        <p className="auth-page-description">
          Start with your ideal customer. We’ll help you find the people behind your next opportunity.
        </p>
      </div>

      <AuthModeTabs />
      <SignupForm />
    </div>
  );
}
