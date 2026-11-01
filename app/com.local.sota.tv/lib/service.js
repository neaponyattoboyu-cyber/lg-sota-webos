'use strict';
var UserError = require('./error');
var profile = require('./profile');
var split = require('./split');
function same(a, b) { return a && b && a.id === b.id && a.name === b.name && a.shortname === b.shortname; }
function Service(store, provider, engine, progress) {
  this.store = store; this.provider = provider; this.engine = engine; this.progress = progress || function () {};
}
Service.prototype.refresh = async function () {
  this.progress('Обновляю список стран…');
  var list = profile.locations(await this.provider.locations());
  this.store.set('locations', {items: list, updatedAt: Date.now()});
  var prefs = this.store.get('prefs', {}), selected = profile.resolve(list, prefs.selected);
  if (selected) { prefs.selected = profile.identity(selected); this.store.set('prefs', prefs); }
  return 'Список стран обновлён.';
};
Service.prototype.choose = function (id) {
  var list = this.store.get('locations', {items: []}).items;
  var location = list.filter(function (l) { return l.id === id; })[0];
  if (!location) throw new UserError('Обновите список и выберите страну ещё раз.');
  this.store.set('prefs', {selected: profile.identity(location)});
  return '';
};
Service.prototype.stop = async function () {
  this.progress('Отключаю VPN…');
  var r = await this.engine.stop();
  if (r.running) throw new UserError('Не удалось выключить VPN. Попробуйте ещё раз.');
  return '';
};
Service.prototype.connect = async function () {
  var self = this, prefs = this.store.get('prefs', {}), cachedList = this.store.get('locations', {items: []});
  var list, offline = false;
  this.progress('Получаю свежие настройки Sota…');
  try {
    list = profile.locations(await this.provider.locations());
    this.store.set('locations', {items: list, updatedAt: Date.now()});
  } catch (e) {
    if (e.code !== 'NETWORK') throw e;
    list = cachedList.items; offline = true;
  }
  var chosen = profile.resolve(list, prefs.selected);
  if (!chosen) throw new UserError('Выбранная страна сейчас недоступна. Обновите список и выберите другую.');
  var location = profile.identity(chosen);
  this.store.set('prefs', {selected: location});
  var candidates = [], seen = {}, lastError;
  async function add(response) {
    var config = profile.build(response,split.get(self.store)), hash = profile.fingerprint(config);
    if (!seen[hash]) { await self.engine.validate(config); candidates.push({config: config, fresh: true}); seen[hash] = true; }
  }
  // Collect and validate complete profiles while the previous VPN still works.
  var gateways = [null].concat(chosen.gateways.slice(0, 2).map(function (g) { return typeof g === 'string' ? g : g.name; }));
  for (var i = 0; i < gateways.length; i++) {
    try { await add(await this.provider.profile(chosen.id, gateways[i])); }
    catch (e) { if (e.code !== 'NETWORK') throw e; lastError = e; }
  }
  var cache = this.store.get('profiles/' + chosen.id, null);
  if (!candidates.length && cache && same(cache.location, location)) {
    var cachedConfig=profile.build({platform:'singbox',configuration:{outbounds:cache.config.outbounds}},split.get(this.store));
    await this.engine.validate(cachedConfig);
    candidates.push({config: cachedConfig, fresh: false}); offline = true;
  }
  if (!candidates.length) throw lastError || new UserError('Sota пока не отвечает. Прежнее подключение сохранено.');

  var wasRunning = (await this.engine.status()).running;
  var previousConfig = this.engine.readConfig(), previousActive = this.store.get('active', null);
  if (wasRunning && !previousConfig) throw new UserError('Не удалось сохранить прежнее подключение. Попробуйте позже.');
  var oldHash = previousConfig && profile.fingerprint(previousConfig);
  var switchError;
  try { for (var n = 0; n < candidates.length; n++) {
    var candidate = candidates[n];
    this.progress('Подключаю: ' + location.name + (n ? ' · другой сервер…' : '…'));
    var unchanged = wasRunning && n === 0 && oldHash === profile.fingerprint(candidate.config);
    if (unchanged && await this.engine.healthy()) {
      this.store.set('active', location);
      this.store.set('profiles/' + chosen.id, {location: location, config: candidate.config, updatedAt: Date.now()});
      return candidate.fresh ? '' : 'Используются сохранённые настройки. Sota обновит их при следующем подключении.';
    }
    var stopped = await this.engine.stop();
    if (stopped.running) throw new UserError('Прежнее соединение ещё работает. Смена страны отменена.');
    this.engine.writeConfig(candidate.config);
    var started;
    try { started = await this.engine.start(); } catch (_) { started = {running: false}; }
    if (started.running && !started.message) {
      this.store.set('active', location);
      this.store.set('profiles/' + chosen.id, {location: location, config: candidate.config, updatedAt: Date.now()});
      return candidate.fresh ? '' : 'Используются сохранённые настройки. Sota обновит их при следующем подключении.';
    }
  } } catch (e) { switchError = e; }
  // Any failure after touching the engine must run the same rollback path.
  this.progress('Восстанавливаю прежнее подключение…');
  var finalStop = await this.engine.stop();
  if (finalStop.running) throw new UserError('Не удалось завершить смену сервера. Попробуйте выключить VPN.');
  if (previousConfig) this.engine.writeConfig(previousConfig);
  if (wasRunning && previousConfig) {
    var restored;
    try { restored = await this.engine.start(); } catch (_) { restored = {running: false}; }
    if (restored.running && !restored.message) {
      if (previousActive) this.store.set('active', previousActive);
      throw new UserError('Новый сервер не ответил. Прежнее подключение восстановлено.');
    }
    await this.engine.stop();
    throw new UserError('Серверы не ответили. VPN выключен; обычное подключение восстановлено.');
  }
  throw switchError || new UserError('Серверы не ответили. VPN выключен. Попробуйте другую страну.');
};
module.exports = Service;
Service.prototype.configureSplit = async function(action){
 var previous=split.get(this.store),selected=split.next(previous,action),old=this.engine.readConfig();
 if(!old)throw new UserError('Сначала подключите VPN, чтобы сохранить настройки сервера.');
 var config=profile.build({platform:'singbox',configuration:{outbounds:old.outbounds}},selected);
 await this.engine.validate(config);
 if(profile.fingerprint(config)===profile.fingerprint(old)){this.store.set('split',selected);return '';}
 var wasRunning=(await this.engine.status()).running,touched=false;
 this.progress('Применяю правила сплит-туннеля…');
 try{
  if(wasRunning){var stopped=await this.engine.stop();if(stopped.running)throw new UserError('Не удалось применить правила. Прежнее подключение сохранено.');}
  touched=true;this.engine.writeConfig(config);
  if(wasRunning){var started=await this.engine.start();if(!started.running||started.message)throw new UserError('Новое подключение не прошло проверку.');}
  this.store.set('split',selected);return selected.enabled&&selected.kinopoisk?'Кинопоиск идёт напрямую. YouTube остаётся через VPN.':'Выбранные исключения выключены.';
 }catch(e){
  if(!touched)throw e;
  this.store.set('split',previous);
  var finalStop=await this.engine.stop();
  if(finalStop.running)throw new UserError('Не удалось завершить смену правил. Попробуйте выключить VPN.');
  this.engine.writeConfig(old);
  if(wasRunning){
   var restored;try{restored=await this.engine.start();}catch(_){restored={running:false};}
   if(!restored.running||restored.message){await this.engine.stop();throw new UserError('Прежние правила сохранены. VPN не удалось запустить; попробуйте подключиться снова.');}
  }
  throw new UserError('Правила не удалось применить. Прежние настройки восстановлены.');
 }
};
