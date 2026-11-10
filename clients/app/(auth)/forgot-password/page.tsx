import ForgotPasswordForm from "@/components/forms/forgot-password-form";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ email?: string; portal?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const prefilledEmail = (params.email ?? "").trim();
  const portal = params.portal === "agent" ? "agent" : "management";

  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8">
      <div className="auth-page-heading">
        <h2 className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
          Forgot Password
        </h2>
        <p className="auth-page-description">
          Enter your registered email address to receive instructions on how to reset your password.
        </p>
      </div>

      <ForgotPasswordForm prefilledEmail={prefilledEmail} portal={portal} />
    </div>
  );
}
