import { Client, ClientOptions, Collection } from "discord.js";

import { readDirectory } from "~/utils/file";

import { logger } from "./utils/logger";

export class CustomClient extends Client {
  commands: Collection<string, { data: any; execute: any }>;

  constructor(options: ClientOptions) {
    super(options);
    this.commands = new Collection();
  }

  /**
   * Load commands from the commands folder
   */
  public loadCommands() {
    const { filteredFiles } = readDirectory("./src/commands");

    for (const filePath of filteredFiles) {
      const command = require(filePath);

      if ("data" in command && "execute" in command) {
        this.commands.set(command.data.name, command);
      }

      if ("userContextMenuData" in command && "execute" in command) {
        this.commands.set(command.userContextMenuData.name, command);
      }

      if ("messageContextMenuData" in command && "execute" in command) {
        this.commands.set(command.messageContextMenuData.name, command);
      }

      if (
        !("data" in command) &&
        !("userContextMenuData" in command) &&
        !("messageContextMenuData" in command)
      ) {
        logger.warn(
          `[WARNING] The command at ${filePath} is missing a required "data", "userContextMenuData", "messageContextMenuData", or "execute" property.`,
        );
      }
    }
  }

  /**
   * Load listeners from the listeners folder
   */
  public loadListeners() {
    const { filteredFiles } = readDirectory("./src/listeners");

    for (const filePath of filteredFiles) {
      const listener = require(filePath);

      if (listener.default && typeof listener.default === "function") {
        listener.default(this);
      } else {
        logger.warn(`[WARNING] The listener at ${filePath} is missing a default export.`);
      }
    }
  }
}
