import { Suspense } from "react";
import { ChillerDetail } from "@/app/(app)/chiller/[id]/chiller-detail";

export default function ChillerItemPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Item params={params} />
    </Suspense>
  );
}

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChillerDetail id={id} />;
}
