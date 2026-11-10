import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Logo from "@/assets/images/logo.png";

export const metadata: Metadata = {
  title: "Privacy Policy | Factory 23",
  description: "Privacy Policy for Factory 23, the field workforce management and CRM platform operated by P23 Africa Ltd.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white text-[#0B252C]">
      <header className="border-b border-gray-100 px-6 py-5 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Image src={Logo} alt="Factory 23 Logo" width={40} height={40} className="object-contain" />
            <span className="text-lg font-bold tracking-tight">Factory 23</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 sm:px-10 sm:py-14">
        <p className="text-sm font-medium text-[#4A5F64]">Last updated: August 2026</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-sm leading-7 text-[#4A5F64] sm:text-base">
          This Privacy Policy explains how P23 Africa Ltd, trading as <strong>Factory 23</strong> (&quot;we&quot;, &quot;us&quot;, or
          &quot;our&quot;), collects, uses, stores, and protects personal data when you use the Factory 23 platform at{" "}
          <a href="https://thefactory23.com" className="font-semibold text-[#0B252C] underline">
            https://thefactory23.com
          </a>
          .
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Who we are</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            <strong>Legal entity:</strong> P23 Africa Ltd (trading as Factory 23)
            <br />
            <strong>Registered address:</strong> 185 Tower Bridge Rd, London SE1 2UF, United Kingdom
            <br />
            <strong>Privacy contact:</strong>{" "}
            <a href="mailto:contact@p23africa.com" className="font-semibold text-[#0B252C] underline">
              contact@p23africa.com
            </a>
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Information we collect</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#4A5F64] sm:text-base">
            <li>Account information such as name, email address, phone number, job title, and company details.</li>
            <li>Workforce and operational data such as attendance, tasks, visits, routes, and field reports.</li>
            <li>CRM data such as lead and customer contact details, email threads, and outreach activity.</li>
            <li>Location data collected only while a user is actively checked in for work-related activity.</li>
            <li>Files, photos, signatures, and documents uploaded through the platform.</li>
            <li>Usage, security, and diagnostic logs such as IP address, device/browser information, and login activity.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Google account data (Calendar and Gmail)</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            If you choose to connect your Google account, Factory 23 may access Google Calendar and Gmail data only after
            you explicitly authorize the connection through Google OAuth. This is used to:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#4A5F64] sm:text-base">
            <li>Sync meetings and calendar events for scheduling inside Factory 23.</li>
            <li>Send CRM follow up emails from your connected mailbox.</li>
            <li>Read and sync CRM-related email threads linked to leads and customers.</li>
            <li>Mark messages as read or move messages to trash when you take those actions in Factory 23.</li>
          </ul>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            We do not access your Google account unless you connect it. You can disconnect your Google account at any time
            from your Factory 23 settings. When disconnected, we stop using your Google access tokens and revoke the
            connection where supported.
          </p>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            Google user data is used only to provide Factory 23 features you request. We do not sell Google user data and
            we do not use it for advertising.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Microsoft 365 account data (Outlook mail)</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            If you choose to connect your Microsoft 365 or Outlook account, Factory 23 may access your mailbox through
            the Microsoft Graph API only after you explicitly authorize the connection through Microsoft OAuth. This is
            used to:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#4A5F64] sm:text-base">
            <li>Send CRM follow up emails from your connected mailbox.</li>
            <li>Read and sync CRM-related email threads linked to leads and customers.</li>
            <li>Mark messages as read or move messages to trash when you take those actions in Factory 23.</li>
            <li>Read your basic Microsoft profile so we can identify and display the connected mailbox.</li>
          </ul>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            We do not access your Microsoft account unless you connect it. You can disconnect it at any time from your
            Factory 23 settings. When disconnected, we stop using your Microsoft access tokens and revoke the connection
            where supported.
          </p>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            Microsoft user data is used only to provide Factory 23 features you request. We do not sell Microsoft user
            data, we do not use it for advertising, and we do not use it to train AI models.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">AI features and Limited Use of Google user data</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            Factory 23 includes an in-product AI assistant (ELY) and AI-assisted CRM features such as drafting email
            replies and summarizing customer activity. These features are powered by third-party AI providers that
            process data on our behalf solely to generate the response you requested inside Factory 23.
          </p>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            Factory 23&apos;s use of information received from Google APIs will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#0B252C] underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            Specifically, we do not use, transfer, or sell Google Workspace user data — whether raw, aggregated, derived,
            or anonymized — to develop, train, or improve any foundational or generalized artificial intelligence or
            machine learning models. Our AI providers are engaged under terms that prohibit them from training their
            models on data submitted through their APIs. Human beings do not read your Google user data except with your
            affirmative consent, to investigate security issues or abuse, or where required by law.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">How we use personal data</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[#4A5F64] sm:text-base">
            <li>To provide and operate the Factory 23 platform and its features.</li>
            <li>To authenticate users and secure accounts.</li>
            <li>To support CRM, task management, attendance, reporting, and AI-assisted workflows.</li>
            <li>To send service notifications, support responses, and account-related communications.</li>
            <li>To improve reliability, prevent abuse, and maintain platform security.</li>
            <li>To comply with legal obligations and enforce our terms.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">How we share data</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            We do not sell personal data. We share data only with service providers that help us operate Factory 23, such
            as cloud hosting, email delivery, mapping, payment processing, analytics, and AI processing providers. These
            providers are contractually required to protect data and use it only to deliver services to us.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Data retention and security</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            We retain personal data for as long as your account is active and as needed to provide the Service, resolve
            disputes, enforce agreements, and meet legal obligations. We use encryption in transit, access controls,
            and other technical and organizational safeguards to protect personal data.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Your rights</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            Depending on your location, you may have rights to access, correct, delete, restrict, or object to certain
            processing of your personal data, and to request a copy of your data. To exercise these rights, contact{" "}
            <a href="mailto:hello@p23africa.com" className="font-semibold text-[#0B252C] underline">
              hello@p23africa.com
            </a>
            .
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Children&apos;s privacy</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            Factory 23 is not intended for children under 18, and we do not knowingly collect personal data from children.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Changes to this policy</h2>
          <p className="text-sm leading-7 text-[#4A5F64] sm:text-base">
            We may update this Privacy Policy from time to time. The latest version will always be published on this page.
            Material changes will be communicated to customers where appropriate.
          </p>
        </section>

        <section className="mt-10 rounded-2xl border border-gray-100 bg-[#F8FAFB] p-6">
          <h2 className="text-lg font-bold">Contact</h2>
          <p className="mt-2 text-sm leading-7 text-[#4A5F64] sm:text-base">
            For privacy questions or requests, contact P23 Africa Ltd at{" "}
            <a href="mailto:hello@p23africa.com" className="font-semibold text-[#0B252C] underline">
              hello@p23africa.com
            </a>
            .
          </p>
          <p className="mt-4 text-sm">
            <Link href="/" className="font-semibold text-[#0B252C] underline">
              Return to Factory 23 homepage
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
