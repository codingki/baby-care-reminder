"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    const supabase = createClient();
    void supabase.storage
      .from("baby-photos")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!ignore && data?.signedUrl) setShot({ path, url: data.signedUrl });
      });
    return () => {
      ignore = true;
    };
  }, [path]);

  if (url) {
    return (
      // Signed storage URLs are short-lived and are not a Next image host.
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

export async function saveBabyPhoto(familyId: string, babyId: string, file: File) {
  const supabase = createClient();
  const path = `${familyId}/${babyId}`;
  const { error: uploadError } = await supabase.storage.from("baby-photos").upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (uploadError) return null;
  const { error } = await supabase.from("babies").update({ photo_path: path }).eq("id", babyId);
  if (error) return null;
  return path;
}
