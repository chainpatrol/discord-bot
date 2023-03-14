import fs from "node:fs";
import path from "node:path";
import { Client, ClientOptions, Collection } from "discord.js";

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
    const commandsPath = path.join(__dirname, "commands");

    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".ts"));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
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
    const listenersPath = path.join(__dirname, "listeners");

    const listenerFiles = fs
      .readdirSync(listenersPath)
      .filter((file) => file.endsWith(".ts"));

    for (const file of listenerFiles) {
      const filePath = path.join(listenersPath, file);
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
