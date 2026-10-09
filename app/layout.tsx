import type { Metadata, Viewport } from "next";
import { Poppins, Montserrat } from "next/font/google";
import "./globals.css";
import "./outreach-dashboard.css";
import "./sales-workspace.css";
import "./outreach-activities.css";
import QueryProvider from "@/components/providers/query-provider";
import AuthInitializer from "@/components/providers/auth-initializer";
import OfflineSyncProvider from "@/components/providers/offline-sync-provider";
import OfflineStatusBanner from "@/components/pwa/OfflineStatusBanner";
import { Toaster } from "sonner";

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
  title: "Sales Engine",
  description: "Discover prospects, qualify them against your ICP, and work them in CRM.",
  applicationName: "Sales Engine",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/dashboard-design/84470.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sales Engine",
  },
};

export const viewport: Viewport = {
  themeColor: "#143028",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${montserrat.variable} ${poppins.className} h-full antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <QueryProvider>
          <OfflineSyncProvider>
            <AuthInitializer>
              {children}
            </AuthInitializer>
            <OfflineStatusBanner />
          </OfflineSyncProvider>
        </QueryProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
