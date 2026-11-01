'use strict';
var storage = require('./lib/storage'), Jobs = require('./lib/jobs'), Engine = require('./lib/engine'), latency = require('./lib/latency');
var store = new storage.Store('/media/developer/sota-lg'), jobs = new Jobs('/tmp/sota-lg-latency', __filename), engine = new Engine(__dirname, store.dir);
async function main() {
  if (process.argv[2] !== 'worker') { jobs.enqueue('measure', null); return; }
  await jobs.work(process.argv[3], async function () {
    var running = (await engine.status()).running;
    var proxy = running ? {host: '127.0.0.1', port: 17898} : null;
    var list = store.get('locations', {items: []}).items;
    // With VPN enabled, never fall back to a measurement through that VPN.
    store.set('latency', await latency.measure(list, proxy));
    return '';
  }, function () { return 'Не удалось измерить отклик серверов.'; });
}
main().catch(function () { process.exitCode = 1; });
