"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<"label"> & {
  /** Kennzeichnet das Feld als Pflichtfeld (Stern). */
  required?: boolean
}) {
  return (
    <label
      data-slot="label"
      data-required={required ? "true" : undefined}
      className={cn(
        "text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </label>
  )
}

export { Label }
