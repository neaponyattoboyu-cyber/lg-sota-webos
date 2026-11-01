'use strict';
var UserError = require('./error');
var crypto = require('crypto');
function invalid() { var e = new UserError('Sota прислала неподдерживаемые настройки. Прежнее подключение сохранено.'); e.code = 'PROFILE'; throw e; }
function text(v, max, pattern) { if (typeof v !== 'string' || !v.length || v.length > max || (pattern && !pattern.test(v))) invalid(); return v; }
function outbound(response) {
  if (!response || response.platform !== 'singbox' || !response.configuration || !Array.isArray(response.configuration.outbounds)) invalid();
  var list = response.configuration.outbounds.filter(function (o) { return o && o.type === 'vless'; });
  if (list.length !== 1) invalid();
  var o = list[0], tls = o.tls, r = tls && tls.reality;
  text(o.server, 253, /^[a-zA-Z0-9.:-]+$/);
  text(o.uuid, 36, /^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/);
  if (!Number.isInteger(o.server_port) || o.server_port < 1 || o.server_port > 65535 || !tls || tls.enabled !== true || !r || r.enabled !== true) invalid();
  text(tls.server_name, 253, /^[a-zA-Z0-9.-]+$/);
  text(r.public_key, 43, /^[a-zA-Z0-9_-]{43}$/);
  if (typeof r.short_id !== 'string' || !/^(?:[a-fA-F0-9]{2}){0,8}$/.test(r.short_id)) invalid();
  if (o.flow && o.flow !== 'xtls-rprx-vision') invalid();
  if (o.transport && Object.keys(o.transport).length) invalid();
  if (o.multiplex && Object.keys(o.multiplex).length) invalid();
  var result = {type: 'vless', tag: 'sota', server: o.server, server_port: o.server_port, uuid: o.uuid,
    tls: {enabled: true, server_name: tls.server_name, reality: {enabled: true, public_key: r.public_key, short_id: r.short_id}}};
  if (o.flow) result.flow = o.flow;
  if (tls.utls && tls.utls.enabled) result.tls.utls = {enabled: true, fingerprint: text(tls.utls.fingerprint, 40, /^[a-zA-Z0-9_]+$/)};
  return result;
}
function build(response, splitSettings) {
  var config = {log: {level: 'warn'}, dns: {servers: [
    {type: 'https', tag: 'remote-dns', server: '1.1.1.1', path: '/dns-query', detour: 'sota'},
    {type: 'udp', tag: 'bootstrap-dns', server: '1.1.1.1'}], final: 'remote-dns', strategy: 'prefer_ipv4'},
    inbounds: [{type: 'tun', tag: 'tv-tun', interface_name: 'sotavpn0', address: ['172.28.0.1/30'], mtu: 1400,
      auto_route: true, strict_route: false, iproute2_table_index: 20261, iproute2_rule_index: 20261, stack: 'system'},
      {type: 'socks', tag: 'latency-in', listen: '127.0.0.1', listen_port: 17898}],
    outbounds: [outbound(response), {type: 'direct', tag: 'direct'}],
    route: {auto_detect_interface: true, default_domain_resolver: 'bootstrap-dns', rules: [
      {inbound: ['latency-in'], action: 'route', outbound: 'direct'},
      {action: 'sniff'}, {protocol: 'dns', action: 'hijack-dns'}, {ip_is_private: true, action: 'route', outbound: 'direct'}], final: 'sota'}};
  return require('./split').apply(config,splitSettings);
}
function fingerprint(config) { return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex'); }
function locations(input) {
  if (!Array.isArray(input) || !input.length || input.length > 300) throw new UserError('Не удалось получить список стран Sota.');
  var ids = {};
  return input.map(function (l) {
    if (!l || !Number.isInteger(l.id) || l.id < 0 || l.id > 2147483647 || ids[l.id]) invalid();
    ids[l.id] = true;
    var icon = typeof l.icon_url === 'string' && l.icon_url.match(/^https:\/\/sotacdn\.com\/api\/v1\/public\/storage\/([a-z0-9-]{1,40}\.svg)$/);
    return {id: l.id, name: text(l.name, 100), shortname: text(l.shortname, 40, /^[a-zA-Z0-9_-]+$/), flag: icon ? icon[1] : 'globe.svg',
      gateways: (Array.isArray(l.gateways) ? l.gateways : []).slice(0, 200).map(function (g) {
        return {name: text(g.name, 200), address: typeof g.address === 'string' && /^[a-zA-Z0-9.:-]{1,253}$/.test(g.address) ? g.address : null};
      })};
  });
}
function identity(l) { return {id: l.id, name: l.name, shortname: l.shortname, flag: l.flag || 'globe.svg'}; }
function resolve(list, selected) {
  if (!selected) return list.filter(function (l) { return l.shortname === 'FI'; })[0] || list[0];
  var exact = list.filter(function (l) { return l.id === selected.id && l.name === selected.name && l.shortname === selected.shortname; });
  if (exact.length === 1) return exact[0];
  var named = list.filter(function (l) { return l.name === selected.name && l.shortname === selected.shortname; });
  if (named.length === 1) return named[0];
  var short = list.filter(function (l) { return l.shortname === selected.shortname; });
  if (short.length === 1) return short[0];
  return null;
}
module.exports = {build: build, locations: locations, identity: identity, resolve: resolve, fingerprint: fingerprint};
