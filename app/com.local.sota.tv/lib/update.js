'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), storage = require('./storage'), download = require('./download'), UserError = require('./error');
function version(v) { if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v || '')) throw new UserError('Неверная версия обновления.'); return v.split('.').map(Number); }
function newer(a, b) { var x = version(a), y = version(b); for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; }
function verify(envelope, key, current) {
  if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 65536 || typeof envelope.signature !== 'string' || envelope.signature.length > 2000) throw new UserError('Подпись обновления не прошла проверку.');
  var bytes = Buffer.from(envelope.payload, 'base64'), check = crypto.createVerify('RSA-SHA256');
  check.update(bytes);
  if (!check.verify(key, envelope.signature, 'base64')) throw new UserError('Подпись обновления не прошла проверку.');
  var r;
  try { r = JSON.parse(bytes.toString('utf8')); } catch (_) { throw new UserError('Описание обновления не прошло проверку.'); }
  version(r.version);
  if (r.schema !== 1 || r.appId !== 'com.local.sota.tv' || r.platform !== 'webos-5-armv7' || !r.package ||
    !download.https(r.package.url) || !/^[a-f0-9]{64}$/.test(r.package.sha256 || '') ||
    !Number.isInteger(r.package.size) || r.package.size < 1000 || r.package.size > 80 * 1024 * 1024 ||
    (r.minClientVersion && newer(r.minClientVersion, current))) throw new UserError('Это обновление не подходит телевизору.');
  return r;
}
function Updater(store, app, fetcher) { this.store = store; this.app = app; this.fetch = fetcher || download.fetch; this.info = storage.read(path.join(app, 'release-info.json'), {}); }
Updater.prototype.state = function () {
  var s = this.store.get('updates/status', {}), ready = this.store.get('updates/ready', null);
  return {configured: !!this.feed(), checkedAt: s.checkedAt || null, available: ready && newer(ready.version, this.info.version) ? ready.version : null,
    message: s.message || '', upstreamVersion: s.upstreamVersion || this.info.upstreamBaseVersion,
    upstreamNewer: newer(s.upstreamVersion || this.info.upstreamBaseVersion, this.info.upstreamBaseVersion), currentVersion: this.info.version};
};
Updater.prototype.feed = function () { return this.store.get('updates/source', {}).url || this.info.updateFeed; };
Updater.prototype.check = async function (progress) {
  var state = this.store.get('updates/status', {}), feed = this.feed();
  if (progress) progress('Проверяю обновления…');
  try {
    var upstream = JSON.parse((await this.fetch('https://api.github.com/repos/sotavpn/sotavpn-app/releases/latest')).data.toString('utf8'));
    var tag = String(upstream.tag_name || '').replace(/^v/, ''); version(tag); state.upstreamVersion = tag;
  } catch (_) {}
  if (!feed) { state.message = 'Источник обновлений клиента LG ещё не подключён.'; state.checkedAt = Date.now(); this.store.set('updates/status', state); return state.message; }
  var envelope = JSON.parse((await this.fetch(feed)).data.toString('utf8'));
  var release = verify(envelope, fs.readFileSync(path.join(this.app, 'update-public.pem')), this.info.version);
  state.checkedAt = Date.now();
  if (!newer(release.version, this.info.version)) { state.message = 'Установлена актуальная версия.'; this.store.set('updates/status', state); return state.message; }
  if (progress) progress('Загружаю обновление ' + release.version + '…');
  var folder = path.join(this.store.dir, 'updates'); storage.ensure(folder);
  var tmp = path.join(folder, 'candidate.' + process.pid + '.ipk');
  var got = await this.fetch(release.package.url, {file: tmp, max: release.package.size, timeout: 120});
  if (got.size !== release.package.size || got.sha256 !== release.package.sha256) { try { fs.unlinkSync(tmp); } catch (_) {} throw new UserError('Файл обновления не прошёл проверку.'); }
  var destination = path.join(folder, 'candidate.ipk'); fs.renameSync(tmp, destination);
  this.store.set('updates/manifest', envelope); this.store.set('updates/ready', {version: release.version, package: release.package, downloadedAt: Date.now()});
  state.message = 'Обновление ' + release.version + ' готово к установке.'; this.store.set('updates/status', state); return state.message;
};
Updater.prototype.verifyReady = function () {
  var r = verify(this.store.get('updates/manifest', null), fs.readFileSync(path.join(this.app, 'update-public.pem')), this.info.version);
  if (!newer(r.version, this.info.version)) throw new UserError('Уже установлена актуальная версия.');
  var file = path.join(this.store.dir, 'updates/candidate.ipk'), bytes = fs.readFileSync(file);
  if (bytes.length !== r.package.size || crypto.createHash('sha256').update(bytes).digest('hex') !== r.package.sha256) throw new UserError('Файл обновления не прошёл повторную проверку.');
  return r;
};
Updater.prototype.install = async function (progress) {
  this.verifyReady();
  if (progress) progress('Устанавливаю обновление приложения…');
  var runner = path.join(this.store.dir, 'updates/install-runner.sh');
  fs.writeFileSync(runner, fs.readFileSync(path.join(this.app, 'update-install.sh')), {mode: 448});
  var self = this;
  return new Promise(function (resolve, reject) {
    require('child_process').execFile('/bin/sh', [runner], {timeout: 200000, maxBuffer: 8192}, function (error, stdout) {
      var result;
      try { result = JSON.parse(stdout.trim().split(/\r?\n/).pop()); } catch (_) {}
      if (error || !result || !result.ok) return reject(new UserError(result && result.message || 'Не удалось установить обновление. Прежняя версия сохранена.'));
      try { var state = self.store.get('updates/status', {}); state.message = 'Установлена актуальная версия.'; self.store.set('updates/status', state); } catch (_) {}
      resolve('Приложение обновлено. Откройте его ещё раз.');
    });
  });
};
module.exports = {Updater: Updater, verify: verify, newer: newer};
