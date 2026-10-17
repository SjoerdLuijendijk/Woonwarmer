import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

// Verifies the session with Supabase Auth and checks the team allowlist.
// Returns a client bound to the user; RLS enforces the same rule in the database.
// Cached per request, so the layout and the page check only once.
export const requireTeamMember = cache(async () => {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: isMember, error } = await supabase.rpc("is_team_member");
  if (error) throw error;

  return { supabase, user: userData.user, isMember: isMember === true };
});

// For pages inside the app layout: the layout tells non-members they have no access, and the page
// then renders nothing, so it never queries data it may not read.
export async function memberClient() {
  const { supabase, isMember } = await requireTeamMember();
  return isMember ? supabase : null;
}
