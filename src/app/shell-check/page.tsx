"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChoiceButtons } from "@/components/option-sheet";

const tiles = ["Diaper", "Feed", "DBF", "Pump", "Chiller", "Weight"];

const longRows = ["Yellow", "Green", "Brown", "Black", "Red", "White", "Small", "Medium", "Large"];

export default function ShellCheckPage() {
  const [open, setOpen] = useState(false);
  const [longOpen, setLongOpen] = useState(false);
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
        <Button type="button" onClick={() => setLongOpen(true)}>
          Store milk
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <div data-slot="dialog-header" className="safe-x shrink-0 pt-2">
            <DialogTitle className="text-lg font-semibold">Add baby</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Add a baby</DialogDescription>
          <form data-slot="dialog-scroll" data-vaul-no-drag className="safe-x flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain py-3">
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
      <Dialog open={longOpen} onOpenChange={setLongOpen}>
        <DialogContent showCloseButton={false}>
          <div data-slot="dialog-header" className="safe-x shrink-0 pt-2">
            <DialogTitle className="text-lg font-semibold">Store milk</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Dirty diaper and store milk</DialogDescription>
          <div data-slot="dialog-scroll" data-vaul-no-drag className="safe-x flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain py-3">
            {longRows.map((row) => (
              <div key={row} className="min-h-16 rounded-2xl bg-[#f3f5f3] px-4 py-3 text-base font-semibold">
                {row}
              </div>
            ))}
            <Input type="text" aria-label="Note" defaultValue="Evening stash" />
            <Input type="date" aria-label="Stored on" defaultValue="2024-06-01" />
            <Input type="datetime-local" aria-label="Logged at" defaultValue="2024-06-01T21:15" />
            <p data-last>Last field</p>
          </div>
          <div data-slot="dialog-footer" className="safe-x flex shrink-0 flex-col gap-2 border-t border-line bg-background pt-3">
            <Button type="button">Save</Button>
            <Button type="button" variant="destructive">Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
