import { WooCommerceError, wooRequest, type getWooCommerceConfig } from "./client";

// Server-only. Resolves the shop's global attributes, their terms and product categories.

type Config = NonNullable<ReturnType<typeof getWooCommerceConfig>>;
type Attribute = { id: number; slug: string };
type Term = { id: number; name: string; slug: string };
type Category = { id: number; slug: string };

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

// WordPress returns term names HTML-encoded, e.g. "Speksteen &amp; hout".
function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Close to WordPress's sanitize_title: "Jøtul" and "Jotul" share the slug "jotul".
function slugify(name: string) {
  return decodeEntities(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/gi, "o")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

// "6,5 kw", "6.5kW" and "6,5 kW" are the same term; so are "BK" and "Bk".
function normalise(name: string) {
  return decodeEntities(name).toLowerCase().replace(/\s+/g, "").replace(",", ".");
}

async function listAll<T>(config: Config, path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await wooRequest<T[]>(config, "GET", `${path}${separator}per_page=${PAGE_SIZE}&page=${page}`);
    items.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return items;
}

/** Looks up shop attributes and categories once per sync. */
export class ShopTaxonomy {
  private attributes: Promise<Attribute[]> | null = null;
  private terms = new Map<number, Promise<Term[]>>();

  constructor(private readonly config: Config) {}

  // Id of a global attribute such as "pa_merk"; null when the shop does not have it.
  async attributeId(slug: string): Promise<number | null> {
    this.attributes ??= wooRequest<Attribute[]>(this.config, "GET", "/products/attributes");
    return (await this.attributes).find((attribute) => attribute.slug === slug)?.id ?? null;
  }

  // The shop's spelling of a term, created when the shop does not have it yet.
  async termName(attributeId: number, name: string): Promise<string> {
    if (!this.terms.has(attributeId)) this.terms.set(attributeId, listAll<Term>(this.config, `/products/attributes/${attributeId}/terms`));
    const terms = await this.terms.get(attributeId)!;
    const existing = terms.find((term) => normalise(term.name) === normalise(name));
    if (existing) return existing.name;

    try {
      const created = await wooRequest<Term>(this.config, "POST", `/products/attributes/${attributeId}/terms`, { name });
      terms.push(created);
      return created.name;
    } catch (error) {
      // WordPress also counts a term as existing when only its slug matches (accents, punctuation).
      if (!(error instanceof WooCommerceError && error.code === "term_exists")) throw error;
      // Listed again: another sync may have created it after the terms were fetched.
      const matches = await listAll<Term>(this.config, `/products/attributes/${attributeId}/terms`);
      const match = matches.find((term) => normalise(term.name) === normalise(name)) ?? matches.find((term) => term.slug === slugify(name));
      if (!match) throw error;
      terms.push(match);
      return match.name;
    }
  }

  // Id of a product category by slug; null when the shop does not have it.
  async categoryId(slug: string): Promise<number | null> {
    const categories = await wooRequest<Category[]>(this.config, "GET", `/products/categories?slug=${encodeURIComponent(slug)}`);
    return categories[0]?.id ?? null;
  }
}
