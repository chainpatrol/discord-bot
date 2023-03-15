import axios from "axios";
import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("check")
  .setDescription("checks a link to see if it's a scam")
  .addStringOption((option) =>
    option.setName("url").setDescription("The link to check").setRequired(true)
  );

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    const { options } = interaction;
    const url = options.getString("url", true);
    const escapedUrl = url.replace(".", "(dot)");

    // check url
    const response = await axios.post(
      "https://app.chainpatrol.io/api/v2/asset/check",
      {
        type: "URL",
        content: url,
      }
    );

    if (response.data.status === "BLOCKED") {
      await interaction.reply(
        `⚠️ **Warning** ⚠️ \n\nThis link is a scam! \`${escapedUrl}\` \n\nPlease do not click on this link.`
      );
    } else if (response.data.status === "ALLOWED") {
      await interaction.reply(`✅ This link looks safe! \`${escapedUrl}\``);
    } else if (response.data.status === "UNKNOWN") {
      await interaction.reply(
        `⚠️ **Warning** ⚠️ \n\nThis link is not currently in our database. \`${escapedUrl}\` \n\nPlease be careful and do not click on this link unless you are sure it's safe.`
      );
    } else {
      await interaction.reply(
        `❓ We're not sure about this link. \`${escapedUrl}\``
      );
    }
  } catch (error) {
    // Handle errors
    console.error("error", error);
    await interaction.reply("Error with checking link");
  }
}
