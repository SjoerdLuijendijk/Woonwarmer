import { memberClient } from "../../../../lib/auth";
import { listNotes } from "../../../../lib/stove-note-queries";
import AgendaList from "../../../AgendaList";

export default async function AgendaPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return (
    <section aria-labelledby="agenda-title">
      <div className="stock-toolbar">
        <div className="stock-title-row">
          <h1 id="agenda-title">Agenda</h1>
        </div>
      </div>
      <AgendaList notes={await listNotes(supabase)} />
    </section>
  );
}
