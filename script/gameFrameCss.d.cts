declare function gameFrameCss(): import("postcss").Plugin;
declare namespace gameFrameCss {
  function frameUnits(value: string): string;
  function referenceMedia(value: string): string;
  function frameStylesheet(value: string): string;
}
export = gameFrameCss;
