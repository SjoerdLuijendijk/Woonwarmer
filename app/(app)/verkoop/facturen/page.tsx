import { memberClient } from "../../../../lib/auth";
import { listInvoices } from "../../../../lib/invoice-queries";
import InvoiceDialog from "../../../InvoiceDialog";
import InvoiceList from "../../../InvoiceList";

// The invoices are a wide table, laid out like the stock page.
export default async function InvoicesPage() {
  const supabase = await memberClient();
  if (!supabase) return null;
  return (
    <section aria-labelledby="invoices-title">
      <div className="stock-toolbar">
        <div className="stock-title-row">
          <h1 id="invoices-title">Facturen</h1>
          <InvoiceDialog stove={null} />
        </div>
      </div>
      <InvoiceList invoices={await listInvoices(supabase)} />
    </section>
  );
}
