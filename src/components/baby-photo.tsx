"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { SavingLabel } from "@/components/saving-label";
import { useI18n } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";

const SIGNED_SECONDS = 60 * 60;
const CACHE_MS = 55 * 60 * 1000;
const signedUrls = new Map<string, { url: string; until: number }>();

async function signedBabyPhoto(path: string): Promise<string | null> {
  const cached = signedUrls.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data } = await createClient().storage.from("baby-photos").createSignedUrl(path, SIGNED_SECONDS);
  if (!data?.signedUrl) return null;
  signedUrls.set(path, { url: data.signedUrl, until: Date.now() + CACHE_MS });
  return data.signedUrl;
}

function forgetSignedBabyPhoto(path: string | null) {
  if (path) signedUrls.delete(path);
}

export async function squareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const originX = Math.round((bitmap.width - side) / 2);
    const originY = Math.round((bitmap.height - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, originX, originY, side, side, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("webp");
    return blob;
  } finally {
    bitmap.close();
  }
}

export async function replaceBabyPhoto(familyId: string, babyId: string, previous: string | null, file: File) {
  const blob = await squareWebp(file);
  const path = `${familyId}/${babyId}/${crypto.randomUUID()}.webp`;
  const supabase = createClient();
  const { error: uploadError } = await supabase.storage.from("baby-photos").upload(path, blob, {
    contentType: "image/webp",
    upsert: false,
  });
  if (uploadError) return null;
  const { error } = await supabase.from("babies").update({ photo_path: path }).eq("id", babyId);
  if (error) {
    await supabase.storage.from("baby-photos").remove([path]);
    return null;
  }
  if (previous && previous !== path) {
    await supabase.storage.from("baby-photos").remove([previous]);
    forgetSignedBabyPhoto(previous);
  }
  return path;
}

export async function removeBabyPhoto(babyId: string, path: string) {
  const supabase = createClient();
  const { error: storageError } = await supabase.storage.from("baby-photos").remove([path]);
  if (storageError) return false;
  const { error } = await supabase.from("babies").update({ photo_path: null }).eq("id", babyId);
  if (error) return false;
  forgetSignedBabyPhoto(path);
  return true;
}

export function BabyAvatar({
  name,
  path,
  className = "h-12 w-12",
}: {
  name: string;
  path: string | null;
  className?: string;
}) {
  const [shot, setShot] = useState<{ path: string; url: string } | null>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const url = path && shot?.path === path ? shot.url : null;

  useEffect(() => {
    if (!path) return;
    let ignore = false;
    void signedBabyPhoto(path).then((next) => {
      if (!ignore && next) setShot({ path, url: next });
    });
    return () => {
      ignore = true;
    };
  }, [path]);

  if (url) {
    return (
      // Signed storage URLs expire and are not a Next image host.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={`${className} rounded-full object-cover`} />
    );
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-[#e7eee9] text-lg font-semibold text-accent`}
    >
      {initial}
    </span>
  );
}

export function BabyPhotoField({
  familyId,
  babyId,
  name,
  path,
  onChange,
}: {
  familyId: string;
  babyId: string;
  name: string;
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [failed, setFailed] = useState(false);

  async function onFile(file: File) {
    setPending("upload");
    setFailed(false);
    try {
      const next = await replaceBabyPhoto(familyId, babyId, path, file);
      if (!next) {
        setFailed(true);
        return;
      }
      onChange(next);
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    if (!path) return;
    setPending("remove");
    setFailed(false);
    const ok = await removeBabyPhoto(babyId, path);
    setPending(null);
    if (!ok) {
      setFailed(true);
      return;
    }
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <label htmlFor={inputId} className="relative cursor-pointer">
          <BabyAvatar name={name} path={path} />
          <span className="sr-only">{path ? t("family.changePhoto") : t("family.addPhoto")}</span>
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={pending !== null}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold">{t("family.photo")}</p>
          {pending ? (
            <p role="status">
              <SavingLabel label={t("family.photoUploading")} />
            </p>
          ) : (
            <p className="text-sm text-muted">{path ? t("family.changePhoto") : t("family.addPhoto")}</p>
          )}
        </div>
      </div>
      {path ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="self-start"
          disabled={pending !== null}
          aria-busy={pending === "remove"}
          onClick={() => void remove()}
        >
          {pending === "remove" ? <SavingLabel label={t("family.photoUploading")} /> : t("family.removePhoto")}
        </Button>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm">
          {t("family.photoFailed")}
        </p>
      ) : null}
    </div>
  );
}
