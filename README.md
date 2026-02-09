<div align="center">

![SiteWatcher](./.github/pictures/icon.png)

### site-watcher

A Discord bot that alerts you when (part of) a website changes.

[![Node.js CI](https://github.com/alcayaga/djs-site-watcher/actions/workflows/nodejs.yml/badge.svg)](https://github.com/alcayaga/djs-site-watcher/actions/workflows/nodejs.yml) [![Version](https://img.shields.io/github/v/release/alcayaga/djs-site-watcher)](https://github.com/alcayaga/site-watcher/releases) 
[![Licence](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Features

Notify you in Discord when a website changes:   
![site-watcher](./.github/pictures/site-watcher.png)   
   
List of features of the site-watcher bot:
- Add multiple sites to watcher
- Remove site from watcher
- Monitoring specified elements of a site, to not get notified on dynamic elements (ex. ads)
- Checking on a specified interval (1-60 minutes, default `5`).
- Show list of tracked sites
- Monitor Apple Carrier Bundles (`Carrier`)
- Monitor Apple Pay Configurations (`ApplePay`)
- Monitor Apple eSIM Carrier Support (`AppleEsim`)
- Monitor Apple Feature Availability (`AppleFeature`)
- Modular Channel Handlers for specialized channel behavior (Moderation, Q&A)
- Open source!

## Install
### 1. Create a Discord Application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name.
3. Navigate to the **Bot** tab:
   - Reset/Copy the **Bot Token** (you'll need this later).
   - Under the **Privileged Gateway Intents** section, enable the **Message Content Intent**.
4. Navigate to the **OAuth2** tab, then the **URL Generator** sub-menu:
   - **Scopes**: Select `bot` and `applications.commands` from the list.
   - **Bot Permissions**: Once `bot` is selected, a permission list will appear. Select the following:
     - **General Permissions**: `View Channels`.
     - **Text Permissions**: `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Manage Messages`, `Embed Links`, `Attach Files`, `Read Message History`, and `Use Slash Commands`.
   - Copy the generated URL at the bottom and use it to invite the bot to your server.

### 2. Project Setup
1. Make sure you have [git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/en/) (v16.11.0 or higher) installed.
2. Clone the repository:
   ```bash
   git clone https://github.com/alcayaga/djs-site-watcher.git
   cd djs-site-watcher
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### 3. Configuration
1. Create a `.env` file from the `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Fill in the required fields in `.env`:
   - `DISCORDJS_BOT_TOKEN`: Your bot token from step 1.
   - `DISCORDJS_CLIENT_ID`: Found in the "General Information" tab of your application.
   - `DISCORDJS_TEXTCHANNEL_ID`: The ID of the channel where notifications will be sent (Right-click channel -> Copy ID).
3. (Optional) Configure additional channels for Q&A or Deals moderation by adding their IDs to `.env`.

## Usage
### Starting the Bot
1. **Register Slash Commands**: Run this once or whenever commands are updated:
   ```bash
   npm run deploy
   ```
2. **Start the Bot**:
   ```bash
   npm start
   ```

### Using the Bot
Once the bot is online:
1. In Discord, use the `/add` command to start monitoring a website.
2. By default, only users with `Manage Server` permission can use the bot's commands. You can customize this in `Server Settings → Integrations`.
3. Use `/help` to see all available commands.

<sub>**Note**: The default watch interval is 5 minutes. You can change it globally with `/interval` or per-monitor if configured in `config/settings.json`.</sub>

For all other options, see [Commands](#Commands).

## Commands
### `/help`
Show all the available commands.

### `/add`
Adds a website to the list by opening a form.

The form will ask for:
- **URL**: The website address to monitor.
- **CSS Selector** (Optional): Specifies which part of the site to track. By default, the `<head>` is tracked. To avoid false alerts from dynamic content like ads, it's best to provide a specific selector.
- **Force add** (Optional): If you enter `yes`, the site will be added even if the bot cannot currently fetch it (e.g., it returns a 404). This is useful for monitoring sites that are not yet live.

<sub>**Tip:** In Chrome, you can get a selector by right-clicking the part of the site you want to track and selecting `Inspect`. In the developer view, right-click the highlighted element and select `Copy → Copy selector`.</sub>

**Example**   
`/add` This opens the pop-up form.

---

### `/remove`
Removes a website from the list by opening an interactive dropdown menu.

**Example**   
`/remove` This opens a dropdown where you can select the site to remove.

---

### `/list` (Alias: `/show`)
Shows the list of websites being watched. Includes a button to quickly remove sites.

---

### `/interval minutes: <MINUTES>`
Set the interval/refresh rate of the watcher. Default `5` minutes.

**Parameters**   
`minutes`: The interval in minutes (minimum of 1, maximum of 60).

**Example**   
`/interval minutes:10` Sets the interval to 10 minutes.

---

### `/monitor <subcommand> [name]`
Manage the monitors.

**Subcommands**
*   `start`: Start a monitor.
*   `stop`: Stop a monitor.
*   `status`: Show status.
*   `check`: Trigger a manual check.

**Parameters**
`name` (Optional): The name of the monitor (e.g., `Site`, `Carrier`, `AppleEsim`, `ApplePay`, `AppleFeature`). Defaults to `all`. Autocomplete is enabled.

**Example**
`/monitor status` Shows the status of all monitors.
`/monitor check name:Carrier` Triggers a check for the Carrier monitor.

## Channel Handlers
The bot includes a modular system to handle messages in specific channels differently.

### Q&A (`QA`)
Automatically responds to messages matching regex patterns defined in `config/responses.json`.
*   **Trigger**: Configured via `DISCORDJS_APCHANNEL_ID`.
*   **Behavior**: Sends text or image replies based on triggers.

### Deals Moderation (`Deals`)
Enforces a "deals-only" policy in a specific channel.
*   **Trigger**: Configured via `DISCORDJS_DEALS_CHANNEL_ID`.
*   **Behavior**: 
    *   Allows messages containing a link or an image.
    *   Deletes all other messages and sends a private message to the user asking them to use threads for discussion.

## Migration from v2 to v3
Version 3.0.0 introduces Discord Slash Commands.

1.  **Client ID**: You must add `DISCORDJS_CLIENT_ID=` to your `.env` file. Find this in the Discord Developer Portal under "General Information".
2.  **Deploy Commands**: Run `npm run deploy` to register the new slash commands with Discord.
3.  **Command Prefix**: The `!` prefix is removed. Use slash commands (e.g., `/help`) instead.

## Migration from v1
Version 2.0.0 introduces a new configuration structure. 

**Automatic Migration:**
The bot will automatically attempt to move your legacy JSON configuration files from `src/` to the new `config/` directory upon the first run of v2.0.0. It will also patch the internal file paths in `settings.json`.

**Manual Migration (Optional):**
If you prefer to migrate manually:
1. Create a `config/` directory at the project root.
2. Move all `.json` files from `src/` to `config/`.
3. In `config/settings.json`, update any `"file": "./src/..."` entries to `"file": "./config/..."`.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
