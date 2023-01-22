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
        "https://app.chainpatrol.io/api/v2/report",
        {
          discordGuildId: interaction.guild.id,
          title: "Discord Report",
          description: `reported by user ${interaction.user.id}`,
          assets: [
            {
              content: url,
              status: "BLOCKED",
              type: "URL",
            },
          ],
        }
      );

      await interaction.reply(`Report sent, ID: ${response.data.id}`);
    } catch (error) {
      // Handle errors
      console.error("error", error);
      await interaction.reply("Error with submitting report");
    }
  },
};
