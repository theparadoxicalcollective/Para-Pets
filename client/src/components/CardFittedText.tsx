import { useLayoutEffect, useRef } from "react";

/** Fit within the existing admin-positioned box without shrinking indefinitely. */
export default function CardFittedText({ text, preferredFontSize, minimumFontSize, curve = 0 }: {
  text: string;
  preferredFontSize: string;
  minimumFontSize?: number;
  curve?: number;
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
      node.style.whiteSpace = curve > 0 ? "nowrap" : "normal";
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
      node.style.display = curve > 0 ? "block" : "-webkit-box";
      node.style.whiteSpace = curve > 0 ? "nowrap" : "normal";
      node.style.webkitLineClamp = curve > 0 ? "unset" : String(Math.max(1, Math.floor(height / (size * lineHeight))));
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
  }, [text, preferredFontSize, minimumFontSize, curve]);

  const characters = Array.from(text);
  return <span
    ref={textRef}
    title={text}
    className={curve > 0 ? "card-fitted-text card-curved-title" : "card-fitted-text"}
    style={{
      display: curve > 0 ? "block" : "-webkit-box",
      WebkitBoxOrient: "vertical",
      width: "100%",
      flexShrink: 0,
      overflow: "hidden",
      overflowWrap: curve > 0 ? "normal" : "anywhere",
      whiteSpace: curve > 0 ? "nowrap" : "normal",
    }}
  >
    {curve > 0
      ? characters.map((character, index) => {
          const progress = characters.length <= 1 ? 0 : (index / (characters.length - 1)) * 2 - 1;
          const y = curve * .035 * progress * progress;
          const rotation = curve * .65 * progress;
          return <span
            key={index}
            className="card-curved-title-letter"
            aria-hidden="true"
            style={{
              display: "inline-block",
              transform: `translateY(${y.toFixed(3)}em) rotate(${rotation.toFixed(2)}deg)`,
              transformOrigin: "50% 100%",
            }}
          >{character === " " ? "\u00a0" : character}</span>;
        })
      : text}
  </span>;
}
