import ts from "typescript";
import gameFrameCss from "./gameFrameCss.cjs";
import type { Plugin } from "vite";

const { frameUnits, frameStylesheet } = gameFrameCss;

const geometryProperties = new Set([
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "top", "left", "right", "bottom", "inset",
  "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight",
  "fontSize", "lineHeight", "letterSpacing", "gap", "rowGap", "columnGap", "transform", "translate", "borderRadius", "background", "backgroundSize",
  "gridTemplateRows", "gridTemplateColumns", "flexBasis", "perspective", "boxShadow",
]);

/** Normalize authored inline styles without changing class names, media-query JS, or URLs. */
export function transformFrameSource(code: string, id: string): string {
  const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ts.isPropertyAssignment(node.parent)
      && (geometryProperties.has(node.parent.name.getText(source).replace(/[\'\"]/g, "")) || node.parent.name.getText(source).includes("--"))) {
      const next = frameUnits(node.text);
      if (next !== node.text) edits.push({ start: node.getStart(source), end: node.end, text: JSON.stringify(next) });
    } else if (ts.isNoSubstitutionTemplateLiteral(node) && ts.isJsxExpression(node.parent)
      && ts.isJsxElement(node.parent.parent) && node.parent.parent.openingElement.tagName.getText(source) === "style") {
      const next = frameStylesheet(node.text);
      if (next !== node.text) edits.push({ start: node.getStart(source), end: node.end, text: JSON.stringify(next) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return code;
}

export default function gameFrameSourcePlugin(): Plugin {
  return {
    name: "para-game-frame-inline-styles",
    enforce: "pre",
    transform(code, id) {
      const path = id.split("?")[0].replace(/\\/g, "/");
      if (!path.includes("/client/src/") || !/\.[jt]sx?$/.test(path) || !/\d(?:d|s|l)?v[wh]\b|@media/.test(code)) return null;
      const next = transformFrameSource(code, path);
      return next === code ? null : { code: next, map: null };
    },
  };
}
