'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

function ensure(dir) {
  if (!fs.existsSync(dir)) { ensure(path.dirname(dir)); fs.mkdirSync(dir, 448); }
}
function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function write(file, value) {
  ensure(path.dirname(file));
  var tmp = file + '.' + process.pid + '.' + crypto.randomBytes(5).toString('hex');
  try {
    fs.writeFileSync(tmp, JSON.stringify(value), {mode: 384, flag: 'wx'});
    fs.renameSync(tmp, file);
    fs.chmodSync(file, 384);
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
}
function Store(dir) { this.dir = dir; ensure(dir); }
Store.prototype.get = function (name, fallback) { return read(path.join(this.dir, name + '.json'), fallback); };
Store.prototype.set = function (name, value) { write(path.join(this.dir, name + '.json'), value); };
module.exports = {Store: Store, ensure: ensure, read: read, write: write};
