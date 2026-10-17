"use client";

import { useEffect } from "react";

const isOutside = (dialog: HTMLDialogElement, event: MouseEvent) => {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
};

// A click on the backdrop of any modal dialog acts like Escape: it fires the dialog's cancel event,
// so dialogs that handle cancel themselves keep doing so, and otherwise closes the dialog. The press
// must also start outside, so selecting text and releasing next to the dialog does not close it.
export function useBackdropClose() {
  useEffect(() => {
    let pressedDialog: HTMLDialogElement | null = null;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      pressedDialog = target instanceof HTMLDialogElement && target.open && isOutside(target, event) ? target : null;
    }

    function handleClick(event: MouseEvent) {
      const dialog = pressedDialog;
      pressedDialog = null;
      if (!dialog || event.target !== dialog || !dialog.open || !dialog.matches(":modal") || !isOutside(dialog, event)) return;
      const cancel = new Event("cancel", { cancelable: true });
      if (dialog.dispatchEvent(cancel)) dialog.close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("click", handleClick);
    };
  }, []);
}
