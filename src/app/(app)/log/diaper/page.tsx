"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CareIcon } from "@/components/care-icon";
import { SavingLabel } from "@/components/saving-label";
import { Screen } from "@/components/screen";
import { useI18n } from "@/i18n/provider";
import { saveLog } from "@/lib/save-log";

const choices = [
  { key: "wet", value: "wet" },
  { key: "dirty", value: "dirty" },
  { key: "both", value: "mixed" },
] as const;

const colors = [
  { key: "yellow", swatch: "#e6c84a" },
  { key: "green", swatch: "#7d9a62" },
  { key: "brown", swatch: "#8a5a3a" },
  { key: "black", swatch: "#2c2c2c" },
  { key: "red", swatch: "#c45c5c" },
  { key: "white", swatch: "#f7f4ee" },
] as const;

const amounts = ["small", "medium", "large"] as const;

type DiaperKind = "wet" | "dirty" | "mixed";
type PoopColor = (typeof colors)[number]["key"];
type PoopAmount = (typeof amounts)[number];

export default function DiaperPage() {
  const { t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [kind, setKind] = useState<DiaperKind | null>(null);
  const [color, setColor] = useState<PoopColor | null>(null);
  const [amount, setAmount] = useState<PoopAmount | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const concern = color === "red" || color === "black" || color === "white";

  async function save(diaperKind: DiaperKind, poop?: { color: PoopColor | null; amount: PoopAmount | null }) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await saveLog({
        kind: "diaper",
        diaperKind,
        poopColor: poop?.color ?? undefined,
        poopAmount: poop?.amount ?? undefined,
      });
      if (result === "needs-family") {
        router.push("/onboarding");
        return;
      }
      if (result === "error") {
        setMessage(t("common.failed"));
        return;
      }
      setMessage(result === "queued" ? t("common.queued") : t("common.saved"));
      if (result === "synced") router.push("/");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Screen
      titleKey="diaper.title"
      ledeKey="diaper.lede"
      backHref="/"
      showLater={false}
      icon={<CareIcon name="diaper" className="h-8 w-8" />}
    >
      {kind === null || kind === "wet" ? (
        <div className="grid grid-cols-1 gap-3">
          {choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              disabled={pending}
              aria-busy={pending && choice.value === "wet"}
              onClick={() => {
                if (choice.value === "wet") {
                  setKind("wet");
                  void save("wet");
                  return;
                }
                setKind(choice.value);
                setMessage(null);
              }}
              className="inline-flex min-h-16 items-center justify-center gap-2 rounded-3xl border border-line bg-card text-lg font-semibold text-accent disabled:opacity-50"
            >
              {pending && choice.value === "wet" ? (
                <SavingLabel label={t("common.saving")} />
              ) : (
                <>
                  <CareIcon name="diaper" className="h-5 w-5" />
                  {t(`diaper.${choice.key}`)}
                </>
              )}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save(kind, { color, amount });
          }}
        >
          <button
            type="button"
            onClick={() => setKind(null)}
            className="self-start text-sm font-semibold text-accent"
          >
            {t("common.back")}
          </button>
          <p className="text-base font-semibold">{t(kind === "dirty" ? "diaper.dirty" : "diaper.both")}</p>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{t("diaper.color")}</p>
            <div className="grid grid-cols-3 gap-2">
              {colors.map((option) => {
                const pressed = color === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setColor(pressed ? null : option.key)}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-1 text-xs font-semibold ${
                      pressed ? "border-accent" : "border-line bg-card"
                    }`}
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-line"
                      style={{ backgroundColor: option.swatch }}
                    />
                    {t(`diaper.${option.key}`)}
                  </button>
                );
              })}
            </div>
            {concern ? <p className="text-sm leading-6 text-muted">{t("diaper.poopHint")}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{t("diaper.amount")}</p>
            <div className="grid grid-cols-3 gap-2">
              {amounts.map((option) => {
                const pressed = amount === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setAmount(pressed ? null : option)}
                    className={`min-h-12 rounded-2xl px-2 text-sm font-semibold ${
                      pressed ? "bg-accent text-accent-foreground" : "border border-line bg-card"
                    }`}
                  >
                    {t(`diaper.${option}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="min-h-12 rounded-2xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
          >
            {pending ? <SavingLabel label={t("common.saving")} /> : t("common.save")}
          </button>
        </form>
      )}
      {message ? <p role="status">{message}</p> : null}
    </Screen>
  );
}
