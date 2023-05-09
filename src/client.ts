import path from "node:path";
import { Client, ClientOptions, Collection } from "discord.js";
import { readDirectory } from "./utils/file.utils";

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
    const { readPath, filteredFiles } = readDirectory("commands");

    for (const file of filteredFiles) {
      const filePath = path.join(readPath, file);
      const command = require(filePath);

      // Set a new item in the Collection with the key as the command name and the value as the exported module
      if ("data" in command && "execute" in command) {
        this.commands.set(command.data.name, command);
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
        );
      }
    }
  }

  /**
   * Load listeners from the listeners folder
   */
  public loadListeners() {
    const { readPath, filteredFiles } = readDirectory("listeners");

    for (const file of filteredFiles) {
      const filePath = path.join(readPath, file);
      const listener = require(filePath);

      if (listener.default && typeof listener.default === "function") {
        listener.default(this);
      } else {
        console.log(
          `[WARNING] The listener at ${filePath} is missing a default export.`
        );
      }
    }
  }
}
