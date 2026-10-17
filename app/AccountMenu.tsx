"use client";

import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "./auth/actions";

// Profile button top right; its dropdown shows who is signed in and signs out.
export default function AccountMenu({ email }: { email: string | undefined }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on a click or tap outside the menu.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && open) {
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div className="account-menu" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="account-button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Account"
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
        <svg aria-hidden="true" className="account-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div id={menuId} className="account-dropdown" hidden={!open}>
        {email && <p className="account-email" title={email}>{email}</p>}
        <form action={signOut} className="account-signout">
          <button type="submit">Uitloggen</button>
        </form>
      </div>
    </div>
  );
}
