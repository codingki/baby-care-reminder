"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AddBabyForm } from "@/components/add-baby-form";
import { BabyPhotoField } from "@/components/baby-photo";
import { CareIcon } from "@/components/care-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/locales";
import { loadFamilyContext } from "@/lib/family-context";
import { rememberBaby } from "@/lib/selected-baby";
import { createClient } from "@/lib/supabase/client";

type WeightRow = {
  id: string;
  grams: number;
  on: string;
};

type BabyCard = {
  id: string;
  name: string;
  photoPath: string | null;
  weights: WeightRow[];
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
  const router = useRouter();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [babies, setBabies] = useState<BabyCard[]>([]);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; path: string | null } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const context = await loadFamilyContext();
      if (!context) {
        setReady(true);
        return;
      }
      setFamilyId(context.familyId);
      setSelectedId(context.babyId);
      const supabase = createClient();
      const [babyResult, history] = await Promise.all([
        supabase
          .from("babies")
          .select("id, name, photo_path")
          .eq("family_id", context.familyId)
          .order("created_at"),
        supabase
          .from("weight_logs")
          .select("id, baby_id, weight_grams, weighed_on")
          .eq("family_id", context.familyId)
          .order("weighed_on", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      const weights = history.data ?? [];
      setBabies(
        (babyResult.data ?? []).flatMap((baby) => {
          if (typeof baby.id !== "string" || typeof baby.name !== "string") return [];
          return [
            {
              id: baby.id,
              name: baby.name,
              photoPath: typeof baby.photo_path === "string" ? baby.photo_path : null,
              weights: weights.flatMap((row) => {
                if (row.baby_id !== baby.id) return [];
                if (typeof row.weight_grams !== "number" || typeof row.weighed_on !== "string") return [];
                return [{ id: String(row.id), grams: row.weight_grams, on: row.weighed_on }];
              }),
            },
          ];
        }),
      );
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("family.babies")}</h2>
        <Button type="button" variant="link" size="sm" className="h-auto min-h-0 px-0 text-sm" onClick={() => setAdding(true)}>
          {t("home.addBaby")}
        </Button>
      </div>
      {adding && familyId && !created ? (
        <AddBabyForm
          familyId={familyId}
          idPrefix="family-baby"
          onCreated={(baby) => {
            setCreated({ id: baby.id, name: baby.name, path: null });
            setSelectedId(baby.id);
            setBabies((current) => [
              { id: baby.id, name: baby.name, photoPath: null, weights: [] },
              ...current.filter((entry) => entry.id !== baby.id),
            ]);
          }}
        />
      ) : null}
      {created && familyId ? (
        <Card className="gap-3 px-5 py-4">
          <BabyPhotoField
            familyId={familyId}
            babyId={created.id}
            name={created.name}
            path={created.path}
            onChange={(path) => {
              setCreated({ ...created, path });
              setBabies((current) =>
                current.map((entry) => (entry.id === created.id ? { ...entry, photoPath: path } : entry)),
              );
            }}
          />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto min-h-0 self-start px-0 text-sm"
            onClick={() => {
              setCreated(null);
              setAdding(false);
            }}
          >
            {created.path ? t("onboarding.photoContinue") : t("onboarding.photoSkip")}
          </Button>
        </Card>
      ) : null}
      {babies.length === 0 ? <p className="text-sm text-muted">{t("settings.noBaby")}</p> : null}
      {babies.map((baby) => {
        const latest = baby.weights[0];
        return (
          <Card key={baby.id} className="gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <CareIcon name="baby" className="h-5 w-5 text-accent" />
                  {baby.name}
                  {baby.id === selectedId ? <CareIcon name="check" className="h-4 w-4 text-accent" /> : null}
                </h3>
                <p className="text-sm text-muted">{t("family.babyProfile")}</p>
              </div>
            </div>
            {familyId ? (
              <BabyPhotoField
                familyId={familyId}
                babyId={baby.id}
                name={baby.name}
                path={baby.photoPath}
                onChange={(photoPath) =>
                  setBabies((current) =>
                    current.map((entry) => (entry.id === baby.id ? { ...entry, photoPath } : entry)),
                  )
                }
              />
            ) : null}
            <p className="text-base font-semibold">
              {t("weight.latest")}
              {" · "}
              {latest ? t("weight.kgValue", { kg: formatKg(latest.grams) }) : t("weight.empty")}
            </p>
            {baby.weights.length > 0 ? (
              <>
                <h4 className="text-sm font-semibold">{t("weight.history")}</h4>
                <ul className="flex flex-col gap-2">
                  {baby.weights.map((row) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{formatDate(row.on, locale)}</span>
                      <span className="font-semibold">{t("weight.kgValue", { kg: formatKg(row.grams) })}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto min-h-0 self-start px-0 text-sm"
              onClick={() => {
                if (familyId) rememberBaby(familyId, baby.id);
                router.push("/?log=weight");
              }}
            >
              {t("family.logWeight")}
            </Button>
          </Card>
        );
      })}
    </section>
  );
}
