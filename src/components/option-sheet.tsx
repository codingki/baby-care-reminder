"use client";

import { useState } from "react";
import { CareIcon } from "@/components/care-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/provider";

export type SheetOption = {
  value: string;
  label: string;
};

export function ChoiceButtons({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SheetOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2" role="listbox" aria-label={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-12 rounded-2xl border px-3 text-sm font-semibold ${
                selected ? "border-accent bg-accent text-accent-foreground" : "border-line bg-card text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function OptionSheet({
  id,
  label,
  value,
  options,
  onChange,
  searchable = false,
}: {
  id?: string;
  label: string;
  value: string;
  options: SheetOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const current = options.find((option) => option.value === value);
  const query = search.trim().toLowerCase();
  const visible = query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold" id={id ? `${id}-label` : undefined}>
        {label}
      </p>
      <Button
        id={id}
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setSearch("");
          setOpen(true);
        }}
        className="h-auto min-h-12 w-full justify-between px-4 text-left font-normal whitespace-normal text-foreground"
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? t("common.choose")}</span>
        <CareIcon name="chevron" className="h-5 w-5 shrink-0 text-muted" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <DialogContent showCloseButton={false} onOpenAutoFocus={(event) => event.preventDefault()}>
          <div className="safe-x flex shrink-0 items-center justify-between gap-3 pt-4 pb-2">
            <DialogTitle className="text-lg font-semibold">{label}</DialogTitle>
            <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("home.close")}>
              <CareIcon name="close" className="h-5 w-5" />
            </Button>
          </div>
          <DialogDescription className="sr-only">{label}</DialogDescription>
          {searchable ? (
            <div className="safe-x pb-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("common.search")}
                aria-label={t("common.search")}
              />
            </div>
          ) : null}
          <div
            role="listbox"
            aria-label={label}
            className="safe-x flex max-h-80 flex-col gap-2 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {visible.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-[#f3f5f3] px-4 text-left text-base font-semibold"
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {selected ? <CareIcon name="check" className="h-5 w-5 shrink-0 text-accent" /> : null}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
