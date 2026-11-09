import type { Metadata } from "next";
import { SocialListeningView } from "@/components/admin/social-listening/social-listening-view";
import "@/components/admin/social-listening/social-listening.css";

export const metadata: Metadata = {
  title: "Social Listening | Admin Sales Engine",
  description:
    "Oversee client monitoring, review buying signals, and manage social listening operations.",
};
export default function SocialListeningPage() {
  return <SocialListeningView />;
}
