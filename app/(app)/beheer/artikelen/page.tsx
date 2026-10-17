import { getArticleMarkup, listArticles } from "../../../../lib/article-queries";
import { memberClient } from "../../../../lib/auth";
import ArticleList from "../../../ArticleList";

export default async function ArticlesPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  const [articles, markupPct] = await Promise.all([listArticles(supabase), getArticleMarkup(supabase)]);
  return <ArticleList articles={articles} markupPct={markupPct} />;
}
