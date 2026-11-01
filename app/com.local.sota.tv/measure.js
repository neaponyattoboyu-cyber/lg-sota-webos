'use strict';
var storage = require('./lib/storage'), Jobs = require('./lib/jobs'), Engine = require('./lib/engine'), latency = require('./lib/latency');
var store = new storage.Store('/media/developer/sota-lg'), jobs = new Jobs('/tmp/sota-lg-latency', __filename), engine = new Engine(__dirname, store.dir);
async function main() {
  if (process.argv[2] !== 'worker') { jobs.enqueue('measure', null); return; }
  await jobs.work(process.argv[3], async function (job) {
    var running = (await engine.status()).running;
    var proxy = running ? {host: '127.0.0.1', port: 17898} : null;
    var list = store.get('locations', {items: []}).items, config=engine.readConfig();
    // With VPN enabled, never fall back to a measurement through that VPN.
    var result;
    if(job.action==='active'){result=store.get('latency',{});if(result.schemaVersion!==2)result={byId:{},schemaVersion:2,method:'tcp-direct-median',updatedAt:null};}
    else{var before=store.get('latency',{});if(before.schemaVersion!==2)before={byId:{},schemaVersion:2,updatedAt:null};if(running)before.active=await latency.active(config,proxy);store.set('latency',before);result=await latency.measure(list,proxy);result.active=before.active;}
    if(job.action==='active'&&running)result.active=await latency.active(config,proxy);
    store.set('latency',result);
    return '';
  }, function () { return 'Не удалось измерить отклик серверов.'; });
}
main().catch(function () { process.exitCode = 1; });
