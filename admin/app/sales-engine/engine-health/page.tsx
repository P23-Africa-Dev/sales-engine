import type { Metadata } from "next";
import { EngineHealthView } from "@/components/engine-health/engine-health-view";

export const metadata: Metadata = {
  title: "Engine Health | Admin Sales Engine",
  description: "Lead search speed, contact-finding rates and social listening yield across accounts.",
};

export default function EngineHealthPage() {
  return <EngineHealthView />;
}
