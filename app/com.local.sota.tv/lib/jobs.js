'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), spawn = require('child_process').spawn;
var storage = require('./storage');
function Jobs(dir, script, verifier) {
  storage.ensure(dir); this.file = path.join(dir, 'job.json'); this.lock = path.join(dir, 'job.lock'); this.script = script;
  this.verifier = verifier || function (job) {
    if (!job.pid || !job.token) return false;
    try {
      var args = fs.readFileSync('/proc/' + job.pid + '/cmdline', 'utf8').split('\0');
      return args.indexOf(script) >= 0 && args.indexOf('worker') >= 0 && args.indexOf(job.token) >= 0;
    } catch (_) { return false; }
  };
}
Jobs.prototype.read = function () { return storage.read(this.file, {}); };
Jobs.prototype.update = function (job, message) { if (message !== undefined) job.message = message; job.updatedAt = Date.now(); storage.write(this.file, job); };
Jobs.prototype.owns = function (token) { try { return fs.readFileSync(this.lock, 'utf8') === token; } catch (_) { return false; } };
Jobs.prototype.busy = function () { return fs.existsSync(this.lock); };
Jobs.prototype.recover = function () {
  if (!this.busy()) return;
  var token, modified;
  try { token = fs.readFileSync(this.lock, 'utf8'); modified = fs.statSync(this.lock).mtime.getTime(); } catch (_) { return; }
  var job = this.read();
  if ((job.token === token && this.verifier(job)) || Date.now() - modified < 10000) return;
  if (this.owns(token)) {
    this.update({busy: false, message: 'Операция прервалась. Проверьте VPN и подключитесь ещё раз.'});
    if (this.owns(token)) fs.unlinkSync(this.lock);
  }
};
Jobs.prototype.enqueue = function (action, id) {
  this.recover();
  var self = this, token = crypto.randomBytes(16).toString('hex'), fd;
  try { fd = fs.openSync(this.lock, 'wx', 384); } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  fs.writeSync(fd, token); fs.closeSync(fd);
  var job = {token: token, pid: null, action: action, id: id, busy: true, message: 'Подождите…'};
  this.update(job);
  var child = spawn(process.execPath, [this.script, 'worker', token], {detached: true, stdio: 'ignore'});
  child.on('error', function () {
    if (self.owns(token)) { job.busy = false; self.update(job, 'Не удалось запустить службу VPN.'); if (self.owns(token)) fs.unlinkSync(self.lock); }
  });
  if (child.pid) { job.pid = child.pid; this.update(job); }
  child.unref(); return true;
};
Jobs.prototype.work = async function (token, action, errorMessage) {
  if (!this.owns(token)) return;
  var self = this, job = this.read();
  if (job.token !== token) return;
  job.pid = process.pid; this.update(job);
  try { job.message = await action(job, function (message) { self.update(job, message); }); }
  catch (e) { job.message = errorMessage(e); }
  finally { job.busy = false; this.update(job); if (this.owns(token)) fs.unlinkSync(this.lock); }
};
module.exports = Jobs;
