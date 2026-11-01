'use strict';
var spawn = require('child_process').spawn, fs = require('fs'), crypto = require('crypto'), url = require('url');
var UserError = require('./error');
function https(value) { var u = url.parse(value); return u.protocol === 'https:' && !u.auth && !!u.hostname && value.length < 2000; }
function fetch(value, options) {
  options = options || {};
  if (!https(value)) return Promise.reject(new UserError('Неверный адрес обновлений.'));
  return new Promise(function (resolve, reject) {
    var max = options.max || 524288, count = 0, chunks = [], hash = crypto.createHash('sha256'), file, done = false;
    if (options.file) file = fs.openSync(options.file, 'wx', 384);
    var args = ['--silent', '--show-error', '--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--max-redirs', '5',
      '--connect-timeout', '5', '--max-time', String(options.timeout || 20), '--user-agent', 'LG-Personal-VPN/1.2', value];
    var child = spawn(options.curl || 'curl', args, {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    var timer = setTimeout(function () { child.kill(); finish(new UserError('Источник обновлений пока недоступен.')); }, ((options.timeout || 20) + 3) * 1000);
    function finish(e) {
      if (done) return; done = true; clearTimeout(timer);
      if (file !== undefined) { fs.closeSync(file); file = undefined; }
      if (e) { if (options.file) try { fs.unlinkSync(options.file); } catch (_) {} reject(e); }
      else resolve({data: options.file ? null : Buffer.concat(chunks), size: count, sha256: hash.digest('hex')});
    }
    child.on('error', function () { finish(new UserError('Не удалось проверить обновления.')); });
    child.stderr.on('data', function () {});
    child.stdout.on('data', function (b) {
      if (done) return;
      count += b.length;
      if (count > max) { child.kill(); return finish(new UserError('Размер обновления не прошёл проверку.')); }
      hash.update(b);
      if (file !== undefined) { try { fs.writeSync(file, b); } catch (_) { child.kill(); finish(new UserError('Не удалось сохранить обновление.')); } }
      else chunks.push(b);
    });
    child.on('close', function (code) { if (code !== 0) finish(new UserError('Источник обновлений пока недоступен.')); else finish(); });
  });
}
module.exports = {fetch: fetch, https: https};
