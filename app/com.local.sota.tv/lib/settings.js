'use strict';
function get(store) { return Object.assign({autostart: true, autoUpdate: true, checkUpdates: true}, store.get('settings', {})); }
function change(store, name) {
  if (['autostart', 'autoUpdate'].indexOf(name) < 0) throw new Error('Unknown setting');
  var s = get(store); s[name] = !s[name]; store.set('settings', s); return s;
}
module.exports = {get: get, change: change};
