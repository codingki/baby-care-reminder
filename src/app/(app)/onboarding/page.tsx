"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const OnboardingFlow = dynamic(
  () => import("@/components/onboarding-flow").then((mod) => mod.OnboardingFlow),
  { ssr: false },
);

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingFlow />
    </Suspense>
  );
}
