// The management pages, opened straight from the account menu. The routes keep the former Admin tab.
export type AdminSection = "offertes" | "facturen" | "bedrijf" | "advertentie" | "artikelen" | "opslag" | "catalogus";

type AdminSectionInfo = {
  key: AdminSection;
  label: string;
  href: string;
  /** Shown under "Instellingen" in the account menu. */
  setting?: boolean;
  /** A wide table page instead of a narrow form. */
  wide?: boolean;
};

export const ADMIN_SECTIONS: AdminSectionInfo[] = [
  { key: "offertes", label: "Offertes", href: "/?tab=admin&sectie=offertes", wide: true },
  { key: "facturen", label: "Facturen", href: "/?tab=admin", wide: true },
  { key: "bedrijf", label: "Bedrijfsgegevens", href: "/?tab=admin&sectie=bedrijf", setting: true },
  { key: "advertentie", label: "Prompt instellen", href: "/?tab=admin&sectie=advertentie", setting: true },
  { key: "artikelen", label: "Artikelen", href: "/?tab=admin&sectie=artikelen", setting: true, wide: true },
  { key: "opslag", label: "Opslag losse artikelen", href: "/?tab=admin&sectie=opslag", setting: true },
  { key: "catalogus", label: "Catalogus importeren", href: "/?tab=admin&sectie=catalogus", setting: true },
];

export function parseAdminSection(value: unknown): AdminSection | null {
  return ADMIN_SECTIONS.find(({ key }) => key === value)?.key ?? null;
}

export const isWideSection = (section: AdminSection) => ADMIN_SECTIONS.some(({ key, wide }) => key === section && wide);
