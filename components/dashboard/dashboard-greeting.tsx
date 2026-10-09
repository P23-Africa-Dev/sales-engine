"use client";

import { useAuthStore } from "@/store/auth";

export function DashboardGreeting() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="lg:ml-[100px] space-y-2">
      <h1 className="text-[28px] md:text-[36px] font-extrabold leading-tight md:leading-9.5 text-[#F6F6F6]">
        Hi, {firstName}!
      </h1>
      <p className="text-[16px] md:text-[20px] leading-tight md:leading-5.75 text-[#F6F6F6] font-(--font-poppins) max-w-66.75">
        What can we help you with today?
      </p>
    </div>
  );
}
