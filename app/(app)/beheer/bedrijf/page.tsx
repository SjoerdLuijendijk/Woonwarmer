import { memberClient } from "../../../../lib/auth";
import { getCompany } from "../../../../lib/invoice-queries";
import CompanySettingsForm from "../../../CompanySettingsForm";
import SettingsPanel from "../../../SettingsPanel";

export default async function CompanyPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return (
    <SettingsPanel title="Bedrijfsgegevens">
      <CompanySettingsForm company={await getCompany(supabase)} />
    </SettingsPanel>
  );
}
