type SupabasePageResult = {
  data: unknown[] | null;
  error: unknown;
};

export async function fetchAllSupabaseRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<SupabasePageResult>,
  pageSize = 1000,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const result = await buildQuery(from, to);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...(page as T[]));
    if (page.length < pageSize) break;
  }
  return rows;
}
