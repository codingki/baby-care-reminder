"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CareIcon } from "@/components/care-icon";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { loadFamilyContext } from "@/lib/family-context";
import { createClient } from "@/lib/supabase/client";

type WeightRow = {
  id: string;
  grams: number;
  on: string;
};

function formatKg(grams: number) {
  return (grams / 1000).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BabyProfile() {
  const { locale, t } = useI18n();
  const [name, setName] = useState<string | null>(null);
  const [rows, setRows] = useState<WeightRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context?.babyId) {
        setReady(true);
        return;
      }
      const supabase = createClient();
      const [baby, history] = await Promise.all([
        supabase.from("babies").select("name, weight_grams").eq("id", context.babyId).maybeSingle(),
        supabase
          .from("weight_logs")
          .select("id, weight_grams, weighed_on")
          .eq("baby_id", context.babyId)
          .order("weighed_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (typeof baby.data?.name === "string") setName(baby.data.name);
      setRows(
        (history.data ?? []).flatMap((row) => {
          if (typeof row.weight_grams !== "number" || typeof row.weighed_on !== "string") return [];
          return [{ id: String(row.id), grams: row.weight_grams, on: row.weighed_on }];
        }),
      );
      setReady(true);
    })();
  }, []);

  if (!ready || !name) return null;
  const latest = rows[0];

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card px-5 py-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <CareIcon name="baby" className="h-5 w-5 text-accent" />
        {name}
      </h2>
      <p className="text-sm text-muted">{t("family.babyProfile")}</p>
      <p className="text-base font-semibold">
        {t("weight.latest")}
        {" · "}
        {latest ? t("weight.kgValue", { kg: formatKg(latest.grams) }) : t("weight.empty")}
      </p>
      {rows.length > 0 ? (
        <>
          <h3 className="text-sm font-semibold">{t("weight.history")}</h3>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{formatDate(row.on, locale)}</span>
                <span className="font-semibold">{t("weight.kgValue", { kg: formatKg(row.grams) })}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Link href="/log/weight" className="text-sm font-semibold text-accent">
        {t("family.logWeight")}
      </Link>
    </section>
  );
}
