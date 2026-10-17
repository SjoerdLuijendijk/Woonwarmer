"use client";

import { useState } from "react";
import QuoteDialog from "./QuoteDialog";

// Opens a new quote from anywhere, such as the quick actions on the home page.
export default function NewQuoteButton({ className, children }: { className: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <QuoteDialog quote={null} onClose={() => setOpen(false)} />}
    </>
  );
}
