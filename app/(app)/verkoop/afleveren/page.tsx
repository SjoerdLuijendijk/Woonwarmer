import { memberClient } from "../../../../lib/auth";
import { listNotes } from "../../../../lib/stove-note-queries";
import DeliveryList from "../../../DeliveryList";

export default async function DeliveryPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return (
    <section aria-labelledby="delivery-title">
      <div className="stock-toolbar">
        <div className="stock-title-row">
          <h1 id="delivery-title">Af te leveren</h1>
        </div>
      </div>
      <DeliveryList notes={await listNotes(supabase)} />
    </section>
  );
}
