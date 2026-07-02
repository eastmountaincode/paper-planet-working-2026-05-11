const devOutlineClasses = [
  "outline-cyan-400/80",
  "outline-fuchsia-400/80",
  "outline-lime-400/80",
  "outline-amber-400/80",
  "outline-sky-400/80",
  "outline-rose-400/80",
];

export function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function devOutline(enabled: boolean, level: number) {
  if (!enabled) {
    return "";
  }

  return classNames(
    "outline outline-1 outline-offset-[-1px]",
    devOutlineClasses[level % devOutlineClasses.length],
  );
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(
        target.closest(
          "a, button, input, select, textarea, [role='button'], [data-stage-interactive='true']",
        ),
      )
    : false;
}
