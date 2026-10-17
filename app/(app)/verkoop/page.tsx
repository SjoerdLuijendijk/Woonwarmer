import { redirect } from "next/navigation";
import { ROUTES } from "../../../lib/navigation";

export default function SalesPage() {
  redirect(ROUTES.agenda);
}
