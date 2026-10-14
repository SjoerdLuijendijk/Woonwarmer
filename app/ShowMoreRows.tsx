"use client";

import { useEffect, useRef } from "react";

// Shows the next rows when the user scrolls near the end of the list; the button does the same
// for keyboard users and browsers without scrolling (print preview).
export default function ShowMoreRows({ shown, total, onShowMore }: { shown: number; total: number; onShowMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && onShowMore(), {
      rootMargin: "800px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onShowMore]);

  return (
    <div ref={ref} className="show-more-rows">
      <span className="muted">{shown} van {total} getoond</span>
      <button type="button" className="secondary-button" onClick={onShowMore}>Meer tonen</button>
    </div>
  );
}
