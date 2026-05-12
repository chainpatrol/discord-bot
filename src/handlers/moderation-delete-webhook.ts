import * as Sentry from "@sentry/node";
import { DiscordAPIError } from "discord.js";
import type { IncomingMessage, ServerResponse } from "http";
import type { Logger } from "pino";
import { z } from "zod";

import type { CustomClient } from "~/client";
import { env } from "~/env";
import { verifyWebhookSignature } from "~/utils/verify-webhook";

const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;
const MISSING_ACCESS = 50001;
const MISSING_PERMISSIONS = 50013;

const payloadSchema = z.object({
  type: z.string(),
  timestamp: z.string(),
  data: z.object({
    entityId: z.string(),
    authorId: z.string().nullable(),
    executionId: z.number().int(),
  }),
});

function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handleModerationDeleteWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  client: CustomClient,
  logger: Logger,
) {
  let rawBody: string;
  try {
    const rawBodyBuffer = await readRequestBody(req);
    rawBody = rawBodyBuffer.toString("utf8");
  } catch (error) {
    logger.error({ error }, "Failed to read moderation delete webhook body");
    Sentry.captureException(error);
    sendJson(res, 400, { error: "read_body_failed" });
    return;
  }

  const webhookId = getHeader(req, "webhook-id");
  const webhookTimestamp = getHeader(req, "webhook-timestamp");
  const webhookSignature = getHeader(req, "webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    sendJson(res, 400, { error: "missing_webhook_headers" });
    return;
  }

  const signatureOk = verifyWebhookSignature(
    rawBody,
    {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": webhookSignature,
    },
    env.MODERATION_WEBHOOK_SECRET,
  );

  if (!signatureOk) {
    sendJson(res, 401, { error: "invalid_webhook_signature" });
    return;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody) as unknown;
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const parsed = payloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_payload" });
    return;
  }

  const { type, data } = parsed.data;
  if (type !== "action.delete" && type !== "action.delete.test") {
    sendJson(res, 400, { error: "unsupported_event_type" });
    return;
  }

  const testDeliveryHeader = getHeader(req, "x-test-delivery");
  const isTestDelivery =
    testDeliveryHeader === "true" || data.entityId === "test-entity-id";

  if (isTestDelivery) {
    logger.info(
      {
        moderation: {
          event: "moderation_delete_webhook_test_delivery",
          executionId: data.executionId,
          authorId: data.authorId,
          entityId: data.entityId,
          type,
        },
      },
      "Moderation delete webhook test delivery received",
    );
    sendJson(res, 200, { ok: true, test: true });
    return;
  }

  const parts = data.entityId.split(":");
  if (parts.length !== 3) {
    sendJson(res, 400, { error: "unsupported_entity_id_format" });
    return;
  }

  const [guildId, channelId, messageId] = parts;
  if (!guildId || !channelId || !messageId) {
    sendJson(res, 400, { error: "unsupported_entity_id_format" });
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      sendJson(res, 400, { error: "invalid_or_unsupported_channel" });
      return;
    }

    const message = await channel.messages.fetch(messageId);
    if (message.guildId !== guildId) {
      sendJson(res, 403, { error: "entity_guild_mismatch" });
      return;
    }
    await message.delete();

    logger.info(
      {
        moderation: {
          event: "discord_message_deleted_via_webhook",
          guildId,
          channelId,
          messageId,
          executionId: data.executionId,
          authorId: data.authorId,
        },
      },
      "Deleted Discord message from moderation webhook",
    );
    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof DiscordAPIError) {
      if (error.code === UNKNOWN_CHANNEL) {
        sendJson(res, 400, { error: "unknown_channel" });
        return;
      }
      if (error.code === UNKNOWN_MESSAGE) {
        logger.info(
          {
            moderation: {
              event: "discord_message_delete_already_deleted",
              guildId,
              channelId,
              messageId,
              executionId: data.executionId,
              authorId: data.authorId,
            },
          },
          "Discord message already deleted or missing",
        );
        sendJson(res, 200, { ok: true, alreadyDeleted: true });
        return;
      }
      if (error.code === MISSING_ACCESS || error.code === MISSING_PERMISSIONS) {
        logger.warn(
          {
            moderation: {
              event: "discord_message_delete_forbidden",
              guildId,
              channelId,
              messageId,
              executionId: data.executionId,
              authorId: data.authorId,
              discordCode: error.code,
            },
            error,
          },
          "Discord API forbade message delete",
        );
        sendJson(res, 403, { error: "discord_forbidden" });
        return;
      }
    }

    logger.error(
      {
        moderation: {
          event: "discord_message_delete_webhook_error",
          guildId,
          channelId,
          messageId,
          executionId: data.executionId,
          authorId: data.authorId,
        },
        error,
      },
      "Unexpected error deleting Discord message from moderation webhook",
    );
    Sentry.captureException(error);
    sendJson(res, 500, { error: "internal_error" });
  }
}
