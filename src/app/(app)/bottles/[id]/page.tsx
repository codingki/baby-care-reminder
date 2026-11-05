import { Suspense } from "react";
import { redirect } from "next/navigation";

export default function BottlesAliasItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Alias params={params} />
    </Suspense>
  );
}

async function Alias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/chiller/${id}`);
  return null;
}
