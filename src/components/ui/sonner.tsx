"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      duration={5000}
      offset={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "pointer-events-auto flex min-h-12 items-center gap-4 rounded-full bg-[#3d4441] px-4 text-sm text-white",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
