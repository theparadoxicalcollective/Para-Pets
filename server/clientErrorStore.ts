export type ClientErrorType = "crash" | "unhandled" | "error";

export interface ClientErrorEntry {
  id: number;
  type: ClientErrorType;
  msg: string;
  source: string;
  url: string;
  ua: string;
  ts: string;
  userId?: string;
}

export const CLIENT_ERROR_LIMIT = 100;

let sequence = 0;
const entries: ClientErrorEntry[] = [];

export function pushClientError(entry: Omit<ClientErrorEntry, "id" | "ts">): void {
  sequence++;
  entries.unshift({ ...entry, id: sequence, ts: new Date().toISOString() });
  if (entries.length > CLIENT_ERROR_LIMIT) entries.pop();
}

export function getClientErrors(): ClientErrorEntry[] {
  return entries;
}

export function getClientErrorCount(): number {
  return entries.length;
}

export function clearClientErrors(): void {
  entries.length = 0;
  sequence = 0;
}
