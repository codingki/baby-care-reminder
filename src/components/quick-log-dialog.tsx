"use client";

import { CareIcon, type CareIconName } from "@/components/care-icon";
import { ChillerSheet, type SheetPump } from "@/components/chiller-sheet";
import {
  DbfLog,
  DiaperLog,
  FeedLog,
  PumpLog,
  WeightLog,
} from "@/components/quick-log-forms";
import { useSheetPresence } from "@/components/sheet-presence";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/translate";

export type QuickLogKind = "diaper" | "feed" | "dbf" | "pump" | "chiller" | "weight";

const copy: Record<QuickLogKind, { title: MessageKey; lede: MessageKey; icon: CareIconName }> = {
  diaper: { title: "diaper.title", lede: "diaper.lede", icon: "diaper" },
  feed: { title: "feed.title", lede: "feed.lede", icon: "feed" },
  dbf: { title: "dbf.title", lede: "dbf.lede", icon: "dbf" },
  pump: { title: "pump.title", lede: "pump.lede", icon: "pump" },
  chiller: { title: "chiller.title", lede: "chiller.title", icon: "chiller" },
  weight: { title: "weight.title", lede: "weight.lede", icon: "weight" },
};

export function QuickLogDialog({
  kind,
  pumps,
  babies,
  babyName,
  onClose,
  onSaved,
}: {
  kind: QuickLogKind | null;
  pumps: SheetPump[];
  babies: { id: string; name: string }[];
  babyName: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  useSheetPresence(kind !== null);
  const meta = kind ? copy[kind] : null;

  return (
    <Dialog open={kind !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {meta && kind ? (
          <>
            <div className="safe-x flex shrink-0 items-center justify-between gap-3 pt-4 pb-2">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                <CareIcon name={meta.icon} className="h-5 w-5 text-accent" />
                {babyName ? `${t(meta.title)} · ${babyName}` : t(meta.title)}
              </DialogTitle>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("home.close")}
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted"
              >
                <CareIcon name="close" className="h-5 w-5" />
              </button>
            </div>
            <DialogDescription className="sr-only">{t(meta.lede)}</DialogDescription>
            {kind === "diaper" ? <DiaperLog onClose={onClose} onSaved={onSaved} /> : null}
            {kind === "feed" ? <FeedLog onClose={onClose} onSaved={onSaved} /> : null}
            {kind === "dbf" ? <DbfLog onClose={onClose} onSaved={onSaved} /> : null}
            {kind === "pump" ? <PumpLog onClose={onClose} onSaved={onSaved} /> : null}
            {kind === "weight" ? <WeightLog onClose={onClose} onSaved={onSaved} /> : null}
            {kind === "chiller" ? (
              <ChillerSheet
                open
                pumps={pumps}
                babies={babies}
                onClose={onClose}
                onSaved={onSaved}
              />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
