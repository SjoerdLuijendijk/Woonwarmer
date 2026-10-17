import { memberClient } from "../../../lib/auth";
import { getKnownBrands } from "../../../lib/stove-queries";
import AddStoveForm from "../../AddStoveForm";

export default async function AddStovePage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return (
    <div className="page-narrow">
      <AddStoveForm brands={await getKnownBrands(supabase)} />
    </div>
  );
}
