export function keyboardGap() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const kb = Math.max(0, window.innerHeight - height - offsetTop);
  return { kb, height, offsetTop };
}

export function sheetIsOpen() {
  return Boolean(document.querySelector("[data-slot='dialog-content'][data-state='open']"));
}

export function applyKeyboardVars() {
  const root = document.documentElement;
  if (!sheetIsOpen()) {
    root.style.setProperty("--kb", "0px");
    root.style.removeProperty("--vvh");
    return keyboardGap();
  }
  const gap = keyboardGap();
  root.style.setProperty("--kb", `${gap.kb}px`);
  root.style.setProperty("--vvh", `${gap.height}px`);
  return gap;
}

function isField(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.matches("input, textarea, select");
}

function pageScroller(target: HTMLElement) {
  let current: HTMLElement | null = target.parentElement;
  while (current) {
    if (current.getAttribute("data-slot") === "dialog-scroll") return null;
    if (current.id === "content") return current;
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

export function syncPagePadding() {
  const active = document.activeElement;
  const pads = document.querySelectorAll<HTMLElement>("[data-kb-pad]");
  const clear = () => {
    for (const node of pads) {
      node.style.removeProperty("padding-bottom");
      delete node.dataset.kbPad;
      delete node.dataset.kbPadBase;
    }
    document.documentElement.style.setProperty("--page-kb", "0px");
  };
  if (!(active instanceof HTMLElement) || !isField(active) || active.closest("[data-slot='dialog-content']") || sheetIsOpen()) {
    clear();
    return;
  }
  const { kb } = keyboardGap();
  document.documentElement.style.setProperty("--page-kb", `${kb}px`);
  const scroller = pageScroller(active);
  if (!scroller || kb <= 0) {
    clear();
    return;
  }
  if (scroller.dataset.kbPad !== "1") {
    scroller.dataset.kbPadBase = getComputedStyle(scroller).paddingBottom || "0px";
    scroller.dataset.kbPad = "1";
  }
  scroller.style.paddingBottom = `calc(${scroller.dataset.kbPadBase || "0px"} + ${kb}px)`;
}

export function scrollFocusedField() {
  const active = document.activeElement;
  if (!isField(active)) return;
  if (active.closest("[data-slot='dialog-content']")) {
    active.scrollIntoView({ block: "center", inline: "nearest" });
    return;
  }
  syncPagePadding();
  active.scrollIntoView({ block: "center", inline: "nearest" });
}
