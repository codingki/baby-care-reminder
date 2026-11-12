"use client";

import dynamic from "next/dynamic";

const InsightsView = dynamic(() => import("./insights-view"), {
  loading: () => (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-8 w-40 rounded-full bg-[#f3f5f3]" />
      <div className="h-12 w-full rounded-full bg-[#f3f5f3]" />
      <div className="h-40 w-full rounded-2xl bg-[#f3f5f3]" />
    </div>
  ),
});

export default function InsightsPage() {
  return <InsightsView />;
}
