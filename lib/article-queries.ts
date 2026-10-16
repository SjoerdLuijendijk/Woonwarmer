import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "./all-pages";
import { ARTICLE_COLUMNS, toArticle, type Article, type ArticleRow } from "./articles";

// All articles, by category and name (the id keeps the order unique across pages).
export async function listArticles(supabase: SupabaseClient): Promise<Article[]> {
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
  return rows.map(toArticle);
}
