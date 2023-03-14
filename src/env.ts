import { z } from "zod";

require("dotenv").config();

const envSchema = z.object({
  DISCORD_APPLICATION_ID: z.string(),
  DISCORD_BOT_SECRET: z.string(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Error parsing environment variables", result.error);
  process.exit(1);
}

export const env = result.data;
