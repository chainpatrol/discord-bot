import { Client, ClientOptions, Collection } from "discord.js";

export class CustomClient extends Client {
  commands: Collection<string, { data: any; execute: any }>;

  constructor(options: ClientOptions) {
    super(options);
    this.commands = new Collection();
  }
}
