import { countArticles, getArticleMarkup, listArticles } from "../../../lib/article-queries";
import { memberClient } from "../../../lib/auth";
import { parseStockTab } from "../../../lib/stock-tabs";
import { countStovesByKind, getStoves } from "../../../lib/stove-queries";
import ArticleList from "../../ArticleList";
import StockTabs from "../../StockTabs";
import StoveTable from "../../StoveTable";

type StockPageProps = { searchParams: Promise<{ soort?: string | string[] }> };

// Aanbod: the stoves on offer per kind, and the separate articles as a fourth tab (?soort=artikelen).
export default async function StockPage({ searchParams }: StockPageProps) {
  const supabase = await memberClient();
  if (!supabase) return null;
  const stockTab = parseStockTab((await searchParams).soort);

  if (stockTab === "articles") {
    const [articles, markupPct, stoveCounts] = await Promise.all([listArticles(supabase), getArticleMarkup(supabase), countStovesByKind(supabase)]);
    const tabs = (["used", "new", "order"] as const).map((tab) => ({ tab, count: stoveCounts[tab] }));
    return (
      <ArticleList
        articles={articles}
        markupPct={markupPct}
        title="Aanbod"
        tabs={<StockTabs tabs={[...tabs, { tab: "articles", count: articles.length }]} active="articles" />}
        showImports={false}
      />
    );
  }

  const [stoves, articleCount] = await Promise.all([getStoves(supabase), countArticles(supabase)]);
  return <StoveTable stoves={stoves} view="available" articleCount={articleCount} initialKind={stockTab} />;
}
