import * as Sentry from "@sentry/node";
import { GatewayIntentBits } from "discord.js";
import http from "http";

import { CustomClient } from "~/client";
import { env } from "~/env";
import { handleModerationDeleteWebhook } from "~/handlers/moderation-delete-webhook";

import { logger } from "./utils/logger";

if (env.SENTRY_SECRET) {
  Sentry.init({
    dsn: env.SENTRY_SECRET,
    tracesSampleRate: 0.01,
  });
}

// Create a new client instance
const client = new CustomClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

process.on(
  "unhandledRejection",
  (reason: {} | null | undefined, promise: Promise<any>) => {
    logger.fatal("Unhandled Rejection at:", promise, "reason:", reason);
    Sentry.captureException(reason);
  },
);

process.on("uncaughtException", (err, origin) => {
  logger.fatal("Fatal error at:", origin, "reason:", err);
  Sentry.captureException(err);
  process.exit(1); // We don't want to continue the process if this error occurs
});

// Load commands and listeners
client.loadCommands();
client.loadListeners();

const healthCheckServer = http.createServer((req, res) => {
  const pathname = (req.url ?? "").split("?")[0] ?? "";

  if (pathname === "/health" && req.method === "GET") {
    const isReady = client.isReady();
    res.writeHead(isReady ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: isReady ? "ok" : "not ready",
        uptime: process.uptime(),
      }),
    );
    return;
  }

  if (pathname === "/webhooks/moderation/delete" && req.method === "POST") {
    void handleModerationDeleteWebhook(req, res, client, logger).catch((error) => {
      logger.error({ error }, "Unhandled error in moderation delete webhook");
      Sentry.captureException(error);
      if (!res.writableEnded) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "internal_error" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

healthCheckServer.listen(env.PORT, () => {
  console.log(`Healthcheck server running on http://localhost:${env.PORT}/health`);
});

// Log in to Discord with your client's token
client.login(env.DISCORD_BOT_SECRET);
