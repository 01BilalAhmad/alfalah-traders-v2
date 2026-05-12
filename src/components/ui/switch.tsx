"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "finexa-toggle peer inline-flex shrink-0 items-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {/* Track */}
      <div className="finexa-toggle-track">
        <div className="finexa-toggle-track-glow" />
        <div className="finexa-toggle-track-dots">
          <span className="finexa-toggle-track-dot" />
          <span className="finexa-toggle-track-dot" />
          <span className="finexa-toggle-track-dot" />
        </div>
      </div>
      {/* Thumb */}
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="finexa-toggle-thumb pointer-events-none"
      >
        <div className="finexa-toggle-thumb-shadow" />
        <div className="finexa-toggle-thumb-highlight" />
      </SwitchPrimitive.Thumb>
      {/* Particles */}
      <div className="finexa-toggle-particles">
        <span className="finexa-toggle-particle" />
        <span className="finexa-toggle-particle" />
        <span className="finexa-toggle-particle" />
        <span className="finexa-toggle-particle" />
      </div>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
