import type { Client } from "pg";
export function migrate(client: Pick<Client, "query">, directory?: URL): Promise<string[]>;
