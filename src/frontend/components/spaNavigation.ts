import type { MouseEvent } from "react";

export function handleSpaLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  navigate: () => void,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.currentTarget.target
  ) {
    return;
  }
  event.preventDefault();
  navigate();
}
