import { Plus_Jakarta_Sans } from "next/font/google";
import { CloseCta } from "@/components/landing/close-cta";
import { HeroStage } from "@/components/landing/hero-stage";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ProofBand } from "@/components/landing/proof-band";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { ValueBento } from "@/components/landing/value-bento";
import "@/components/landing/landing.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-se-sans",
  display: "swap",
});

export default function SalesEngineHome() {
  return (
    <div className={`${sans.variable} ${sans.className} se-landing min-h-screen`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#0f6e78] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <HeroStage />
        <ValueBento />
        <ProofBand />
        <HowItWorks />
        <CloseCta />
      </main>
      <SiteFooter />
    </div>
  );
}
