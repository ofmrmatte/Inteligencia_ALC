export interface PageResult<T> {
  rows: T[];
  count: number | null;
}

export async function readPaged<T>(fetchPage: (offset: number, pageSize: number) => Promise<PageResult<T>>, pageSize = 1000) {
  const rows: T[] = [];
  let expectedCount: number | null = null;

  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    if (expectedCount === null) expectedCount = page.count;
    rows.push(...page.rows);
    if (page.rows.length < pageSize) break;
  }

  if (expectedCount !== null && rows.length !== expectedCount) {
    throw new Error(`Divergência de paginação: banco informou ${expectedCount} linhas e a API carregou ${rows.length}.`);
  }

  return rows;
}
