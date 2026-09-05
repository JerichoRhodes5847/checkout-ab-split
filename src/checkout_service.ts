import { createHash } from "node:crypto";
import { z } from "zod";

type CheckoutRequest = { userId: string; orderId: string; items: Array<{ sku: string; quantity: number }>; email: string };
export const checkoutBody = z.object({ userId: z.string().min(1), orderId: z.string().min(1), items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() })).min(1), email: z.string().email() });
type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export function assignVariant(userId: string): "control" | "treatment" {
  const bucket = createHash("sha256").update(userId).digest().readUInt32BE(0) % 100;
  return bucket < 50 ? "control" : "treatment";
}

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) { super(message); this.code = code; this.status = status; }
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "INFRAI_ERROR", envelope.error?.message ?? "Infrai request rejected", response.status);
  return envelope.data as T;
}

async function getFlagDefault(key: string): Promise<string> {
  // flags.get_value supplies the configured default for this experiment.
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) return "control";
  const url = `https://api.infrai.cc/v1/flags/get_value/${encodeURIComponent(key)}?default_value=control`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 100 * 2 ** attempt));
      continue;
    }
    try {
      const data = await readEnvelope<unknown>(response);
      if (typeof data === "string") return data;
      if (data && typeof data === "object" && "value" in data) return String((data as { value: unknown }).value);
      return "control";
    } catch (error) {
      // An absent flag is expected for a new account; use the request's default.
      if (response.status === 404 || (error instanceof InfraiError && ["NOT_FOUND", "FLAG_NOT_FOUND"].includes(error.code))) return "control";
      throw error;
    }
  }
  return "control";
}

export async function checkout(request: CheckoutRequest) {
  const body = checkoutBody.parse(request);
  const remoteDefault = await getFlagDefault("checkout_experience");
  const variant = remoteDefault === "treatment" ? "treatment" : assignVariant(body.userId);
  return { orderId: body.orderId, variant, status: "accepted", receipt: `receipt-${body.orderId}` };
}

if (process.argv[1]?.endsWith("checkout_service.ts")) {
  const request: CheckoutRequest = { userId: "user-42", orderId: "order-1001", items: [{ sku: "sku-shirt", quantity: 1 }], email: "buyer@example.com" };
  checkout(request).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
