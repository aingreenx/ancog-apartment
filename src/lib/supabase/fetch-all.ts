import "server-only";

const PAGE = 1000; // PostgREST returns at most max_rows (1000 by default) per request.

/**
 * Fetch every row of a query, page by page, so long histories aren't silently cut at
 * 1000 rows. `page(from, to)` must build the query with `.range(from, to)` and a stable
 * `.order(...)`.
 */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
