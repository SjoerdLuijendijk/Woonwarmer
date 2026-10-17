import { redirect } from "next/navigation";
import { ROUTES } from "../../../lib/navigation";

export default function ManagementPage() {
  redirect(ROUTES.articles);
}
