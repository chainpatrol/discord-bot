const axios = require("axios");
const { SlashCommandBuilder } = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("reports a scam link to ChainPatrol")
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("The scam link to report")
      .setRequired(true)
  );

module.exports = {
  data: data,
  async execute(interaction) {
    try {
      // submit report
      const url = interaction.options.getString("url");
      const response = await axios.post(
        "https://app.chainpatrol.io/api/v2/report/create",
        {
          discordGuildId: interaction.guildId,
          title: "Discord Report",
          description: `reported by discord user ${interaction.user.username} , Discord ID: ${interaction.user.id}`,
          contactInfo: `discord user ${interaction.user.username} , Discord ID: ${interaction.user.id}`,
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

      const escapedUrl = url.replace(".", "(dot)");

      await interaction.reply(
        `✅ Thanks for submitting a report for ${escapedUrl} ! 

        We've sent this report to the ${response.data.organization.name} team and ChainPatrol to conduct a review. Once approved the report will be sent out to wallets to block. 
        
        Thanks for doing your part in making this space safer 🚀`
      );
    } catch (error) {
      // Handle errors
      console.error("error", error);
      await interaction.reply("Error with submitting report");
    }
  },
};
