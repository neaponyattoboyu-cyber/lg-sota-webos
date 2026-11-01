'use strict';
var assert = require('assert'), Service = require('../app/com.local.sota.tv/lib/service');
var profile = require('../app/com.local.sota.tv/lib/profile'), UserError = require('../app/com.local.sota.tv/lib/error');
function response(server) { return {platform: 'singbox', configuration: {outbounds: [{type: 'vless', server: server || 'vpn.example.com', server_port: 443,
  uuid: '12345678-1234-1234-1234-123456789012', flow: 'xtls-rprx-vision', transport: {}, multiplex: {},
  tls: {enabled: true, server_name: 'example.com', reality: {enabled: true, public_key: 'a'.repeat(43), short_id: 'abcd'}, utls: {enabled: true, fingerprint: 'qq'}}}]}}; }
var rawLocations = [{id: 12, name: 'Финляндия', shortname: 'FI', gateways: [{name: 'FI-1'}, {name: 'FI-2'}]},
  {id: 10, name: 'Нидерланды', shortname: 'NL', gateways: [{name: 'NL-1'}, {name: 'NL-2'}]}];
function setup() {
  var values = {locations: {items: profile.locations(rawLocations)}, prefs: {selected: profile.identity(rawLocations[1])}, active: profile.identity(rawLocations[0])};
  var store = {get: function (k, d) { return values[k] === undefined ? d : values[k]; }, set: function (k, v) { values[k] = v; }};
  var config = profile.build(response('old.example.com')), running = true, events = [], starts = [];
  var engine = {status: async function () { return {running: running}; }, readConfig: function () { return config; },
    writeConfig: function (v) { events.push('write:' + v.outbounds[0].server); config = v; },
    validate: async function (c) { events.push('validate:' + c.outbounds[0].server); }, healthy: async function () { return true; },
    stop: async function () { events.push('stop'); running = false; return {running: false}; },
    start: async function () { starts.push(config.outbounds[0].server); events.push('start'); running = config.outbounds[0].server === 'old.example.com'; return {running: running}; }};
  var provider = {locations: async function () { return rawLocations; }, profile: async function (id, gateway) { events.push('fetch:' + gateway); return response('new.example.com'); }};
  return {service: new Service(store, provider, engine), store: store, provider: provider, engine: engine, values: values, events: events, starts: starts};
}
async function rejects(work, pattern) { try { await work(); assert.fail('Expected failure'); } catch (e) { assert(pattern.test(e.message), e.message); } }
async function run() {
  var count = 0;
  async function test(name, action) { await action(); console.log('PASS ' + name); count++; }
  await test('failed country switch restores the actual previous configuration and connection', async function () {
    var t = setup(); await rejects(function () { return t.service.connect(); }, /Прежнее подключение восстановлено/);
    assert.strictEqual((await t.engine.status()).running, true); assert.strictEqual(t.engine.readConfig().outbounds[0].server, 'old.example.com');
    assert.strictEqual(t.values.active.id, 12); assert.strictEqual(t.values.prefs.selected.id, 10);
    assert(t.events.lastIndexOf('validate:new.example.com') < t.events.indexOf('stop'));
  });
  await test('a second server can succeed, without silently changing country', async function () {
    var t = setup(); t.provider.profile = async function (id, gateway) { return response(gateway ? 'good.example.com' : 'bad.example.com'); };
    t.engine.start = async function () { t.starts.push(t.engine.readConfig().outbounds[0].server); return {running: t.starts[t.starts.length-1] === 'good.example.com'}; };
    await t.service.connect(); assert.deepStrictEqual(t.starts, ['bad.example.com', 'good.example.com']); assert.strictEqual(t.values.active.id, 10);
    assert.strictEqual(t.values['profiles/10'].config.outbounds[0].server, 'good.example.com');
  });
  await test('expired account never stops an existing VPN or falls back around authentication', async function () {
    var t = setup(); t.provider.profile = async function () { throw new UserError('Ключ недействителен', 'AUTH'); };
    await rejects(function () { return t.service.connect(); }, /Ключ/); assert.strictEqual(t.events.indexOf('stop'), -1);
  });
  await test('malformed provider settings cannot reach the engine or stop the existing VPN', async function () {
    var t = setup(); t.provider.profile = async function () { return {platform: 'unknown'}; };
    await rejects(function () { return t.service.connect(); }, /неподдерживаемые/); assert.strictEqual(t.events.indexOf('stop'), -1);
  });
  await test('offline API uses only a saved profile for the chosen country', async function () {
    var t = setup(), down = async function () { throw new UserError('Offline', 'NETWORK'); };
    t.provider.locations = down; t.provider.profile = down;
    t.store.set('profiles/10', {location: profile.identity(rawLocations[1]), config: profile.build(response('cached.example.com'))});
    t.engine.start = async function () { return {running: true}; };
    assert(/сохранённые/.test(await t.service.connect())); assert.strictEqual(t.engine.readConfig().outbounds[0].server, 'cached.example.com');
    var other = setup(); other.provider.locations = down; other.provider.profile = down;
    other.store.set('profiles/12', {location: profile.identity(rawLocations[0]), config: profile.build(response())});
    await rejects(function () { return other.service.connect(); }, /Offline/); assert.strictEqual(other.events.indexOf('stop'), -1);
  });
  await test('unchanged healthy connection is kept running during refresh', async function () {
    var t = setup(); t.provider.profile = async function () { return response('old.example.com'); };
    await t.service.connect(); assert.strictEqual(t.events.indexOf('stop'), -1); assert.strictEqual(t.starts.length, 0);
  });
  await test('a write failure after stopping still restores the previous connection', async function () {
    var t = setup(), original = t.engine.writeConfig, failed = false;
    t.engine.writeConfig = function (c) { if (!failed) { failed = true; throw new Error('disk failure'); } original(c); };
    await rejects(function () { return t.service.connect(); }, /Прежнее подключение восстановлено/);
    assert.strictEqual(t.engine.readConfig().outbounds[0].server, 'old.example.com'); assert.strictEqual((await t.engine.status()).running, true);
  });
  await test('an initially disabled VPN stays off when every new server fails', async function () {
    var t = setup(); t.engine.status = async function () { return {running: false}; }; t.engine.start = async function () { return {running: false}; };
    await rejects(function () { return t.service.connect(); }, /VPN выключен/); assert.strictEqual(t.engine.readConfig().outbounds[0].server, 'old.example.com');
  });
  await test('country ID changes are rebound by name, while duplicate short names stay distinct', async function () {
    var chosen = profile.resolve([{id: 88, name: 'Финляндия', shortname: 'FI'}], rawLocations[0]); assert.strictEqual(chosen.id, 88);
    var bridges = [{id: 57, name: 'Мост в Финляндию', shortname: 'BRRUSE'}, {id: 56, name: 'Мост в Швецию', shortname: 'BRRUSE'}];
    assert.strictEqual(profile.resolve(bridges, bridges[0]).id, 57);
    assert.strictEqual(profile.resolve(bridges, {id: 9, name: 'Missing', shortname: 'BRRUSE'}), null);
  });
  await test('selecting or refreshing countries does not touch network routing', async function () {
    var t = setup(); t.service.choose(12); await t.service.refresh(); assert.strictEqual(t.events.length, 0);
    assert.strictEqual(t.values.prefs.selected.id, 12);
  });
  await test('only supported tunnel fields enter the generated config', async function () {
    var input = response(); input.configuration.route = {rules: [{evil: true}]}; input.configuration.outbounds[0].tls.insecure = true;
    var built = profile.build(input); assert.strictEqual(built.outbounds[0].tls.insecure, undefined); assert.strictEqual(built.route.final, 'sota');
    assert.strictEqual(built.inbounds[0].address.length, 1); assert.strictEqual(built.dns.servers[1].detour, undefined);
  });
  console.log(count + ' failure-path and behavior tests passed.');
}
run().catch(function (e) { console.error(e.stack); process.exitCode = 1; });
