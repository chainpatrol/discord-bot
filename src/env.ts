import { z } from "zod";

require("dotenv").config();

const envSchema = z.object({
  DISCORD_APPLICATION_ID: z.string(),
  DISCORD_BOT_SECRET: z.string(),
  CHAINPATROL_API_URL: z.string().url(),
  CHAINPATROL_API_KEY: z.string(),
  TEST_DISCORD_SERVER_ID: z.string().optional(),
  DISCORD_DEPLOY_GLOBAL: z.coerce.boolean().optional().default(false),
  SENTRY_SECRET: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(result.error);
  throw new Error("Error parsing environment variables");
}

export const env = result.data;
