import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "wouter";
import { calculateStageLayout, getStageTransform, getVisibleViewport } from "@/lib/stage";

/** One scroll owner around the authored canvas; pages keep their own internal scrollers. */
export default function GameFrame({ children, backgroundImage }: { children: ReactNode; backgroundImage?: string }) {
  const [location] = useLocation();
  const [layout, setLayout] = useState(() => {
    const v = getVisibleViewport();
    return calculateStageLayout(v.width, v.height, v.top, v.left);
  });
  const scroller = useRef<HTMLDivElement>(null);
  const previousScale = useRef(layout.scale);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const v = getVisibleViewport();
      const next = calculateStageLayout(v.width, v.height, v.top, v.left);
      setLayout(next);
      // Outside-canvas UI retains real viewport units. Inside, the canvas overrides them.
      const root = document.documentElement.style;
      root.setProperty("--stage-scale", String(next.scale));
      root.setProperty("--viewport-height", `${next.viewportHeight}px`);
      root.setProperty("--viewport-width", `${next.viewportWidth}px`);
      root.setProperty("--fh", `${next.viewportHeight}px`);
      root.setProperty("--vh", `${next.viewportHeight * .01}px`);
      root.setProperty("--vw", `${next.viewportWidth * .01}px`);
      root.setProperty("--stage-logical-width", `${next.designWidth}px`);
      root.setProperty("--stage-logical-height", `${next.designHeight}px`);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("pageshow", schedule);
    document.addEventListener("visibilitychange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("pageshow", schedule);
      document.removeEventListener("visibilitychange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop *= layout.scale / previousScale.current;
    previousScale.current = layout.scale;
  }, [layout.scale]);
  useLayoutEffect(() => { scroller.current?.scrollTo({ top: 0, left: 0 }); }, [location]);

  return (
    <div ref={scroller} className="game-stage-shell" data-testid="game-frame-scroll" role="region" aria-label="Game screen"
      tabIndex={layout.renderedHeight > layout.viewportHeight ? 0 : -1}
      style={{
        position: "fixed", left: layout.viewportLeft, top: layout.viewportTop,
        width: layout.viewportWidth, height: layout.viewportHeight,
        overflowX: "hidden", overflowY: "auto", overscrollBehaviorY: "contain",
        WebkitOverflowScrolling: "touch", scrollbarWidth: "none", background: "#050c08",
        "--desktop-stage-background-image": backgroundImage ? `url(${backgroundImage})` : undefined,
      } as CSSProperties}>
      {/* Transforms do not change layout height, so this box owns the rendered scroll extent. */}
      <div style={{ position: "relative", overflow: "hidden", width: layout.renderedWidth, height: layout.renderedHeight,
        marginLeft: layout.left - layout.viewportLeft, marginTop: layout.top - layout.viewportTop }}>
        <div id="game-stage" data-fixed-composition="true" data-design-width={layout.designWidth} data-design-height={layout.designHeight}
          style={{
            position: "absolute", left: 0, top: 0, width: layout.designWidth, height: layout.designHeight,
            transform: getStageTransform(layout), transformOrigin: "top left", overflow: "hidden", isolation: "isolate",
            "--fh": `${layout.designHeight}px`, "--vh": `${layout.designHeight * .01}px`, "--vw": `${layout.designWidth * .01}px`,
          } as CSSProperties}>
          {children}
        </div>
      </div>
    </div>
  );
}
