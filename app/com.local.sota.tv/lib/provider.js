'use strict';
var UserError = require('./error');
var spawn = require('child_process').spawn;
var net = require('net');
var ORIGIN = 'https://meow5g.com';
function error(code) {
  var e = new UserError(code === 'AUTH' ? 'Ключ Sota больше не действует. Проверьте подписку в Sota.' :
    code === 'MISSING' ? 'Сначала нужно привязать приложение к Sota.' : 'Sota пока не отвечает. Попробуйте позже.');
  e.code = code; return e;
}
function Provider(account, options) {
  this.account = account;
  this.curl = options && options.curl || 'curl';
  this.timeout = options && options.timeout || 12;
  if (!account || account.origin !== ORIGIN || !/^[a-fA-F0-9-]{36}$/.test(account.accessKey) ||
      !/^[a-zA-Z0-9_{}.:\-]{8,120}$/.test(account.deviceId)) throw error('MISSING');
}
Provider.prototype.raw = function (route, fallback, directProxy) {
  var self = this;
  return new Promise(function (resolve, reject) {
    var args = ['--config', '-'];
    // Sensitive headers stay on stdin, never in process arguments or log files.
    var conf = ['silent', 'show-error', 'fail', 'connect-timeout = 4', 'max-time = ' + self.timeout,
      'proto = "=https"', 'max-redirs = 0', 'url = "' + ORIGIN + route + '"',
      'header = "X-Access-Key: ' + self.account.accessKey + '"',
      'header = "X-HwID: ' + self.account.deviceId + '"', 'header = "Accept-Language: ru"',
      'write-out = "\\nSOTA_HTTP:%{http_code}"'];
    if (fallback) conf.push('resolve = "meow5g.com:443:' + self.account.fallbackAddress + '"');
    if (directProxy) conf.push('proxy = "socks5://127.0.0.1:17898"');
    var child = spawn(self.curl, args, {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
    var chunks = [], size = 0, done = false;
    var timer = setTimeout(function () { child.kill(); finish(error('NETWORK')); }, (self.timeout + 2) * 1000);
    function finish(err, value) { if (done) return; done = true; clearTimeout(timer); if (err) reject(err); else resolve(value); }
    child.on('error', function () { finish(error('NETWORK')); });
    child.stdin.on('error', function () {});
    child.stderr.on('data', function () {});
    child.stdout.on('data', function (chunk) {
      size += chunk.length;
      if (size > 1024 * 1024) { child.kill(); finish(error('NETWORK')); } else chunks.push(chunk);
    });
    child.on('close', function (code) {
      if (done) return;
      var out = Buffer.concat(chunks).toString('utf8'), match = out.match(/\nSOTA_HTTP:(\d{3})$/);
      var status = match ? Number(match[1]) : 0;
      if (status === 401 || status === 403) return finish(error('AUTH'));
      if (code !== 0 || status !== 200) return finish(error('NETWORK'));
      try { finish(null, JSON.parse(out.slice(0, match.index))); } catch (_) { finish(error('NETWORK')); }
    });
    child.stdin.end(conf.join('\n') + '\n');
  });
};
Provider.prototype.request = async function (route) {
  var methods = this.preferred ? [this.preferred] : [{fallback: false, proxy: false}];
  if (net.isIP(this.account.fallbackAddress || '')) methods.push({fallback: true, proxy: false}, {fallback: true, proxy: true});
  var last;
  for (var i = 0; i < methods.length; i++) {
    var method = methods[i];
    try { var result = await this.raw(route, method.fallback, method.proxy); this.preferred = method; return result; }
    catch (e) { if (e.code === 'AUTH') throw e; last = e; }
  }
  throw last;
};
Provider.prototype.locations = function () { return this.request('/api/v1/public/connection/list'); };
Provider.prototype.profile = function (id, gateway) {
  if (!Number.isInteger(id) || id < 0 || id > 2147483647) return Promise.reject(error('NETWORK'));
  return this.request('/api/v1/public/connection/connect?gate_id=' + id + (gateway ? '&gateway_name=' + encodeURIComponent(gateway) : ''));
};
module.exports = Provider;
