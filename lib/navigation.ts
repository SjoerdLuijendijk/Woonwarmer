// The app's pages, grouped as in the main menu. Each group has its pages in the bar below the header.
export type NavCountKey = "today" | "toDeliver" | "negotiating";

export type NavPage = { label: string; href: string; count?: NavCountKey };

export type NavGroup = { key: "home" | "voorraad" | "verkoop" | "beheer"; label: string; href: string; pages: NavPage[] };

export const ROUTES = {
  home: "/",
  addStove: "/kachel-toevoegen",
  stock: "/voorraad",
  sold: "/voorraad/verkocht",
  agenda: "/verkoop/agenda",
  delivery: "/verkoop/afleveren",
  negotiations: "/verkoop/onderhandeling",
  quotes: "/verkoop/offertes",
  invoices: "/verkoop/facturen",
  articles: "/beheer/artikelen",
  markup: "/beheer/opslag",
  catalog: "/beheer/catalogus",
  company: "/beheer/bedrijf",
  adPrompt: "/beheer/prompt",
} as const;

export const NAV_GROUPS: NavGroup[] = [
  { key: "home", label: "Home", href: ROUTES.home, pages: [] },
  {
    key: "voorraad",
    label: "Voorraad",
    href: ROUTES.stock,
    pages: [
      { label: "Aanbod", href: ROUTES.stock },
      { label: "Verkocht archief", href: ROUTES.sold },
    ],
  },
  {
    key: "verkoop",
    label: "Verkoop",
    href: ROUTES.agenda,
    pages: [
      { label: "Agenda", href: ROUTES.agenda, count: "today" },
      { label: "Af te leveren", href: ROUTES.delivery, count: "toDeliver" },
      { label: "In onderhandeling", href: ROUTES.negotiations, count: "negotiating" },
      { label: "Offertes", href: ROUTES.quotes },
      { label: "Facturen", href: ROUTES.invoices },
    ],
  },
  {
    key: "beheer",
    label: "Beheer",
    href: ROUTES.articles,
    pages: [
      { label: "Artikelen", href: ROUTES.articles },
      { label: "Opslag losse artikelen", href: ROUTES.markup },
      { label: "Catalogus importeren", href: ROUTES.catalog },
      { label: "Bedrijfsgegevens", href: ROUTES.company },
      { label: "Prompt instellen", href: ROUTES.adPrompt },
    ],
  },
];

/** The group a path belongs to; the add stove page belongs to none. */
export function navGroupOf(pathname: string): NavGroup | null {
  if (pathname === ROUTES.home) return NAV_GROUPS[0];
  return NAV_GROUPS.find(({ key }) => key !== "home" && pathname.startsWith(`/${key}`)) ?? null;
}

const LEGACY_SECTIONS: Record<string, string> = {
  offertes: ROUTES.quotes,
  facturen: ROUTES.invoices,
  bedrijf: ROUTES.company,
  advertentie: ROUTES.adPrompt,
  artikelen: ROUTES.articles,
  opslag: ROUTES.markup,
  catalogus: ROUTES.catalog,
};

type LegacyParams = { tab?: string; sectie?: string; weergave?: string; soort?: string };

// The pages used to be tabs of "/" (?tab=voorraad, ?tab=admin&sectie=...). Bookmarks and old links
// still use those addresses; this gives the page that replaced them, or null for the home page.
export function legacyRedirect({ tab, sectie, weergave, soort }: LegacyParams): string | null {
  switch (tab) {
    case undefined:
      return null;
    case "toevoegen":
      return ROUTES.addStove;
    case "voorraad":
      if (weergave === "verkocht") return ROUTES.sold;
      return soort ? `${ROUTES.stock}?soort=${encodeURIComponent(soort)}` : ROUTES.stock;
    case "agenda":
      return ROUTES.agenda;
    case "afleveren":
      return ROUTES.delivery;
    case "notities":
      return ROUTES.negotiations;
    case "instellingen":
      return LEGACY_SECTIONS[sectie ?? ""] ?? ROUTES.company;
    case "admin":
      return LEGACY_SECTIONS[sectie ?? ""] ?? ROUTES.invoices;
    default:
      return null;
  }
}
