'use strict';
var net = require('net'), crypto = require('crypto');
function publicIPv4(address) {
  if (net.isIP(address || '') !== 4) return false;
  var a = address.split('.').map(Number);
  return a[0] !== 0 && a[0] !== 10 && a[0] !== 127 && a[0] < 224 && !(a[0] === 169 && a[1] === 254) &&
    !(a[0] === 172 && a[1] >= 16 && a[1] <= 31) && !(a[0] === 192 && a[1] === 168);
}
// TCP round-trip through the core's loopback-only DIRECT outbound. The currently
// selected VPN country never becomes an extra hop in these measurements.
function probe(address, port, proxy, timeout) {
  if (!publicIPv4(address) || !Number.isInteger(port) || port < 1 || port > 65535) return Promise.resolve(null);
  return new Promise(function (resolve) {
    var socket = new net.Socket(), ended = false, started, buffer = Buffer.alloc(0), phase = 0;
    function finish(ms) { if (ended) return; ended = true; socket.destroy(); resolve(ms); }
    function elapsed() { var d = process.hrtime(started); return Math.max(1, Math.round(d[0] * 1000 + d[1] / 1000000)); }
    socket.setTimeout(timeout || 1800, function () { finish(null); });
    socket.on('error', function () { finish(null); });
    socket.on('close', function () { finish(null); });
    socket.on('connect', function () {
      if (!proxy) return finish(elapsed());
      socket.write(Buffer.from([5, 1, 0]));
    });
    socket.on('data', function (chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 1000) return finish(null);
      if (phase === 0 && buffer.length >= 2) {
        if (buffer[0] !== 5 || buffer[1] !== 0) return finish(null);
        buffer = buffer.slice(2); phase = 1; started = process.hrtime();
        socket.write(Buffer.from([5, 1, 0, 1].concat(address.split('.').map(Number), [port >> 8, port & 255])));
      }
      if (phase === 1 && buffer.length >= 5) {
        if (buffer[0] !== 5 || buffer[1] !== 0) return finish(null);
        var total = buffer[3] === 1 ? 10 : buffer[3] === 4 ? 22 : buffer[3] === 3 ? 7 + buffer[4] : 1001;
        if (buffer.length >= total) finish(elapsed());
      }
    });
    started = process.hrtime();
    socket.connect(proxy ? proxy.port : port, proxy ? proxy.host : address);
  });
}
function group(l) { return l.shortname === 'BST' ? -1 : l.shortname === 'RU' ? 1 : /^BRRU/.test(l.shortname) || /^Мост/i.test(l.name) ? 2 : 0; }
function sorted(list, measurements) {
  var items = list.map(function (l, i) {
    var r = measurements && measurements.byId && measurements.byId[l.id];
    return Object.assign({}, l, {latencyMs: r && typeof r.ms === 'number' ? r.ms : null, originalIndex: i});
  });
  items.sort(function (a, b) { return group(a) - group(b) ||
    (a.latencyMs === null ? Infinity : a.latencyMs) - (b.latencyMs === null ? Infinity : b.latencyMs) || a.originalIndex - b.originalIndex; });
  return items.map(function (l) { delete l.originalIndex; return l; });
}
async function measure(list, proxy, fn, concurrency) {
  var tasks = [], seen = {}, result = {byId: {}, updatedAt: Date.now(), method: 'tcp-direct-median', schemaVersion: 2};
  list.forEach(function (l) {
    result.byId[l.id] = {ms: null, gateways: []};
    (l.gateways || []).slice(0, 2).forEach(function (g) {
      if (g && publicIPv4(g.address)) {
        if (!seen[g.address]) { seen[g.address] = {address: g.address, uses: []}; tasks.push(seen[g.address]); }
        seen[g.address].uses.push({id: l.id, name: g.name});
      }
    });
  });
  var index = 0;
  async function worker() {
    while (index < tasks.length) {
      var task = tasks[index++], samples = [];
      for (var i = 0; i < 3; i++) { var ms = await (fn || probe)(task.address, 443, proxy); if (ms !== null) samples.push(ms); }
      var value = median(samples);
      task.uses.forEach(function (u) { var r = result.byId[u.id]; r.gateways.push({name: u.name, ms: value, samples: samples}); if (value !== null && (r.ms === null || value < r.ms)) r.ms = value; });
    }
  }
  await Promise.all(Array.apply(null, Array(Math.min(concurrency || 3, tasks.length))).map(worker));
  result.updatedAt = Date.now(); return result;
}
function median(samples) { var a=samples.filter(function(v){return typeof v==='number'&&isFinite(v);}).sort(function(x,y){return x-y;});if(!a.length)return null;var i=Math.floor(a.length/2);return a.length%2?a[i]:Math.round((a[i-1]+a[i])/2); }
function endpoint(config) { var o=config&&config.outbounds&&config.outbounds.filter(function(x){return x.type==='vless'&&x.tag==='sota';})[0];return o?{server:o.server,port:o.server_port}:null; }
function digest(config) { var o=endpoint(config);return o?crypto.createHash('sha256').update(o.server+':'+o.port).digest('hex'):null; }
async function active(config,proxy,fn){var o=endpoint(config),samples=[];if(o&&publicIPv4(o.server)){for(var i=0;i<3;i++){var v=await(fn||probe)(o.server,o.port,proxy);if(v!==null)samples.push(v);}}return{digest:digest(config),ms:median(samples),samples:samples,updatedAt:Date.now()};}
module.exports = {probe: probe, sorted: sorted, measure: measure, publicIPv4: publicIPv4, group: group,median:median,digest:digest,active:active};
