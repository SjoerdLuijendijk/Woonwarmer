// The frame of a settings page under Beheer: a narrow panel with the page title.
export default function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page-narrow">
      <section className="panel" aria-labelledby="settings-title">
        <h1 id="settings-title">{title}</h1>
        {children}
      </section>
    </div>
  );
}
