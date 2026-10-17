import { getArticleMarkup } from "../../../../lib/article-queries";
import { memberClient } from "../../../../lib/auth";
import ArticleMarkupForm from "../../../ArticleMarkupForm";
import SettingsPanel from "../../../SettingsPanel";

export default async function MarkupPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return (
    <SettingsPanel title="Opslag losse artikelen">
      <ArticleMarkupForm markupPct={await getArticleMarkup(supabase)} />
    </SettingsPanel>
  );
}
