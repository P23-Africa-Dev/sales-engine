"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { TinyButton } from "../ui/tiny-button";
import { useAttendanceMapSnapshots } from "@/hooks/use-attendance-map";

const MapView = dynamic(
  () => import("@/components/map/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-72 rounded-[20px] bg-[#F0F0F0] animate-pulse" />
    ),
  },
);

export const DashboardMap = ({ basePath }: { basePath: string }) => {
  const { data } = useAttendanceMapSnapshots(
    {},
    { scope: basePath === "/agent" ? "agent" : "management" }
  );
  const clockedInCount = data?.items.length ?? 0;

  return (
    <div className="mt-4 lg:mt-20 min-w-0 lg:min-w-lg flex flex-col">
      <div className="flex items-center justify-between px-4.75 mb-4">
        <div>
          <h3 className="text-[#203B5F] font-medium text-[16px] ">
            {basePath === "/agent" ? "Live Location" : "Active Field Agents"}
          </h3>
          {basePath !== "/agent" && clockedInCount > 0 && (
            <p className="text-[12px] text-slate-500 mt-1">
              {clockedInCount} agent{clockedInCount === 1 ? "" : "s"} clocked in today
            </p>
          )}
        </div>
        <Link href={basePath === "/agent" ? `${basePath}/map` : "/map?tab=clocked-in"}>
          <TinyButton>Open Map</TinyButton>
        </Link>
      </div>
      <div className="w-full h-82.75 lg:h-auto lg:flex-1 shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026] rounded-[20px] overflow-hidden">
        <MapView compact />
      </div>
    </div>
  );
};
