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
function ownedPid(bin, pidFile, procRoot, alive) {
  try {
    var value=fs.readFileSync(pidFile,'utf8').trim();
    if(!/^[1-9][0-9]{0,8}$/.test(value))return null;
    var pid=Number(value);if(pid<2)return null;
    var command=fs.readFileSync(path.join(procRoot||'/proc',value,'cmdline'),'utf8').split('\0')[0];
    if(command!==bin)return null;
    if((alive||function(p){return process.kill(p,0);})(pid)===false)return null;return pid;
  }catch(_){return null;}
}
function Engine(app, data, options) { this.app = app; this.data = data; this.config = path.join(data, 'config.json'); this.options=options||{}; }
Engine.prototype.pid = function () { return ownedPid(path.join(this.app,'bin/sing-box'),this.options.pidFile||'/tmp/sota-lg/client.pid',this.options.procRoot,this.options.alive); };
Engine.prototype.action = async function (action) {
  var env = Object.assign({}, process.env, {SOTA_CONFIG: this.config});
  var r = await run('/bin/sh', [path.join(this.app, 'control.sh'), action], {env: env, stdio: ['ignore', 'pipe', 'ignore']}, 28000);
  try { return JSON.parse(r.output.trim().split(/\r?\n/).pop()); }
  catch (_) { throw new UserError('Не удалось получить состояние VPN.'); }
};
Engine.prototype.status = function () { return Promise.resolve({running:this.pid()!==null,message:''}); };
Engine.prototype.stop = async function () {
  if(fs.existsSync(path.join(this.app,'control.sh')))return this.action('stop');
  // The root supervisor may outlive an app uninstall. Stop only the verified core.
  var pid=this.pid();if(pid!==null){process.kill(pid,'SIGTERM');for(var i=0;i<50&&this.pid()!==null;i++)await new Promise(function(r){setTimeout(r,100);});}
  return this.status();
};
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
module.exports.ownedPid = ownedPid;
