import ResetPasswordForm from "@/components/forms/reset-password-form";

type ResetPasswordPageProps = {
    params: Promise<{ token: string }>;
    searchParams: Promise<{ email?: string; portal?: string }>;
};

export default async function ResetPasswordPage({ params, searchParams }: ResetPasswordPageProps) {
    const { token } = await params;
    const query = await searchParams;
    const email = (query.email ?? "").trim();
    const portal = query.portal === "agent" ? "agent" : "management";

    return (
        <div className="w-full max-w-[460px] flex flex-col gap-8 md:mt-0 lg:-mt-12">
            <div className="text-left md:text-center flex flex-col gap-3">
                <h2 className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
                    Reset Password
                </h2>
                <p className="text-gray-500 text-sm tracking-[0px] leading-[22px] max-w-[380px] md:mx-auto">
                    Create a new password for your account. This reset link is single use and expires automatically.
                </p>
            </div>

            <ResetPasswordForm token={token} email={email} portal={portal} />
        </div>
    );
}
