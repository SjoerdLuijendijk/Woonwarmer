// A small article photo in lists; an empty square keeps the names lined up when there is none.
export default function ArticleThumb({ url }: { url: string | null }) {
  if (!url) return <span className="article-thumb" aria-hidden="true" />;
  return <img className="article-thumb" src={url} alt="" width={36} height={36} loading="lazy" decoding="async" />;
}
