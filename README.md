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
- Open source!

## Install
Downloading the project:

1. Create a new discord bot on [discord.com/developers/applications](https://discord.com/developers/applications). A tutorial can be found [here](https://discordpy.readthedocs.io/en/latest/discord.html).   
2. Make sure you have [git](https://git-scm.com/downloads) and [nodejs](https://nodejs.org/en/) installed.
3. Clone the repository.
4. Open `cmd.bat` in the repository folder.
5. Type `npm install` and press `enter`.

Configuring the bot:

1. Create a `.env` file from the `.env.example`.
2. Add your discord bot token after `DISCORDJS_BOT_TOKEN=`. You can get this token from [discord.com/developers/applications](https://discord.com/developers/applications).
3. Add your application (client) ID after `DISCORDJS_CLIENT_ID=`. This is found in the "General Information" tab of your application.
4. Add the channel ID from the channel you want the update notifications in after `DISCORDJS_TEXTCHANNEL_ID=`. You can get this ID by right clicking the channel in discord and selecting `Copy ID`.  Make sure `Developer Mode` is on by going to `Settings → Appearance → Advanced → Developer Mode → ON`. Make sure the bot has permission to post in this channel.
5. Add the channel ID from the channel you want the admin commands to be used in after `DISCORDJS_ADMINCHANNEL_ID=`.
6. Add the role ID that is allowed to use the admin commands after `DISCORDJS_ROLE_ID=`.
7. (Optional) Configure `AP_RESPONSE_DELAY=` (milliseconds) for auto-responses (default: 5000).


For starting and using the bot, see [Usage](#Usage).

## Usage
The simplest method to monitor a site:
1. Invite the bot to your Discord server using the OAuth2 URL generator in the Developer Portal (Scope: `bot`, `applications.commands`; Permissions: `Administrator` or specific permissions).
2. Open the command line in the cloned repository folder.
3. Register the slash commands by running `npm run deploy`. You only need to do this once or when commands change.
4. Start the bot by typing `npm start`.
5. In Discord (the bot should now be online), add a website with the `/add` command in the configured admin channel.
6. Done! The added site is now being monitored.
<sub>By default, the watch interval for every website is 5 minutes, but you can easily change this with the `/interval` command followed by the interval in minutes.</sub>

For all other options, see [Commands](#Commands).

## Commands
### `/help`
Show all the available commands.

### `/add url: <URL> [selector: <CSS SELECTOR>]`
Adds a website to the list.

**Parameters**   
Required:   
`url`: The URL of the site you want to track.   

Optional:   
`selector`: The part of the site you want to track. (By default the \<head\> of the site is tracked).   
<sub>
In Chrome, this can be obtained by right clicking the part of the site you want to track and selecting: `Inspect`. After this you see the element highlighted in the developer view. You can right click on the element and select `Copy → Copy selector`. </sub>

**Example**   
`/add url:https://google.com/` This tracks changes on https://google.com/.   
<sub>Note that some sites, including Google.com have dynamic elements (like ads) that cause a change every time its checked. To make sure this is filtered out, use the css selector parameter.</sub>   

`/add url:https://example.com/ selector:body > div > h1` This tracks changes in header 1 of the site https://example.com/.

---

### `/remove index: <NUMBER>`
Removes a website from the list.

**Parameters**   
Required:   
`index`: The number of the site you want to remove. Use `/list` to see the number of the site(s).   

**Example**   
`/remove index:1` This removes the first site in the list (`/list`).

---

### `/list` (Alias: `/show`)
Shows the list of websites being watched.

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