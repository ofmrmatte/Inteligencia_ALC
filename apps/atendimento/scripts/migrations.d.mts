import type { Client } from "pg";
export function migrate(client: Client, directory?: URL): Promise<string[]>;
