import { memberClient } from "../../../../lib/auth";
import { getStoves } from "../../../../lib/stove-queries";
import StoveTable from "../../../StoveTable";

export default async function SoldArchivePage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return <StoveTable stoves={await getStoves(supabase)} view="sold" />;
}
