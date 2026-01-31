<div align="center">

![SiteWatcher](./.github/pictures/icon.png)

### site-watcher

A Discord bot that alerts you when (part of) a website changes.

[![Node.js CI](https://github.com/alcayaga/djs-site-watcher/actions/workflows/nodejs.yml/badge.svg)](https://github.com/alcayaga/djs-site-watcher/actions/workflows/nodejs.yml) [![Version](https://img.shields.io/github/v/release/alcayaga/djs-site-watcher)](https://github.com/alcayaga/site-watcher/releases) 
[![Licence](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

</div>

---

## This project is obsolete!

This bot is built on an old version of Discord.js (v12) and uses message content, a feature that is now restricted for verified bots. While it may still work on unverified servers, it is no longer maintained and may break at any time. Feel free to fork this project and create your own version based on this.

## Features

Notify you in Discord when a website changes:   
![site-watcher](./.github/pictures/site-watcher.png)   
   
List of features of the site-watcher bot:
- Add multiple sites to watcher
- Remove site from watcher
- Monitoring specified elements of a site, to not get notified on dynamic elements (ex. ads)
- Checking on a specified interval (1-60 minutes, default `5`).
- Show list of tracked sites
- Monitor Apple Carrier Bundles
- Monitor Apple Pay Configurations
- Monitor Apple eSIM Carrier Support
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
3. Add the channel ID from the channel you want the update notifications in after `DISCORDJS_TEXTCHANNEL_ID=`. You can get this ID by right clicking the channel in discord and selecting `Copy ID`.  Make sure `Developer Mode` is on by going to `Settings → Appearance → Advanced → Developer Mode → ON`. Make sure the bot has permission to post in this channel.
4. Add the channel ID from the channel you want the admin commands to be used in after `DISCORDJS_ADMINCHANNEL_ID=`.
5. Add the role ID that is allowed to use the admin commands after `DISCORDJS_ROLE_ID=`.


For starting and using the bot, see [Usage](#Usage).

## Usage
The simplest method to monitor a site:
1. Invite the bot to your Discord server by replacing `123456789012345678` in the following link with your bot's client id: `https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=bot&permissions=8`. 
1. Open the command line in the cloned repository folder by opening the `cmd.bat` file.
2. Start the bot by typing `npm start`.
3. In Discord (the bot should now be online), add a website with the `!add <URL>` command in the configured admin channel.
4. Done! The added site is now being monitored.
<sub>By default, the watch interval for every website is 5 minutes, but you can easily change this with the `!interval` command followed by the interval in minutes.</sub>

For all other options, see [Commands](#Commands).

## Commands
### `!help`
Show all the available commands.

**Parameters**   
None.

**Example**   
`!help` This will show all the available commands.

**Output**   
![help](./.github/pictures/help.png)

---

### `!add <URL> "<CSS SELECTOR>"`
Adds a website to the list.

**Parameters**   
Required:   
`URL` The URL of the site you want to track.   

Optional:   
`"CSS SELECTOR"` The part of the site you want to track. (By default the \<head\> of the site is tracked).   
<sub>**Make sure to use double quotation marks when using this parameter.**   
In Chrome, this can be obtained by right clicking the part of the site you want to track and selecting: `Inspect`. After this you see the element highlighted in the developer view. You can right click on the element and select `Copy → Copy selector`. </sub>

**Example**   
`!add https://google.com/` This tracks changes on https://google.com/.   
<sub>Note that some sites, including Google.com have dynamic elements (like ads) that cause a change every time its checked. To make sure this is filtered out, use the css selector parameter.</sub>   

`!add https://example.com/ "body > div > h1"` This tracks changes in header 1 of the site https://example.com/.

**Output**   
![add](./.github/pictures/add.png)

---

### `!remove <NUMBER>`
Removes a website from the list.

**Parameters**   
Required:   
`NUMBER` The number of the site you want to remove. Use `!list` to see the number of the site(s).   

**Example**   
`!remove 1` This removes the first site in the list (`!list`).

**Output**   
![remove](./.github/pictures/remove.png)

---

### `!list`
Shows the list of websites being watched.

**Parameters**   
None.

**Example**   
`!list` This shows the list of websites being watched.

**Output**   
![list](./.github/pictures/list.png)

---

### `!interval <MINUTES>`
Set the interval/refresh rate of the watcher. Default `5` minutes.

**Parameters**   
`MINUTES` The interval in minutes (minimum of 1, maximum of 60).

**Example**   
`!interval 10` Sets the interval to 10 minutes.

**Output**   
![interval](./.github/pictures/interval.png)

---

### `!monitor <start|stop|status|check> [monitor_name|all]`
Manage the monitors.

**Parameters**
`subcommand` One of `start`, `stop`, `status`, or `check`.
`monitor_name` (Optional) The name of the monitor (e.g., `Site`, `Carrier`, `AppleEsim`, `ApplePay`, `AppleFeature`). Defaults to `all`.

**Example**
`!monitor status` Shows the status of all monitors.
`!monitor check Carrier` Triggers a check for the Carrier monitor.

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
