"use client";

import { useState } from "react";
import { AddBabyForm } from "@/components/add-baby-form";
import { BabyAvatar, BabyPhotoField } from "@/components/baby-photo";
import { CareIcon } from "@/components/care-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/provider";
import { formatBabyAge } from "@/lib/baby-age";
import { rememberBaby } from "@/lib/selected-baby";

export type SwitchBaby = {
  id: string;
  name: string;
  birthDate: string;
  photoPath: string | null;
};

export function BabySwitcher({
  familyId,
  babies,
  selectedId,
  age,
  onChanged,
}: {
  familyId: string | null;
  babies: SwitchBaby[];
  selectedId: string | null;
  age: string | null;
  onChanged: () => void;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; path: string | null } | null>(null);
  const selected = babies.find((baby) => baby.id === selectedId) ?? babies[0] ?? null;
  const label = selected?.name ?? t("home.addBaby");

  function pick(id: string) {
    if (!familyId) return;
    rememberBaby(familyId, id);
    setOpen(false);
    onChanged();
  }

  function finishAdd() {
    setCreated(null);
    setAdding(false);
    setOpen(false);
    onChanged();
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setAdding(babies.length === 0);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("home.switchBaby")}
        className="h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 px-0 text-left whitespace-normal text-foreground"
      >
        {selected ? (
          <BabyAvatar name={selected.name} path={selected.photoPath} />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e7eee9] text-lg font-semibold text-accent">
            ?
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-2xl font-semibold tracking-tight">{label}</span>
          <span className="block truncate text-sm text-muted">{age || t("home.addBabyDetail")}</span>
        </span>
        <CareIcon name="chevron" className="h-5 w-5 shrink-0 text-muted" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setAdding(false);
            setCreated(null);
          }
        }}
      >
        <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => event.preventDefault()}>
          <div data-slot="dialog-header" className="safe-x flex shrink-0 items-center justify-between gap-3 pt-4 pb-2">
            <DialogTitle className="text-lg font-semibold">{t("home.switchBaby")}</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label={t("home.close")}
              className="text-muted"
            >
              <CareIcon name="close" className="h-5 w-5" />
            </Button>
          </div>
          <DialogDescription className="sr-only">{t("home.addBaby")}</DialogDescription>
          <div data-slot="dialog-scroll" data-vaul-no-drag className="safe-x flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
            {babies.map((baby) => (
              <Button
                key={baby.id}
                type="button"
                variant="ghost"
                onClick={() => pick(baby.id)}
                className="h-auto min-h-14 w-full justify-start gap-3 rounded-2xl bg-[#f3f5f3] px-3 text-left whitespace-normal text-foreground"
              >
                <BabyAvatar name={baby.name} path={baby.photoPath} className="h-10 w-10 text-base" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{baby.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {formatBabyAge(baby.birthDate, locale === "id" ? "id" : "en", t)}
                  </span>
                </span>
                {baby.id === selected?.id ? <CareIcon name="check" className="h-5 w-5 shrink-0 text-accent" /> : null}
              </Button>
            ))}
            {created && familyId ? (
              <div className="flex flex-col gap-3 pt-2">
                <BabyPhotoField
                  familyId={familyId}
                  babyId={created.id}
                  name={created.name}
                  path={created.path}
                  onChange={(path) => setCreated({ ...created, path })}
                />
                <Button type="button" variant="outline" onClick={finishAdd}>
                  {created.path ? t("onboarding.photoContinue") : t("onboarding.photoSkip")}
                </Button>
              </div>
            ) : adding && familyId ? (
              <AddBabyForm
                familyId={familyId}
                idPrefix="switch-baby"
                onCreated={(baby) => {
                  setCreated({ id: baby.id, name: baby.name, path: null });
                  onChanged();
                }}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAdding(true)}
                className="h-auto min-h-14 w-full justify-start gap-3 rounded-2xl px-3 text-left text-base whitespace-normal"
              >
                <CareIcon name="chevron" className="h-5 w-5" />
                {t("home.addBaby")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
