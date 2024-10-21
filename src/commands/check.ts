import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { inspectDisputeButtons } from "~/helpers/buttons";
import { chainpatrol } from "~/utils/api";
import { logger } from "~/utils/logger";
import { defangUrl } from "~/utils/url";

export const data = new SlashCommandBuilder()
  .setName("check")
  .setDescription("checks a link to see if it's a scam")
  .addStringOption((option) =>
    option.setName("url").setDescription("The link to check").setRequired(true),
  );

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const { options } = interaction;
    const url = options.getString("url", true);
    const escapedUrl = defangUrl(url);

    const response = await chainpatrol.asset.check({ content: url });

    if (response.status === "BLOCKED") {
      await interaction.editReply({
        content: `🚨 Alert 🚨 \n\nThis link is a scam! \`${escapedUrl}\` \n\nPlease DO NOT click on this link.`,
        components: [inspectDisputeButtons(url)],
      });
    } else if (response.status === "ALLOWED") {
      await interaction.editReply({
        content: `✅ This link looks safe! \`${escapedUrl}\``,
        components: [inspectDisputeButtons(url)],
      });
    } else if (response.status === "UNKNOWN") {
      await interaction.editReply({
        content: `⚠️ Warning ⚠️ \n\nThis link is not currently in our blocklist or allowlist: \`${escapedUrl}\` \n\nPlease be careful and DO NOT click on this link unless you are sure it's safe.`,
      });
    } else {
      await interaction.editReply({
        content: `❓ We're not sure about this link. \`${escapedUrl}\``,
      });
    }
  } catch (error) {
    // Handle errors
    logger.error("error", error);

    await interaction.editReply({
      content: "Error with checking link",
    });
  }
}
