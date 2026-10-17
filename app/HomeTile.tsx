import Link from "next/link";

type HomeTileProps = {
  href: string;
  label: string;
  value: React.ReactNode;
  detail?: string;
  /** Draws attention to a tile that asks for action, such as stoves still to deliver. */
  highlight?: boolean;
};

// A figure on the home page that opens the page behind it.
export default function HomeTile({ href, label, value, detail, highlight = false }: HomeTileProps) {
  return (
    <Link href={href} className={highlight ? "home-tile home-tile--highlight" : "home-tile"}>
      <span className="home-tile-label">{label}</span>
      <span className="home-tile-value">{value}</span>
      {detail && <span className="home-tile-detail">{detail}</span>}
    </Link>
  );
}
