import { createHmac, timingSafeEqual } from "crypto";

const WEBHOOK_SECRET_PREFIX = "whsec_";
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function parseWebhookSecret(secret: string): Buffer {
  if (secret.startsWith(WEBHOOK_SECRET_PREFIX)) {
    return Buffer.from(secret.slice(WEBHOOK_SECRET_PREFIX.length), "base64");
  }
  return Buffer.from(secret, "base64");
}

function signWebhook(
  msgId: string,
  timestamp: number,
  payload: string,
  secret: string,
): string {
  const secretKey = parseWebhookSecret(secret);
  const toSign = `${msgId}.${timestamp}.${payload}`;
  const signature = createHmac("sha256", secretKey).update(toSign).digest("base64");
  return `v1,${signature}`;
}

export function verifyWebhookSignature(
  payload: string,
  headers: {
    "webhook-id": string;
    "webhook-timestamp": string;
    "webhook-signature": string;
  },
  secret: string,
): boolean {
  const msgId = headers["webhook-id"];
  const timestamp = parseInt(headers["webhook-timestamp"], 10);
  const signatures = headers["webhook-signature"].split(" ");

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const expectedSignature = signWebhook(msgId, timestamp, payload, secret);

  return signatures.some((sig) => {
    if (!sig.startsWith("v1,")) return false;
    const sigBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  });
}
