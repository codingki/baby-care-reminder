import { Suspense } from "react";
import { BottleDetail } from "@/app/(app)/bottles/[id]/bottle-detail";

export default function BottlePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Bottle params={params} />
    </Suspense>
  );
}

async function Bottle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BottleDetail id={id} />;
}
