import Link from "next/link";
import { redirect } from "next/navigation";
import { countArticles } from "../../lib/article-queries";
import { memberClient } from "../../lib/auth";
import { invoiceOverview } from "../../lib/invoice-overview";
import { listInvoices } from "../../lib/invoice-queries";
import { legacyRedirect, ROUTES } from "../../lib/navigation";
import { formatPrice } from "../../lib/price";
import { STOCK_TAB_LABELS, stockTabHref } from "../../lib/stock-tabs";
import { countOpenNotes } from "../../lib/stove-note-queries";
import { countStovesByKind } from "../../lib/stove-queries";
import HomeTile from "../HomeTile";
import InvoiceDialog from "../InvoiceDialog";
import NewQuoteButton from "../NewQuoteButton";

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

const PLUS_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type HomePageProps = {
  searchParams: Promise<{ tab?: string | string[]; sectie?: string | string[]; weergave?: string | string[]; soort?: string | string[] }>;
};

// The day at a glance: what needs doing today, the stock per kind and the money still to come in.
export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const target = legacyRedirect({ tab: first(params.tab), sectie: first(params.sectie), weergave: first(params.weergave), soort: first(params.soort) });
  if (target) redirect(target);

  const supabase = await memberClient();
  if (!supabase) return null;
  const [notes, stoves, articleCount, invoices] = await Promise.all([
    countOpenNotes(supabase),
    countStovesByKind(supabase),
    countArticles(supabase),
    listInvoices(supabase),
  ]);
  const { drafts, unpaid, openCents } = invoiceOverview(invoices);
  const negotiating = notes.open - notes.toDeliver;

  return (
    <div className="home">
      <div className="home-heading">
        <h1>Overzicht</h1>
        <p className="muted home-date">{DATE_FORMAT.format(new Date())}</p>
      </div>

      <div className="home-actions">
        <Link href={ROUTES.addStove} className="secondary-button home-action">{PLUS_ICON}Kachel toevoegen</Link>
        <NewQuoteButton className="secondary-button home-action">{PLUS_ICON}Nieuwe offerte</NewQuoteButton>
        <InvoiceDialog stove={null} trigger={{ label: <>{PLUS_ICON}Nieuwe factuur</>, className: "secondary-button home-action" }} />
      </div>

      <section className="home-section" aria-labelledby="home-today">
        <h2 id="home-today">Vandaag</h2>
        <div className="home-tiles">
          <HomeTile href={ROUTES.agenda} label="Afspraken vandaag" value={notes.today} highlight={notes.today > 0} />
          <HomeTile href={ROUTES.delivery} label="Af te leveren" value={notes.toDeliver} highlight={notes.toDeliver > 0} />
          <HomeTile href={ROUTES.negotiations} label="In onderhandeling" value={negotiating} />
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-stock">
        <h2 id="home-stock">Voorraad</h2>
        <div className="home-tiles">
          <HomeTile href={stockTabHref("used")} label={STOCK_TAB_LABELS.used} value={stoves.used} detail="kachels" />
          <HomeTile href={stockTabHref("new")} label={STOCK_TAB_LABELS.new} value={stoves.new} detail="kachels" />
          <HomeTile href={stockTabHref("order")} label={STOCK_TAB_LABELS.order} value={stoves.order} detail="kachels" />
          <HomeTile href={stockTabHref("articles")} label={STOCK_TAB_LABELS.articles} value={articleCount} detail="artikelen" />
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-money">
        <h2 id="home-money">Financieel</h2>
        <div className="home-tiles">
          <HomeTile
            href={ROUTES.invoices}
            label="Nog te ontvangen"
            value={formatPrice(openCents, { alwaysCents: true })}
            detail={unpaid.length === 1 ? "1 openstaande factuur" : `${unpaid.length} openstaande facturen`}
          />
          <HomeTile href={ROUTES.invoices} label="Conceptfacturen" value={drafts.length} detail="nog niet verstuurd" highlight={drafts.length > 0} />
        </div>
      </section>
    </div>
  );
}
