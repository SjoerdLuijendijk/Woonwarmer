import { memberClient } from "../../../../lib/auth";
import { listQuotes } from "../../../../lib/quote-queries";
import QuoteList from "../../../QuoteList";

export default async function QuotesPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return <QuoteList quotes={await listQuotes(supabase)} />;
}
