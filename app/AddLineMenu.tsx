"use client";

import { useId, useRef } from "react";

export type AddLineOption = { key: string; label: string; detail: string; disabled?: boolean; onSelect: () => void };

type AddLineMenuProps = {
  options: AddLineOption[];
  disabled?: boolean;
};

// "＋ Nieuwe regel": opens the kinds of line to choose from below the button. The list is a popover in
// the top layer, so the scrolling dialog does not clip it.
export default function AddLineMenu({ options, disabled }: AddLineMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function open() {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    menu.showPopover();
    // Below the button, or above it when there is no room below.
    const below = rect.bottom + 6 + menu.offsetHeight <= window.innerHeight;
    menu.style.top = `${below ? rect.bottom + 6 : Math.max(8, rect.top - 6 - menu.offsetHeight)}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    // The list is placed once; close it rather than leave it behind when the dialog scrolls.
    window.addEventListener("scroll", () => menu.hidePopover(), { once: true, capture: true });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }

  function choose(option: AddLineOption) {
    menuRef.current?.hidePopover();
    option.onSelect();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="secondary-button add-line-button"
        onClick={open}
        disabled={disabled}
        aria-haspopup="true"
        aria-controls={menuId}
      >
        ＋ Nieuwe regel
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        className="status-menu add-line-menu"
        onToggle={(event) => {
          // Back to the button when the list closes with Escape or a click elsewhere.
          if ((event as unknown as ToggleEvent).newState === "closed" && menuRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
        }}
      >
        <ul>
          {options.map((option) => (
            <li key={option.key}>
              <button type="button" onClick={() => choose(option)} disabled={option.disabled}>
                <span className="add-line-label">{option.label}</span>
                <span className="add-line-detail">{option.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
