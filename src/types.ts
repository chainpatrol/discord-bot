import { CommandInteraction } from "discord.js";
import { logger } from "~/utils/logger";

export type CommandContext = {
  interaction: CommandInteraction;
  logger: typeof logger;
};
