let appFrame: HTMLElement | null = null;

export function bindAppFrame(node: HTMLElement | null) {
  appFrame = node;
}

export function appFrameElement() {
  if (appFrame) return appFrame;
  if (typeof document === "undefined") return null;
  return document.getElementById("app-frame");
}
