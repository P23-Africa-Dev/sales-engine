import type { Metadata, Viewport } from "next";
import { Poppins, Montserrat } from "next/font/google";
import "./globals.css";
import "./outreach-dashboard.css";
import { Navbar } from "@/components/layout/navbar";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Sales Engine - Outreach Dashboard",
  description: "Sales Engine Lite Outreach Dashboard replica.",
  icons: {
    icon: "/dashboard-design/84470.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#041014",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${montserrat.variable} ${poppins.className} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#041014]">
        <div className="dashboard-shell min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
