import Link from "next/link";
import { requireTeamMember } from "../../lib/auth";
import { ROUTES } from "../../lib/navigation";
import { countOpenNotes } from "../../lib/stove-note-queries";
import AccountMenu from "../AccountMenu";
import BrandLogo from "../BrandLogo";
import MainNav from "../MainNav";
import SubNav from "../SubNav";

export const dynamic = "force-dynamic";

// The signed-in app: the header with the main menu, the bar with the pages of the current group,
// and the page. Visitors not on the team list only see that they have no access.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, isMember } = await requireTeamMember();
  const notes = isMember ? await countOpenNotes(supabase) : null;
  const counts = notes ? { today: notes.today, toDeliver: notes.toDeliver, negotiating: notes.open - notes.toDeliver } : null;

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href={ROUTES.home} className="brand-link">
          <BrandLogo />
        </Link>
        {counts && <MainNav counts={counts} />}
        <div className="header-actions">
          {isMember && (
            <Link href={ROUTES.addStove} className="primary-button header-add">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Kachel toevoegen</span>
            </Link>
          )}
          <AccountMenu email={user.email} />
        </div>
      </header>
      {counts && <SubNav counts={counts} />}

      <main className="page-main page-main--wide">
        {isMember ? (
          children
        ) : (
          <div className="notice" role="alert">
            <strong>Geen toegang</strong>
            <p>Je account staat (nog) niet op de teamlijst. Vraag de beheerder om je toe te voegen.</p>
          </div>
        )}
      </main>
    </div>
  );
}
