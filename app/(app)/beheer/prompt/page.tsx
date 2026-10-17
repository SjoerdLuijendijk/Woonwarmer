import { DEFAULT_AD_PROMPT } from "../../../../lib/ad-prompt";
import { memberClient } from "../../../../lib/auth";
import { getAdPrompt } from "../../../../lib/marketplace-ad-store";
import AdPromptForm from "../../../AdPromptForm";
import SettingsPanel from "../../../SettingsPanel";

export default async function AdPromptPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return (
    <SettingsPanel title="Prompt instellen">
      <AdPromptForm prompt={(await getAdPrompt(supabase)) ?? DEFAULT_AD_PROMPT} />
    </SettingsPanel>
  );
}
