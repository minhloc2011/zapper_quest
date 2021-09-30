const Sheets = require("node-sheets").default
const moment = require("moment-timezone")
const https = require("https")
const wait = require('../utils/wait')
const has = Object.prototype.hasOwnProperty
const TIMEZONE = 'Asia/Ho_Chi_Minh'

/**
 * @param {*} event 
 * @param {*} context 
 */
exports.handler = async (event, context) => {
  try {
    if (!has.call(event, 'queryStringParameters') ||
        !has.call(event.queryStringParameters, 'gg_sheet_id') || 
        !has.call(event.queryStringParameters, 'gg_sheet_key') ||
        !has.call(event.queryStringParameters, 'bot_token') ||
        !has.call(event.queryStringParameters, 'chat_id')) {
      return {
        statusCode: 200,
        body: 'Missing query params'
      }
    }
    const googleSheetId = event.queryStringParameters['gg_sheet_id'] || ''
    const googleSheetKey= event.queryStringParameters['gg_sheet_key'] || ''
    const apiKey        = event.queryStringParameters['api_key'] || '5d1237c2-3840-4733-8e92-c5a58fe81b88'
    const botToken      = event.queryStringParameters['bot_token'] || ''
    const chatId        = event.queryStringParameters['chat_id'] || ''

    const gs = new Sheets(googleSheetId);
    await gs.authorizeApiKey(googleSheetKey);
    const sheetName = `ZapperQuests!A:D`
    const table = await gs.tables(sheetName);
    const rows = table.rows;
    const validRows = rows.filter(row => {
      return row.Wallet['stringValue']
    });
    if (validRows.length < 1) {
      return {
        statusCode: 200,
        body: 'No wallet found!'
      }
    }
    const currentTime = moment().tz(TIMEZONE);
    for (const row of validRows) {
      let res = await requestQuests(row.Wallet['stringValue'], apiKey)
      if (has.call(res, 'statusCode') && res.statusCode !== 200) continue

      let messages = `\uD83D\uDE80 Wallet Address: ${row.Wallet['stringValue']} \n`;
      messages += '\uD83D\uDE80 Website: https://zapper.fi/quests \n\n';
      messages += res['data'].map(item => {
        if (item.id == 9) {
          return `\u2705 <b>${item.name}</b>: Waiting...`;
        }
        const completableAt = moment.utc(item.isCompletableAt).tz(TIMEZONE);
        if (currentTime.diff(completableAt) >= 0) {
          return `\u2705 <b>${item.name}</b> is over time, let's claim now \u23F0`;
        }
        const duration = formatRemainTime(completableAt.valueOf() - currentTime.valueOf());

        return `\u2705 <b>${item.name}</b>: ${duration} \u23F0`;
      }).join('\n');
      sendTeleGram(messages, botToken, chatId)
      await wait(2)
    }
    
    return {
      statusCode: 200,
      body: 'OK'
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500
    }
  } 
}

const formatRemainTime = (timestamp) => {
  let delta = Math.abs(timestamp) / 1000;
  // calculate (and subtract) whole days
  let days = Math.floor(delta / 86400);
  delta -= days * 86400;
  // calculate (and subtract) whole hours
  let hours = Math.floor(delta / 3600) % 24;
  delta -= hours * 3600;
  // calculate (and subtract) whole minutes
  let minutes = Math.floor(delta / 60) % 60;
  delta -= minutes * 60;
  // what's left is seconds
  // var seconds = delta % 60;
  hours = hours.toString().padStart(2, '0');
  minutes = minutes.toString().padStart(2, '0');
  if (days === 0) {
    return `${hours}h ${minutes}m`;
  }
  
  return `${days}d ${hours}h ${minutes}m`;
}

const requestQuests = async (walletAddress, apiKey) => {
  const path = [
    '/v1/gamification/users/',
    walletAddress,
    '/available-quests?',
    'api_key=' + apiKey
  ];
  const options = {
    hostname: 'api.zapper.fi',
    port: 443,
    path: encodeURI(path.join('')),
    method: 'GET'
  }

  return new Promise((resolve, reject) => {
    let req = https.request(options, (res) => {
      let output = '';
      res.setEncoding('utf8');

      res.on('data', function (chunk) {
          output += chunk;
      });

      res.on('end', () => {
          try {
              let obj = JSON.parse(output);
              resolve({
                  statusCode: res.statusCode,
                  data: obj
              });
          } catch (err) {
              console.error('rest::end', err);
              reject(err);
          }
        });
    });

    req.on('error', (err) => {
        console.error('rest::request', err);
        reject(err);
    });

    req.end();
  });
}

const sendTeleGram = (messages, botToken, chatId) => {
  const title = `\u231B<b>Zapper Quests</b>\u231B`;
  const telePath = [
    '/bot',
    botToken,
    '/sendMessage?chat_id=',
    chatId,
    '&parse_mode=html&text=',
    title + '\n\n' + messages
  ];

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: encodeURI(telePath.join('')),
    method: 'GET'
  }

  const req = https.request(options, res => {
    statusCode = res.statusCode;
  });
  req.on('error', error => {
    statusCode = 500;
  })
  req.end()
}
