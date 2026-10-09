import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-base font-medium transition-colors duration-200 outline-none focus-visible:outline-2 focus-visible:outline-forest focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-forest text-ivory hover:bg-forest/90",
        secondary: "bg-lime text-charcoal hover:bg-lime/80",
        outline: "border border-line bg-paper text-charcoal hover:bg-ivory",
        ghost: "text-charcoal hover:bg-forest/10",
      },
      size: {
        default: "h-11 px-5",
        // Below the 44px touch minimum: dense pointer UIs only, never a touch target.
        sm: "h-9 px-4 text-sm",
        lg: "h-12 px-6",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
