/**
 * @author Noël Vissers
 * @project Site Watcher
 * @version 1.0.0
 * 
 * Invite link: https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=bot&permissions=8
 * (replace 123456789012345678 with your client id from https://discord.com/developers/applications)
 * Start: npm start
 */

require('dotenv').config();

const Discord = require('discord.js');
var client = new Discord.Client();
const CronJob = require('cron').CronJob;
const CronTime = require('cron').CronTime;
const got = require('got');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
var crypto = require('crypto');
const fs = require('fs-extra');
const diff = require('diff');

const carrierMonitor = require('./carrier_monitor.js');


const PREFIX = '!'; //Change this to anything you like as a prefix
var regexp = /[^\s"]+|"([^"]*)"/gi;
const file = './src/sites.json';
var sitesToMonitor = [];
const settingsFile = './src/settings.json';
var settings = { interval: 5, debug: false };

const responsesFile = './src/responses.json';
var responses = []; 

const forcedSite = 'deadbeefdeadbeefdeadbeefdeadbeef';

//Events when bot comes online
client.on('ready', () => {
  //Load saved sites
  var tempJson = fs.readJSONSync(file);
  console.log(tempJson);
  sitesToMonitor = [...tempJson];

  // Initialize lastContent for existing sites if it's missing
  for (let i = 0; i < sitesToMonitor.length; i++) {
    if (!sitesToMonitor[i].lastContent) {
      const url = sitesToMonitor[i].url;
      const css = sitesToMonitor[i].css;
      got(url).then(response => {
        const dom = new JSDOM(response.body);
        let content = '';
        if (css) {
          const selector = dom.window.document.querySelector(css);
          content = selector ? selector.textContent : '';
        } else {
          content = dom.window.document.querySelector('head').textContent;
        }
        sitesToMonitor[i].lastContent = content;
        fs.outputJSON(file, sitesToMonitor, { spaces: 2 }, err => {
          if (err) console.log(err);
        });
      }).catch(err => {
        console.log(`Error initializing lastContent for ${url}: ${err}`);
      });
    }
  }

  //Load saved settings
  tempJson = fs.readJSONSync(settingsFile);
  console.log(tempJson);
  settings = tempJson;

  // Load responses
  tempJson = fs.readJSONSync(responsesFile);
  console.log(tempJson);
  responses = tempJson;

  for (var i = 0; i < responses.length; i++) {
    responses[i].trigger_regex = new RegExp(responses[i].trigger, 'i');
  }

  //Initialize carrier monitor
  carrierMonitor.initialize(client, settings.debug);

  if (settings.debug) {
    console.log('DEBUG MODE ENABLED');
    update(client, sitesToMonitor, client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID), file);
    carrierMonitor.check(client, true).then(() => {
      setTimeout(() => {
        process.exit();
      }, 5000);
    });
    return;
  }  

  //Start monitoring
  if (settings.interval < 60) {
    cronUpdate.setTime(new CronTime(`0 */${settings.interval} * * * *`));
    carrierCron.setTime(new CronTime(`0 */${settings.interval} * * * *`));
  } else {
    cronUpdate.setTime(new CronTime(`0 0 * * * *`));
    carrierCron.setTime(new CronTime(`0 0 * * * *`));
  }
  
  cronUpdate.start();
  carrierCron.start();

  console.log(`[${client.user.tag}] Ready...\n[${client.user.tag}] Running an interval of ${settings.interval} minute(s).`);


  console.log('Waiting!');
  var waitTill = new Date(new Date().getTime() + 1500);
  while(waitTill > new Date()){}

  console.log('Done!');
})

client.on('message', (message) => {
  //console.log('Start msg');

  //return;

  if (!message.author.bot && process.env.DISCORDJS_APCHANNEL_ID === message.channel.id) {
      var ap_message = message.content.trim();

      for (let response of responses)
      {
        var ap_match = response.trigger_regex.exec(ap_message);

        if (ap_match != null) {
          message.channel.startTyping();
          
          var waitTill = new Date(new Date().getTime() + 3 * 1000);
          while(waitTill > new Date()){}

          reply_id = Math.floor(Math.random() * response.replies.length);
          reply = response.replies[reply_id];


          if (reply.img_response !== "") {
            const img = new Discord.MessageAttachment(reply.img_response);
            message.channel.send(img);
          }

          if (reply.text_response !== "") {
            message.reply(reply.text_response);
          }

          message.channel.stopTyping();

          return;
        }
      }
  }

  // console.log('Not a response')

  //Check if message starts with prefix and remove prefix from string
  if (!message.content.startsWith(PREFIX) || message.author.bot || process.env.DISCORDJS_ADMINCHANNEL_ID !== message.channel.id || !message.member.roles.cache.has(process.env.DISCORDJS_ROLE_ID)) return;
  var args = [];
  console.log(`[${message.author.tag}]: ${message.content}`);
  const argsTemp = message.content.slice(PREFIX.length).trim();

  //Split the string in command, and arguments. This part splits on spaces exept if it is between quotes ("a b")
  do {
    var match = regexp.exec(argsTemp);
    if (match != null) {
      args.push(match[1] ? match[1] : match[0]);
    }
  } while (match != null);
  console.log(args);

  //Make command uppercase so !help and !Help both work (including all other commands)
  const CMD_NAME = args.shift().toLowerCase();

  switch (CMD_NAME.toUpperCase()) {
    case "HELP":
      {
        var embed = new Discord.MessageEmbed();
        embed.setTitle("Commands");
        embed.setColor('0x6058f3');
        embed.addField('\`!help\`', 'Show all commands.');
        embed.addField('\`!add <URL> "<CSS SELECTOR>"\`', 'Add site to monitor with optional CSS selector.');
        embed.addField('\`!remove <NR>\`', 'Remove site from list.');
        embed.addField('\`!list\`', 'Show list of added sites.');
        embed.addField('\`!update\`', 'Manually update sites.');
        embed.addField('\`!interval\`', 'Set update interval, default \`5\`.');
        embed.addField('\`!start\`', 'Start automatic monitoring on set interval, default \`on\`.');
        embed.addField('\`!stop\`', 'Stop monitoring.');
        embed.addField('\`!status\`', 'Show monitoring status.');
        embed.addField('\`!carrier <status|start|stop>\`', 'Manage the carrier monitor.');  
        message.channel.send(embed);
      } break;
    case "ADD":
      {
        if (args.length === 0) return message.channel.send('Usage: `!add <URL> (<CSS SELECTOR>)`');
        var url = args[0];
        var selector = 'head';
        if (args[1]) {
          selector = args[1];
        }

        //Create site object
        var site = {
          id: url.split('/')[2],
          url: url,
          css: selector,
          lastChecked: 0,
          lastUpdated: 0,
          hash: 0,
          lastContent: '',

        };

        //Check if site is valid
        got(site.url).then(response => {
          const dom = new JSDOM(response.body);

          var warning = false;

          //Get css element
          if (site.css) {
            var selector = dom.window.document.querySelector(site.css);

            if (selector) {
              var content = selector.textContent;
            }
            else {
              var content = '';
              warning = true;
            }
          }
          //Get head is no css element is selected
          else
            var content = dom.window.document.querySelector('head').textContent;

          console.log(content);

          //Hash the site content so only a short string is saved
          var hash = crypto.createHash('md5').update(content).digest('hex');

          //Set time for added site
          var time = new Date();
          site.lastChecked = time.toLocaleString();
          site.lastUpdated = time.toLocaleString();
          site.hash = hash;
          site.lastContent = content; // Initialize lastContent

          //Add site to site array
          sitesToMonitor.push(site);
          console.log(sitesToMonitor);

          //Save updated array to file
          fs.outputJSON(file, sitesToMonitor, { spaces: 2 }, err => {
            if (err) console.log(err)
          });

          var warning_message = '';

          if (warning) {
            warning_message = '\n**Atención:** No se encontró el selector CSS solicitado'
          }

          //Send confirmation message
          var embed = new Discord.MessageEmbed();
          embed.addField(`Monitoreando ahora:`, `Dominio: ${site.id}\nURL: ${site.url}\nCSS: \`${site.css}\`${warning_message}\n`)
          embed.setColor('0x6058f3');
          message.channel.send(embed);

        }).catch(err => {
          //Return any errors that might occur, like invalid site/css
          return message.channel.send(`Error: \`${err}\``);
        });
      } break;
    case "REMOVE":
      {
        if (args.length === 0 || isNaN(args[0])) return message.channel.send('Usage: `!remove <NR [1-99]>`');
        if (args[0] < 1 || args[0] > 99 || args[0] > sitesToMonitor.length) return message.channel.send('Not a valid number. Usage: `!remove <NR [1-99]>`');

        const id = sitesToMonitor[args[0] - 1].id;
        sitesToMonitor.splice(args[0] - 1, 1);

        fs.outputJSON(file, sitesToMonitor, { spaces: 2 }, err => {
          if (err) console.log(err)
        })

        console.log(sitesToMonitor);
        message.channel.send(`Removed **${id}** from list.`);

      } break;
    case "LIST":
      {
        if (sitesToMonitor.length < 1) return message.channel.send('No sites to monitor. Add one with `!add`.');

        var embed = new Discord.MessageEmbed();
        for (let i = 0; i < sitesToMonitor.length; i++) {
          embed.setTitle(`${sitesToMonitor.length} sitio(s) están siendo monitoreados:`);
          embed.addField(`${sitesToMonitor[i].id}`, `URL: ${sitesToMonitor[i].url}\nCSS: \`${sitesToMonitor[i].css}\`\nChecked: ${sitesToMonitor[i].lastChecked}\nUpdated: ${sitesToMonitor[i].lastUpdated}\nRemove: \`!remove ${i + 1}\``);
          embed.setColor('0x6058f3');
        }

        message.channel.send(embed);

      } break;
    case "UPDATE":
      {
        message.channel.send(`Updating \`${sitesToMonitor.length}\` site(s)...`);
        update(client, sitesToMonitor, message.channel, file);
        message.channel.send(`Done...`);
      } break;
    case "INTERVAL":
      if (args.length === 0 || isNaN(args[0]) || args[0] < 1 || args[0] > 60) return message.channel.send('Usage: `!interval <MINUTES [1-60]>`');
      {
        if (Math.round(args[0]) < 60) {
          cronUpdate.setTime(new CronTime(`0 */${Math.round(args[0])} * * * *`));
        } else {
          cronUpdate.setTime(new CronTime(`0 0 * * * *`));
        }
        settings.interval = Math.round(args[0]);

        fs.outputJSON(settingsFile, settings, { spaces: 2 }, err => {
          if (err) console.log(err)
        });

        message.channel.send(`Interval set to \`${settings.interval}\` minutes.`);
        cronUpdate.start();

        if (Math.round(args[0]) < 60) {
          carrierCron.setTime(new CronTime(`0 */${Math.round(args[0])} * * * *`));
        } else {
          carrierCron.setTime(new CronTime(`0 0 * * * *`));
        }
        carrierCron.start();
      } break;
    case "START":
      {
        cronUpdate.start();
        var time = new Date();
        console.log(`Cron started at ${time.toLocaleString()}`);
        message.channel.send(`Started monitoring...`);
      } break;
    case "STOP":
      {
        cronUpdate.stop();
        var time = new Date();
        console.log(`Cron stopped at ${time.toLocaleString()}`);
        message.channel.send('Paused website monitoring... Type `!start` to resume.');
      } break;
    case "STATUS":
      {
        var time = new Date();
        console.log('Status: ', cronUpdate.running);
        if (cronUpdate.running) message.channel.send(`Site Watcher is running with an interval of \`${settings.interval}\` minute(s).`);
        else message.channel.send('Site Watcher is not running. Use `!start` to start monitoring websites.');
      } break;
    case "CARRIER":
      {
        if (args.length === 0) return message.channel.send('Usage: `!carrier <status|start|stop>');
        const subCommand = args.shift().toLowerCase();
        switch (subCommand) {
          case 'status':
            var status = carrierCron.running ? 'running' : 'not running';
            message.channel.send(`Carrier monitor is ${status}.`);
            break;
          case 'start':
            carrierCron.start();
            message.channel.send('Carrier monitor started.');
            break;
          case 'stop':
            carrierCron.stop();
            message.channel.send('Carrier monitor stopped.');
            break;
          default:
            message.channel.send('Invalid command... Usage: `!carrier <status|start|stop>');
        }
      } break;
    default:
      message.channel.send('Invalid command...\nType `!help` for a list of commands.');
  }

})



//Update the sites
async function update(clientInstance, sitesArray, channelInstance, file) {
  let channel = channelInstance;
  const changedSitesDetails = []; // To store details of all changed sites

  const checkPromises = sitesArray.map(async (site, index) => {
    try {
      const response = await got(site.url);
      const dom = new JSDOM(response.body);
      let content = '';

      if (site.css) {
        const selector = dom.window.document.querySelector(site.css);
        content = selector ? selector.textContent : '';
      } else {
        content = dom.window.document.querySelector('head').textContent;
      }

      const hash = crypto.createHash('md5').update(content).digest('hex');

      if (site.hash !== hash) {
        const oldContent = site.lastContent || ''; // Capture old content before updating, defaulting to empty string
        
        // Update site data
        site.lastChecked = new Date().toLocaleString();
        site.lastUpdated = new Date().toLocaleString();
        site.hash = hash;
        site.lastContent = content;

        return { changed: true, index, oldContent, newContent: content, dom };
      } else {
        site.lastChecked = new Date().toLocaleString(); // Update last checked even if no change
        return { changed: false };
      }
    } catch (err) {
      if (site.hash !== forcedSite) {
        console.log(`${site.url} : ${err}`);
      }
      return { changed: false }; // Return false on error
    }
  });

  const results = await Promise.all(checkPromises);

  // Filter out sites that actually changed
  results.forEach(result => {
    if (result.changed) {
      changedSitesDetails.push(result);
    }
  });

  if (changedSitesDetails.length > 0) {
    channel.send("Detecté cambios"); // Send this once at the beginning of detected changes
  }

  for (const { index, oldContent, newContent, dom } of changedSitesDetails) {
    console.log(`Change detected! ${sitesArray[index].url}`);
    console.log(newContent);

    var title = dom.window.document.title;
    if (title === "") {
      title = sitesArray[index].id;
    }

    const changes = diff.diffLines(oldContent, newContent);
    let diffString = '';
    changes.forEach((part) => {
      const prefix = part.added ? '🟢' : part.removed ? '🔴' : '⚪';
      if ((!part.added && !part.removed) && diffString.length >= 1800) {
        return;
      }
      
      if (!part.value) return;

      // Trim the last newline to avoid a dangling prefix, then add it back later.
      const endsWithNewline = part.value.endsWith('\n');
      const valueToProcess = endsWithNewline ? part.value.slice(0, -1) : part.value;

      const prefixedLines = valueToProcess.split('\n').map(line => prefix + line).join('\n');
      
      diffString += prefixedLines;

      if (endsWithNewline) {
        diffString += '\n';
      }
    });

    if (diffString.length > 1900) {
      diffString = diffString.substring(0, 1900) + '\n... (truncated)';
    }

    var embed = new Discord.MessageEmbed();
    embed.setTitle(`🔎 ¡Cambio en ${title}!  🐸`);
    embed.addField(`URL`, `${sitesArray[index].url}`);
    embed.addField(`Último cambio`, `${sitesArray[index].lastUpdated}`, true);
    embed.addField(`Actualizado`, `${sitesArray[index].lastUpdated}`, true);
    embed.setColor('0x6058f3');
    channel.send(embed);
    channel.send(`\`\`\`diff\n${diffString}\n\`\`\``);
  }

  // Save the new data in the file only once after all checks and updates
  if (changedSitesDetails.length > 0) {
    fs.outputJSON(file, sitesArray, { spaces: 2 }, err => {
      if (err) console.log(err);
    });
  }
}

//Update on set interval
const cronUpdate = new CronJob(`0 */${settings.interval} * * * *`, function () {
  var time = new Date();
  console.log(`Cron executed at ${time.toLocaleString()}`);
  update(client, sitesToMonitor, client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID), file);
}, null, false);

const carrierCron = new CronJob(`0 */${settings.interval} * * * *`, function () {
  carrierMonitor.check(client);
}, null, false);

if (require.main === module) {
  client.login(process.env.DISCORDJS_BOT_TOKEN);
}

module.exports = { update };
