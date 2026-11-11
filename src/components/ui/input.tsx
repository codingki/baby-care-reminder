import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "block h-12 max-w-full min-h-12 w-full min-w-0 rounded-2xl border border-line bg-card px-4 text-base font-normal text-foreground outline-none placeholder:text-muted disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
