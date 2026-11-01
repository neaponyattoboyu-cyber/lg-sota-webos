'use strict';
// Service addresses, not process names: webOS web apps share the network process.
var suffixes=['kinopoisk.ru','kinopoisk-ru.clstorage.net','kp.yandex.net','ott.yandex.ru','ott.yandex.net','strm.yandex.ru','strm.yandex.net','storage.mds.yandex.net'];
var exact=['kp-config-smart-tv.akamaized.net','kp-configs-smart-tv.s3.eu-central-1.amazonaws.com'];
function get(store){return Object.assign({enabled:false,kinopoisk:false},store.get('split',{}));}
function next(current,action){var s=Object.assign({},current);if(action==='toggle-split')s.enabled=!s.enabled;else if(action==='toggle-kinopoisk'){s.kinopoisk=!s.kinopoisk;if(s.kinopoisk)s.enabled=true;}else throw Error('Unknown split action');return s;}
function apply(config,settings){
 if(!settings||!settings.enabled||!settings.kinopoisk)return config;
 config.dns.reverse_mapping=true;
 config.dns.rules=[{domain_suffix:suffixes.slice(),domain:exact.slice(),action:'route',server:'bootstrap-dns'}];
 config.route.rules.push({domain_suffix:suffixes.slice(),domain:exact.slice(),action:'route',outbound:'direct'});
 return config;
}
function view(store){var s=get(store);return{enabled:s.enabled,kinopoisk:s.kinopoisk,mode:'service-domains',domains:suffixes.concat(exact),description:'Выбранные адреса Кинопоиска и видео-CDN идут напрямую из любого приложения. Остальное — через VPN.'};}
module.exports={get:get,next:next,apply:apply,view:view};
