import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AD_PROMPT } from "../lib/ad-prompt";
import { ADMIN_SECTIONS, type AdminSection } from "../lib/admin-sections";
import { getCompany, listInvoices } from "../lib/invoice-queries";
import { getAdPrompt } from "../lib/marketplace-ad-store";
import AdPromptForm from "./AdPromptForm";
import CatalogImport from "./CatalogImport";
import ShopResync from "./ShopResync";
import CompanySettingsForm from "./CompanySettingsForm";
import { listArticles } from "../lib/article-queries";
import { listQuotes } from "../lib/quote-queries";
import ArticleList from "./ArticleList";
import QuoteList from "./QuoteList";
import InvoiceDialog from "./InvoiceDialog";
import InvoiceList from "./InvoiceList";

// One management page, opened from the account menu.
export default async function AdminPanel({ supabase, section }: { supabase: SupabaseClient; section: AdminSection }) {
  if (section === "artikelen") return <ArticleList articles={await listArticles(supabase)} />;
  if (section === "offertes") return <QuoteList quotes={await listQuotes(supabase)} />;
  // The invoices are a wide table, laid out like the stock page.
  if (section === "facturen") {
    return (
      <section aria-labelledby="admin-title">
        <div className="stock-toolbar">
          <div className="stock-title-row">
            <h1 id="admin-title">Facturen</h1>
            <InvoiceDialog stove={null} />
          </div>
        </div>
        <InvoiceList invoices={await listInvoices(supabase)} />
      </section>
    );
  }
  return (
    <section className="panel" aria-labelledby="admin-title">
      <h1 id="admin-title">{ADMIN_SECTIONS.find(({ key }) => key === section)?.label}</h1>
      {section === "advertentie" ? (
        <AdPromptForm prompt={(await getAdPrompt(supabase)) ?? DEFAULT_AD_PROMPT} />
      ) : section === "catalogus" ? (
        <>
          <CatalogImport />
          <ShopResync />
        </>
      ) : (
        <CompanySettingsForm company={await getCompany(supabase)} />
      )}
    </section>
  );
}
