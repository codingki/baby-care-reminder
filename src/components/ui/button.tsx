import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-2xl border border-transparent text-base font-semibold whitespace-nowrap outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground",
        outline: "border-line bg-card text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        ghost: "text-accent",
        destructive: "bg-transparent text-danger",
        link: "text-accent",
      },
      size: {
        default: "min-h-12 gap-2 px-4",
        xs: "min-h-8 gap-1 rounded-full px-2 text-xs",
        sm: "min-h-9 gap-1 rounded-full px-3 text-sm",
        lg: "min-h-16 gap-2 px-4",
        icon: "size-11 rounded-full",
        "icon-xs": "size-8 rounded-full",
        "icon-sm": "size-9 rounded-full",
        "icon-lg": "size-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
