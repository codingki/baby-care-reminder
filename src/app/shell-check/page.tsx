"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChoiceButtons } from "@/components/option-sheet";

const tiles = ["Diaper", "Feed", "DBF", "Pump", "Chiller", "Weight"];

export default function ShellCheckPage() {
  const [open, setOpen] = useState(false);
  const [sex, setSex] = useState("unspecified");

  return (
    <AppShell>
      <div className="flex flex-col gap-2">
        {tiles.map((tile) => (
          <div key={tile} data-tile={tile} className="min-h-16 rounded-2xl bg-[#f3f5f3] px-4 py-3 text-base font-semibold">
            {tile}
          </div>
        ))}
        <Button type="button" onClick={() => setOpen(true)}>
          Add baby
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogTitle className="px-5 pt-4 text-lg font-semibold">Add baby</DialogTitle>
          <DialogDescription className="sr-only">Add a baby</DialogDescription>
          <form className="flex flex-col gap-3 px-5 pb-6">
            <Input type="date" aria-label="Birth date" defaultValue="2024-01-02" />
            <Input type="datetime-local" aria-label="When" defaultValue="2024-01-02T14:30" />
            <div className="flex w-full min-w-0 max-w-full flex-wrap gap-2 overflow-x-auto">
              <Button type="button" variant="outline" size="sm" className="rounded-full">Now</Button>
              <Button type="button" variant="outline" size="sm" className="rounded-full">15 min ago</Button>
              <Button type="button" variant="outline" size="sm" className="rounded-full">30 min ago</Button>
              <Button type="button" variant="outline" size="sm" className="rounded-full">60 min ago</Button>
            </div>
            <Input type="text" inputMode="decimal" aria-label="Weight" defaultValue="3.4" />
            <ChoiceButtons
              label="Sex"
              value={sex}
              options={[
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
                { value: "unspecified", label: "Unspecified" },
              ]}
              onChange={setSex}
            />
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
