import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { countArticles, getArticleMarkup, listArticles } from "../lib/article-queries";
import { requireTeamMember } from "../lib/auth";
import { isWideSection, parseAdminSection, type AdminSection } from "../lib/admin-sections";
import { parseStockTab } from "../lib/stock-tabs";
import type { StockView } from "../lib/stock-views";
import { countOpenNotes, listNotes } from "../lib/stove-note-queries";
import { countStovesByKind, getKnownBrands, getStoves } from "../lib/stove-queries";
import AccountMenu from "./AccountMenu";
import AddStoveForm from "./AddStoveForm";
import AdminPanel from "./AdminPanel";
import BrandLogo from "./BrandLogo";
import AgendaList from "./AgendaList";
import ArticleList from "./ArticleList";
import DeliveryList from "./DeliveryList";
import StockTabs from "./StockTabs";
import StoveNoteList from "./StoveNoteList";
import StoveTable from "./StoveTable";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ tab?: string | string[]; sectie?: string | string[]; weergave?: string | string[]; soort?: string | string[] }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { supabase, user, isMember } = await requireTeamMember();
  const { tab: requestedTab, sectie, weergave, soort } = await searchParams;
  // "instellingen" is the tab's former name; its links opened the company details.
  const activeTab =
    requestedTab === "voorraad" || requestedTab === "notities" || requestedTab === "afleveren" || requestedTab === "agenda"
      ? requestedTab
      : requestedTab === "admin" || requestedTab === "instellingen"
        ? "admin"
        : "toevoegen";
  const adminSection: AdminSection = parseAdminSection(sectie) ?? (requestedTab === "instellingen" ? "bedrijf" : "facturen");
  const stockView: StockView = activeTab === "voorraad" && weergave === "verkocht" ? "sold" : "available";
  // The articles are a tab of the current stock only; the archive holds sold stoves.
  const stockTab = stockView === "available" ? parseStockTab(soort) : null;
  const menuItem = activeTab === "admin" ? adminSection : activeTab === "notities" || activeTab === "afleveren" || activeTab === "agenda" ? activeTab : stockView === "sold" ? "verkocht" : null;
  const noteCounts = isMember ? await countOpenNotes(supabase) : { open: 0, toDeliver: 0, today: 0 };

  return (
    <div className="app-shell">
      <header className="site-header">
        <BrandLogo />
        {isMember && (
          <nav className="tabs" aria-label="Hoofdmenu">
            <Link href="/" aria-current={activeTab === "toevoegen" ? "page" : undefined}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Kachel toevoegen
            </Link>
            <Link href="/?tab=voorraad" aria-current={activeTab === "voorraad" && stockView === "available" ? "page" : undefined}>Aanbod</Link>
          </nav>
        )}
        <AccountMenu email={user.email} showSections={isMember} activeItem={menuItem} noteCounts={noteCounts} />
      </header>

      <main className={activeTab === "toevoegen" || (activeTab === "admin" && !isWideSection(adminSection)) ? "page-main" : "page-main page-main--wide"}>
        {!isMember ? (
          <div className="notice" role="alert">
            <strong>Geen toegang</strong>
            <p>Je account staat (nog) niet op de teamlijst. Vraag de beheerder om je toe te voegen.</p>
          </div>
        ) : activeTab === "toevoegen" ? (
          <AddStoveForm brands={await getKnownBrands(supabase)} />
        ) : activeTab === "agenda" ? (
          <section aria-labelledby="agenda-title">
            <div className="stock-toolbar">
              <div className="stock-title-row">
                <h1 id="agenda-title">Agenda</h1>
              </div>
            </div>
            <AgendaList notes={await listNotes(supabase)} />
          </section>
        ) : activeTab === "afleveren" ? (
          <section aria-labelledby="delivery-title">
            <div className="stock-toolbar">
              <div className="stock-title-row">
                <h1 id="delivery-title">Af te leveren</h1>
              </div>
            </div>
            <DeliveryList notes={await listNotes(supabase)} />
          </section>
        ) : activeTab === "notities" ? (
          <StoveNoteList notes={await listNotes(supabase)} />
        ) : activeTab === "admin" ? (
          <AdminPanel supabase={supabase} section={adminSection} />
        ) : stockTab === "articles" ? (
          await renderStockArticles(supabase)
        ) : (
          <StoveTable
            stoves={await getStoves(supabase)}
            view={stockView}
            articleCount={stockView === "available" ? await countArticles(supabase) : undefined}
            initialKind={stockTab}
          />
        )}
      </main>
    </div>
  );
}

// Aanbod → Losse artikelen: the article list under the stock page's title and tabs.
async function renderStockArticles(supabase: SupabaseClient) {
  const [articles, markupPct, stoveCounts] = await Promise.all([listArticles(supabase), getArticleMarkup(supabase), countStovesByKind(supabase)]);
  const tabs = (["used", "new", "order"] as const).map((tab) => ({ tab, count: stoveCounts[tab] }));
  return (
    <ArticleList
      articles={articles}
      markupPct={markupPct}
      title="Aanbod"
      tabs={<StockTabs tabs={[...tabs, { tab: "articles", count: articles.length }]} active="articles" />}
    />
  );
}
