import SetNewPasswordForm from "@/components/forms/set-new-password-form";

export default function SetNewPasswordPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8 md:mt-0 lg:-mt-12">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
          Set New Password
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-[22px] max-w-[380px] md:mx-auto">
          Please enter and confirm your new personalized password below to regain access to your account.
        </p>
      </div>

      <SetNewPasswordForm />
    </div>
  );
}
