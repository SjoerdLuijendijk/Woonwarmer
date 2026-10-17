import { memberClient } from "../../../../lib/auth";
import CatalogImport from "../../../CatalogImport";
import SettingsPanel from "../../../SettingsPanel";
import ShopInvoiceImport from "../../../ShopInvoiceImport";
import ShopResync from "../../../ShopResync";

export default async function CatalogPage() {
  if (!(await memberClient())) return null;
  return (
    <SettingsPanel title="Catalogus importeren">
      <CatalogImport />
      <ShopResync />
      <ShopInvoiceImport />
    </SettingsPanel>
  );
}
