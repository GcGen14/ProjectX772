// Small HTTP helpers shared by the API route files.
import type { IncomingMessage } from "node:http";

export type Req = IncomingMessage & { body?: unknown };

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function readJson(req: Req): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, "ข้อมูลยาวเกินไป");
  }
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "ข้อมูลไม่ถูกต้อง");
  }
}
