'use strict';
var UserError = require('./error');
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var storage = require('./storage');
function run(command, args, options, timeout) {
  return new Promise(function (resolve, reject) {
    var child = spawn(command, args, options), size = 0, chunks = [], finished = false;
    var timer = setTimeout(function () { child.kill(); finish(new UserError('Ответ службы VPN задерживается.')); }, timeout);
    function finish(err, result) { if (finished) return; finished = true; clearTimeout(timer); if (err) reject(err); else resolve(result); }
    child.on('error', function () { finish(new UserError('Служба VPN недоступна.')); });
    if (child.stdout) child.stdout.on('data', function (b) { size += b.length; if (size < 16384) chunks.push(b); });
    child.on('close', function (code) { finish(null, {code: code, output: Buffer.concat(chunks).toString('utf8')}); });
  });
}
function Engine(app, data) { this.app = app; this.data = data; this.config = path.join(data, 'config.json'); }
Engine.prototype.action = async function (action) {
  var env = Object.assign({}, process.env, {SOTA_CONFIG: this.config});
  var r = await run('/bin/sh', [path.join(this.app, 'control.sh'), action], {env: env, stdio: ['ignore', 'pipe', 'ignore']}, 28000);
  try { return JSON.parse(r.output.trim().split(/\r?\n/).pop()); }
  catch (_) { throw new UserError('Не удалось получить состояние VPN.'); }
};
Engine.prototype.status = function () { return this.action('status'); };
Engine.prototype.stop = function () { return this.action('stop'); };
Engine.prototype.start = function () { return this.action('start'); };
Engine.prototype.readConfig = function () { return storage.read(this.config, null); };
Engine.prototype.writeConfig = function (config) { storage.write(this.config, config); };
Engine.prototype.validate = async function (config) {
  var file = path.join(this.data, 'candidate.json');
  storage.write(file, config);
  try {
    var r = await run(path.join(this.app, 'bin/sing-box'), ['check', '-c', file], {stdio: 'ignore'}, 8000);
    if (r.code !== 0) throw new UserError('Новые настройки не подходят телевизору. Прежнее подключение сохранено.');
  } finally { try { fs.unlinkSync(file); } catch (_) {} }
};
Engine.prototype.healthy = async function () {
  var r = await run('curl', ['-fsS', '--connect-timeout', '4', '--max-time', '10', '-o', '/dev/null', 'https://www.gstatic.com/generate_204'], {stdio: 'ignore'}, 12000);
  return r.code === 0;
};
module.exports = Engine;
