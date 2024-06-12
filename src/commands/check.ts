import { SlashCommandBuilder } from "discord.js";
import { chainpatrol } from "~/utils/api";
import { defangUrl } from "~/utils/url";
import { CommandContext } from "../types";

export const data = new SlashCommandBuilder()
  .setName("check")
  .setDescription("checks a link to see if it's a scam")
  .addStringOption((option) =>
    option.setName("url").setDescription("The link to check").setRequired(true)
  );

export async function execute({ interaction, logger }: CommandContext) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  logger.info({ user: interaction.user }, "Running check command");

  try {
    const { options } = interaction;
    const url = options.getString("url", true);
    const escapedUrl = defangUrl(url);

    logger.info({ url, escapedUrl }, "Checking URL using Chainpatrol API");

    const response = await chainpatrol.asset.check({ content: url });

    logger.info({ url, response }, "Got response from Chainpatrol API");

    if (response.status === "BLOCKED") {
      await interaction.editReply({
        content: `🚨 **Alert** 🚨 \n\nThis link is a scam! \`${escapedUrl}\` \n\n_Please **DO NOT** click on this link._`,
      });
    } else if (response.status === "ALLOWED") {
      await interaction.editReply({
        content: `✅ This link looks safe! \`${escapedUrl}\``,
      });
    } else if (response.status === "UNKNOWN") {
      await interaction.editReply({
        content: `⚠️ **Warning** ⚠️ \n\nThis link is not currently in our database: \`${escapedUrl}\` \n\n_Please be careful and **DO NOT** click on this link unless you are sure it's safe._`,
      });
    } else {
      await interaction.editReply({
        content: `❓ We're not sure about this link. \`${escapedUrl}\``,
      });
    }
  } catch (error) {
    // Handle errors
    logger.error(error);

    await interaction.editReply({
      content: "Error with checking link. Please try again later.",
    });
  }
}
