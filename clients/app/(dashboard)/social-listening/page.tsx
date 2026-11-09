import { Suspense } from "react";
import { SalesEngineView } from "@/components/sales-engine/sales-engine-view";

export default function Page() {
  return <Suspense><SalesEngineView activeTab="social-listening" /></Suspense>;
}
