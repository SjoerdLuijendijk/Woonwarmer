import Link from "next/link";
import { redirect } from "next/navigation";
import { memberClient } from "../../lib/auth";
import { legacyRedirect, ROUTES } from "../../lib/navigation";
import InvoiceDialog from "../InvoiceDialog";
import NewQuoteButton from "../NewQuoteButton";

const icon = (path: React.ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const PLUS_ICON = icon(<path d="M12 5v14M5 12h14" />);
const QUOTE_ICON = icon(<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />);
const INVOICE_ICON = icon(<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />);
const STOCK_ICON = icon(<path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 21v-7h6v7" />);

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type HomePageProps = {
  searchParams: Promise<{ tab?: string | string[]; sectie?: string | string[]; weergave?: string | string[]; soort?: string | string[] }>;
};

// The start page only offers the usual actions; it shows no figures, since customers may see the screen.
export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const target = legacyRedirect({ tab: first(params.tab), sectie: first(params.sectie), weergave: first(params.weergave), soort: first(params.soort) });
  if (target) redirect(target);

  if (!(await memberClient())) return null;

  return (
    <div className="home">
      <Link href={ROUTES.addStove} className="home-action">{PLUS_ICON}Kachel toevoegen</Link>
      <NewQuoteButton className="home-action">{QUOTE_ICON}Nieuwe offerte</NewQuoteButton>
      <InvoiceDialog stove={null} trigger={{ label: <>{INVOICE_ICON}Nieuwe factuur</>, className: "home-action" }} />
      <Link href={ROUTES.stock} className="home-action">{STOCK_ICON}Voorraad bekijken</Link>
    </div>
  );
}
