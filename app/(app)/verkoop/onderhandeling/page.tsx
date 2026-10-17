import { memberClient } from "../../../../lib/auth";
import { listNotes } from "../../../../lib/stove-note-queries";
import StoveNoteList from "../../../StoveNoteList";

export default async function NegotiationsPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return <StoveNoteList notes={await listNotes(supabase)} />;
}
