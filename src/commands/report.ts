import axios from "axios";
import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("reports a scam link to ChainPatrol")
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("The scam link to report")
      .setRequired(true)
  );

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    const { guildId, user, options } = interaction;
    const url = options.getString("url", true);
    const escapedUrl = url.replace(".", "(dot)");

    // submit report
    const response = await axios.post(
      "https://app.chainpatrol.io/api/v2/report/create",
      {
        discordGuildId: guildId,
        title: "Discord Report",
        description: `reported by discord user ${user.username} , Discord ID: ${user.id}`,
        contactInfo: `discord user ${user.username} , Discord ID: ${user.id}`,
        assets: [
          {
            content: url,
            status: "BLOCKED",
            type: "URL",
          },
        ],
        attachmentUrls: [],
      }
    );

    await interaction.reply(
      `✅ Thanks for submitting a report for \`${escapedUrl}\` ! \n\nWe've sent this report to the **${response.data.organization.name}** team and **ChainPatrol** to conduct a review. Once approved the report will be sent out to wallets to block.\n\nThanks for doing your part in making this space safer 🚀`
    );
  } catch (error) {
    // Handle errors
    console.error("error", error);
    await interaction.reply("Error with submitting report");
  }
}
