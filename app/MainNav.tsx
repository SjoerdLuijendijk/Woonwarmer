"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, navGroupOf, type NavCountKey } from "../lib/navigation";

type MainNavProps = { counts: Record<NavCountKey, number> };

const groupCount = (pages: { count?: NavCountKey }[], counts: Record<NavCountKey, number>) =>
  pages.reduce((sum, { count }) => sum + (count && count !== "today" ? counts[count] : 0), 0);

// The four groups in the header; the pages of the current group in a bar below it.
export default function MainNav({ counts }: MainNavProps) {
  const pathname = usePathname();
  const current = navGroupOf(pathname);
  return (
    <nav className="main-nav" aria-label="Hoofdmenu">
      {NAV_GROUPS.map((group) => {
        // Today's appointments are part of the open notes, so the group badge counts the notes once.
        const count = groupCount(group.pages, counts);
        return (
          <Link key={group.key} href={group.href} aria-current={current?.key === group.key ? "page" : undefined}>
            {group.label}
            {count > 0 && <span className="count-badge">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
