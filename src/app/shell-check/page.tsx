"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
            <Input type="text" inputMode="decimal" aria-label="Weight" defaultValue="3.4" />
            <Select value={sex} onValueChange={setSex}>
              <SelectTrigger aria-label="Sex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="unspecified">Unspecified</SelectItem>
              </SelectContent>
            </Select>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
