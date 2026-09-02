import { useLayoutEffect, useRef } from "react";

/** Fit within the existing admin-positioned box without shrinking indefinitely. */
export default function CardFittedText({ text, preferredFontSize, minimumFontSize }: {
  text: string;
  preferredFontSize: string;
  minimumFontSize?: number;
}) {
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = textRef.current;
    const box = node?.parentElement;
    if (!node || !box) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      const style = getComputedStyle(box);
      const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (width <= 0 || height <= 0) return;
      const preferred = parseFloat(style.fontSize);
      const lineHeight = parseFloat(style.lineHeight) / preferred;
      const minimum = Math.min(preferred, minimumFontSize ?? preferred * .8);
      node.style.display = "block";
      node.style.webkitLineClamp = "unset";
      node.style.lineHeight = String(lineHeight);
      const fits = (size: number) => {
        node.style.fontSize = `${size}px`;
        return node.scrollHeight <= height + .5 && node.scrollWidth <= width + .5;
      };
      let size = preferred;
      if (!fits(preferred)) {
        let low = minimum;
        let high = preferred;
        if (fits(minimum)) {
          // Bounded search only when text does not fit at its preferred size.
          for (let step = 0; step < 7; step++) {
            const middle = (low + high) / 2;
            if (fits(middle)) low = middle;
            else high = middle;
          }
        }
        size = low;
      }
      node.style.fontSize = `${size}px`;
      node.style.display = "-webkit-box";
      node.style.webkitLineClamp = String(Math.max(1, Math.floor(height / (size * lineHeight))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [text, preferredFontSize, minimumFontSize]);

  return <span ref={textRef} title={text} style={{
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    width: "100%",
    flexShrink: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
  }}>{text}</span>;
}
