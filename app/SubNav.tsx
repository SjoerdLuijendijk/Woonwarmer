"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroupOf, type NavCountKey } from "../lib/navigation";

// The pages of the current menu group, in a bar below the header.
export default function SubNav({ counts }: { counts: Record<NavCountKey, number> }) {
  const pathname = usePathname();
  const group = navGroupOf(pathname);
  if (!group || group.pages.length === 0) return null;
  return (
    <nav className="sub-nav" aria-label={group.label}>
      <ul>
        {group.pages.map(({ label, href, count }) => (
          <li key={href}>
            <Link href={href} aria-current={pathname === href ? "page" : undefined}>
              {label}
              {count && counts[count] > 0 && <span className="count-badge">{counts[count]}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
