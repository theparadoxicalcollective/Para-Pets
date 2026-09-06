import { useEffect } from "react";

const WORDING: ReadonlyArray<[RegExp, string]> = [
  [/\bCostumes\b/g, "Adornments"],
  [/\bCostume\b/g, "Adornment"],
  [/\bcostumes\b/g, "adornments"],
  [/\bcostume\b/g, "adornment"],
];

function renameVisibleText(value: string): string {
  return WORDING.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), value);
}

function applyTerminology(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const node of textNodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, code, pre")) continue;
    const next = renameVisibleText(node.data);
    if (next !== node.data) node.data = next;
  }

  const elements = root instanceof Element ? [root, ...root.querySelectorAll("[aria-label],[title],[placeholder]")] : [...root.querySelectorAll("[aria-label],[title],[placeholder]")];
  for (const element of elements) {
    for (const attribute of ["aria-label", "title", "placeholder"] as const) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      const next = renameVisibleText(current);
      if (next !== current) element.setAttribute(attribute, next);
    }
  }

  for (const option of root.querySelectorAll("option")) {
    const next = renameVisibleText(option.textContent ?? "");
    if (next !== option.textContent) option.textContent = next;
  }
}

/**
 * Player-facing terminology is Adornment/Adornments. Existing API paths,
 * database table names and the legacy `costume` discriminator intentionally
 * remain compatibility identifiers so already-owned/equipped items are never
 * orphaned by a vocabulary-only change.
 */
export default function AdornmentTerminologyBridge() {
  useEffect(() => {
    applyTerminology(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target.parentNode) {
          applyTerminology(record.target.parentNode);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) applyTerminology(node);
          else if (node.parentNode) applyTerminology(node.parentNode);
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
