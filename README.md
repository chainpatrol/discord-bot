<div align="center">

<img width="860" alt="ChainPatrol + Discord" src="https://user-images.githubusercontent.com/8302959/230222513-7695949e-5d20-46d9-a46b-dde73b605bb4.png">

# ChainPatrol Discord Bot

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

ChainPatrol's Discord Bot is the official bot for Discord admins to
enhance their community protection against scams and phishing attempts in their
servers

[Website](https://chainpatrol.com/bot) | [Documentation](https://chainpatrol.com/docs/general/discord-bot) | [Install](https://chainpatrol.com/bot/install)

</div>

## Features :rocket:

- :white_check_mark: Check URLs against ChainPatrol's blocklist of known
  phishing sites using the `/chainpatrol check` command.
- :police_car: Report scam URLs to ChainPatrol using the `/chainpatrol report`
  command.
- :scroll: View a feed of scam reports for your organization in dedicated Discord channel

### Coming Soon :soon:

- :trophy: Display the ChainPatrol leaderboard of top reporters using the
  `/leaderboard` command.
- :eyes: Regular scans of server messages to detect suspicious activity.
- :triangular_flag_on_post: Automatic notifications of potential scams to keep
  users informed and safe

## Moderation delete webhook

The moderation service can call this bot to delete a Discord message when a
moderation action (for example `action.delete`) is executed for an entity that
was submitted from Discord.

- **Endpoint:** `POST /webhooks/moderation/delete` on the same port as the health
  server (`PORT`, default `3232`).
- **Auth:** HMAC-SHA256 headers `webhook-id`, `webhook-timestamp`,
  `webhook-signature` (same scheme as moderation outbound webhooks). The signing
  secret must match the env var **`MODERATION_WEBHOOK_SECRET`** (use the same
  value as the `secret` on the moderation action config that targets this URL).
- **Payload:** JSON body with `type` `action.delete` or `action.delete.test`,
  `timestamp`, and `data` containing `entityId`, `authorId`, and `executionId`
  (as sent by moderation). Test deliveries set `X-Test-Delivery: true` or use
  `entityId` `test-entity-id`; the bot responds `200` without calling Discord.
- **Entity ID:** Discord messages must use
  `guildId:channelId:messageId` (three colon-separated snowflakes). The bot sends
  this format when submitting text for moderation.

After deploy, configure the moderation project’s delete action webhook URL and
secret, then validate with a test delivery. Track operational setup in Linear
[ENG-5463](https://linear.app/chainpatrol/issue/ENG-5463/ops-configure-moderation-delete-action-for-discord-bot-webhook).

## Contributing :raised_hands:

We welcome contributions from anyone interested in enhancing the security of the
web3 community. If you would like to contribute to the project, please feel free
to read through our issues and submit a pull request.

---

©️ MIT 2025 ChainPatrol
