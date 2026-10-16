// Supabase returns at most 1,000 rows per request (the API's max-rows setting), whatever limit the
// query asks for. This reads a query page by page until a page comes back short. The query must
// have a unique order, or rows can repeat or go missing between pages.
const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function selectAllPages<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
