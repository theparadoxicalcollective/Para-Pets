import * as React from "react"
import { isNarrowLayout, WIDE_BREAKPOINT } from "@/lib/stage"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${WIDE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(isNarrowLayout(window.visualViewport?.width ?? window.innerWidth))
    }
    mql.addEventListener("change", onChange)
    window.visualViewport?.addEventListener("resize", onChange)
    onChange()
    return () => {
      mql.removeEventListener("change", onChange)
      window.visualViewport?.removeEventListener("resize", onChange)
    }
  }, [])

  return !!isMobile
}
