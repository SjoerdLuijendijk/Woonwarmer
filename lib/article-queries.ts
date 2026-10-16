import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "./all-pages";
import { ARTICLE_COLUMNS, DEFAULT_MARKUP_PCT, markupPriceExCents, toArticle, type Article, type ArticleRow } from "./articles";

// The markup on purchase prices (Artikelen → Opslag op inkoopprijs).
export async function getArticleMarkup(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("article_settings").select("markup_pct").maybeSingle();
  if (error) throw error;
  return data ? Number(data.markup_pct) : DEFAULT_MARKUP_PCT;
}

// All articles, by category and name (the id keeps the order unique across pages), with the sale
// price that the markup gives articles without one of their own.
export async function listArticles(supabase: SupabaseClient): Promise<Article[]> {
  const markupPct = await getArticleMarkup(supabase);
  const rows = await selectAllPages<ArticleRow>((from, to) =>
    supabase
      .from("articles")
      .select(ARTICLE_COLUMNS)
      .order("category", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .order("diameter_mm", { ascending: true, nullsFirst: true })
      .order("length_mm", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<ArticleRow[], { merge: false }>(),
  );
  return rows.map((row) => ({ ...toArticle(row), markupSalePriceExCents: markupPriceExCents(row.purchase_price_ex_cents, markupPct) }));
}
