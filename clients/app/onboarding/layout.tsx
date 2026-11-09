import Image from "next/image";
import Link from "next/link";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col md:flex-row min-h-screen md:h-screen w-screen overflow-y-auto md:overflow-hidden bg-[#143028]"
      style={{
        backgroundImage: `
          repeating-linear-gradient(to right, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px),
          repeating-linear-gradient(to bottom, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px)
        `,
      }}
    >
      {/* Mobile top wave */}
      <div className="md:hidden h-[220px] sm:h-[280px] shrink-0 relative">
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 390 200" fill="none" preserveAspectRatio="none" className="w-full h-[200px] block">
            <path d="M0 200 L0 15 C80 0 160 140 250 150 C310 156 360 120 390 110 L390 200 Z" fill="white" />
          </svg>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="relative lg:max-w-[523px] md:w-[45%] lg:w-[40%] shrink-0 hidden md:flex flex-col md:px-10 lg:px-[101px] md:pt-[100px] lg:pt-[132px]">
        <Link href="/" className="flex items-center gap-2.5 mb-2">
          <Image src="/dashboard-design/84470.svg" alt="Sales Engine" width={32} height={32} />
          <span className="text-3xl font-light text-white font-[family-name:var(--font-poppins)]">
            Sales<i>Engine</i>
          </span>
        </Link>
        <p className="text-white text-[14px] lg:text-[15px] leading-[18px] lg:leading-[16px] max-w-[240px]">
          Write the profile of who you sell to. The list starts there.
        </p>
      </div>

      <div className="flex-1 bg-white shadow-[shadow-[0px_2px_6px_2px_#00000026,0px_1px_2px_0px_#0000004D]] md:rounded-l-[50px] lg:rounded-l-[72px] flex items-start md:items-center justify-center py-6 sm:py-8 md:py-12 px-6 md:px-12 lg:pl-[210px] lg:pr-16 md:overflow-y-auto relative -mt-px md:mt-0">
        {children}
      </div>
    </div>
  );
}
