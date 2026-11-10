import Link from "next/link";

export default function AboutSection() {
  return (
    <section id="about" className="w-full bg-white py-20 lg:py-24 px-6 sm:px-12 lg:px-24 font-sans border-t border-[#E8F4F8]">
      <div className="max-w-4xl mx-auto flex flex-col items-center text-center gap-6">
        <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-[#0B252C] leading-tight tracking-tight">
          What is Factory 23?
        </h2>
        <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed max-w-3xl">
          Factory 23 is a field operations management and CRM platform that helps
          businesses run their field teams. Companies use Factory 23 to track field
          agents in real time with GPS, assign territories and tasks, manage customer
          relationships and leads, monitor team performance with KPIs, and keep
          working even when agents are offline.
        </p>
        <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed max-w-3xl">
          Factory 23 can optionally connect to your Google account. With your
          permission, it uses Google Calendar to schedule and sync your meetings, and
          Gmail to send and manage follow up emails to your customers directly from
          the platform. Your Google data is only used to provide these features and is
          never sold or shared. You can disconnect your Google account at any time.
          Learn more in our{" "}
          <Link href="/privacy" className="text-[#0B252C] font-semibold underline hover:opacity-80">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
