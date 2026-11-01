(function(){
'use strict';
function el(id){return document.getElementById(id);}
var pending=false,state=null,bridge,serial=0,refreshed=false,measured=false,lastAction='toggle',pollTimer=null;
var toggle=el('toggle'),country=el('country'),reconnect=el('reconnect'),refresh=el('refresh'),settingsButton=el('settings');
var picker=el('picker'),panel=el('settings-panel'),splitPanel=el('split-panel'),list=el('country-list'),appPath='/media/developer/apps/usr/palm/applications/com.local.sota.tv';
function different(a,b){return a&&b&&(a.id!==b.id||a.name!==b.name);}
function ms(l){return l&&typeof l.latencyMs==='number'?l.latencyMs+' мс':'нет данных';}
function paintPing(target,l){var value=l&&l.latencyMs;target.textContent='';var dot=document.createElement('span');dot.className='ping-dot '+(typeof value!=='number'?'ping-unknown':value<=50?'ping-good':value<=80?'ping-fair':'ping-poor');dot.setAttribute('aria-hidden','true');target.appendChild(dot);var label=document.createElement('span');label.textContent=ms(l);target.appendChild(label);}
function flagName(l){return l&&/^[a-z0-9-]+\.(svg|png)$/.test(l.flag||'')?l.flag:'globe.png';}
function image(l){var img=document.createElement('img');img.className='flag';img.alt='';img.src='flags/'+flagName(l);img.onerror=function(){this.onerror=null;this.src='flags/globe.png';};return img;}
function controls(){return [country,toggle,reconnect,refresh,settingsButton].filter(function(b){return !b.disabled&&!b.hidden;});}
function showSettings(){panel.hidden=false;el('autostart').focus();}
function closePanel(){panel.hidden=true;settingsButton.focus();}
function closePicker(){picker.hidden=true;country.focus();}
function showSplit(){splitPanel.hidden=false;el('split-enabled').focus();}
function closeSplit(){splitPanel.hidden=true;el('split-open').focus();}
function platformBack(){if(window.webOS&&typeof window.webOS.platformBack==='function')window.webOS.platformBack();else if(window.PalmSystem&&typeof window.PalmSystem.platformBack==='function')window.PalmSystem.platformBack();}
function paint(result){
 if(result.error){el('message').textContent=result.message;return;}
 var wasBusy=state&&state.busy;state=result;
 document.body.className=result.running?'connected':'';
 el('status').textContent=result.busy?'Подождите…':result.running?'VPN включён':'VPN выключен';
 el('active').textContent=result.running?'Подключено: '+(result.active?result.active.name:'Sota'):'Выберите страну и подключитесь';
 el('country-name').textContent=result.selected?result.selected.name:'Выбрать страну';el('country-flag').src='flags/'+flagName(result.selected);var connectedSelection=result.running&&result.active&&result.selected&&result.active.id===result.selected.id;paintPing(el('country-ping'),connectedSelection?result.active:result.selected);el('ping-note').textContent=connectedSelection?'Отклик подключённого сервера':'Лучший отклик проверенных серверов страны';
 toggle.textContent=result.running?(different(result.selected,result.active)?'Сменить страну':'Отключить'):'Подключить';el('message').textContent=result.message||'';
 country.disabled=result.busy||!result.locations.length;toggle.disabled=result.busy||!result.selected;reconnect.hidden=!result.running||different(result.selected,result.active);reconnect.disabled=result.busy;refresh.disabled=result.busy;
 el('latency-status').textContent=result.measuring?'Измеряю отклик… Россия и мосты останутся в конце.':'Лучший проверенный отклик страны · Россия и мосты в конце';
 // Update values without moving or reordering buttons while the picker is open.
 if(!picker.hidden)Array.prototype.forEach.call(list.children,function(b){var l=result.locations.filter(function(x){return x.id===Number(b.dataset.id);})[0];if(l)paintPing(b.querySelector('.ping'),l);});
 var s=result.settings||{},u=result.updates||{};
 el('version').textContent=result.version||'1.3.1';el('autostart-value').textContent=s.autostart?'Вкл':'Выкл';el('autostart').setAttribute('aria-pressed',s.autostart?'true':'false');
 el('auto-update-value').textContent=s.autoUpdate?'Вкл':'Выкл';el('auto-update').setAttribute('aria-pressed',s.autoUpdate?'true':'false');
 el('update-versions').textContent='Клиент LG: '+(u.currentVersion||result.version)+' · Последняя Sota: '+(u.upstreamVersion||'—');
 el('update-message').textContent=(u.message||'Обновления проверяются автоматически раз в сутки.')+(u.upstreamNewer?' У Sota вышла новая версия. Совместимое обновление для LG появится отдельно.':'');
 el('install-update').hidden=!u.available;el('install-update').textContent=u.available?'Установить '+u.available:'Установить';
 var split=result.split||{};
 el('split-value').textContent=split.enabled&&split.kinopoisk?'Кинопоиск напрямую':'Выключен';
 el('split-enabled-value').textContent=split.enabled?'Вкл':'Выкл';el('split-enabled').setAttribute('aria-pressed',split.enabled?'true':'false');
 el('kinopoisk-value').textContent=split.kinopoisk?'Напрямую':'Через VPN';el('kinopoisk').setAttribute('aria-pressed',split.kinopoisk?'true':'false');
 el('split-message').textContent=result.message||'';
 ['autostart','auto-update','check-update','install-update','split-enabled','kinopoisk'].forEach(function(id){el(id).disabled=result.busy;});
 if(picker.hidden&&panel.hidden&&splitPanel.hidden&&(document.activeElement===document.body||(wasBusy&&!result.busy))){var target=el(lastAction);if(!target||target.disabled||target.hidden)target=toggle.disabled?settingsButton:toggle;target.focus();}
 if(!result.busy&&!result.measuring&&result.running&&(!result.activeLatencyUpdatedAt||Date.now()-result.activeLatencyUpdatedAt>120000))setTimeout(function(){request('measure-active');},150);
 if(!refreshed&&!result.busy&&(!result.updatedAt||Date.now()-result.updatedAt>21600000)){refreshed=true;setTimeout(function(){request('refresh');},100);}

}
function schedulePoll(){clearTimeout(pollTimer);if(!document.hidden)pollTimer=setTimeout(function(){request('status');},state&&(state.busy||state.measuring)?2000:8000);}
function request(action,id){
 if(pending||(state&&state.busy&&action!=='status'&&action!=='measure'))return;
 var Bridge=window.webOSServiceBridge||window.PalmServiceBridge;if(!Bridge){el('message').textContent='Откройте приложение на телевизоре LG.';return;}
 if(action==='choose'&&!/^\d{1,10}$/.test(String(id)))return;
 clearTimeout(pollTimer);pending=true;var ticket=++serial;bridge=new Bridge();
 var timer=setTimeout(function(){if(serial!==ticket)return;serial++;pending=false;el('message').textContent='Ответ задерживается. Состояние проверится автоматически.';schedulePoll();},10000);
 bridge.onservicecallback=function(raw){if(serial!==ticket)return;clearTimeout(timer);pending=false;try{var response=typeof raw==='string'?JSON.parse(raw):raw;if(!response.returnValue)throw new Error('service');var lines=(response.stdoutString||'').trim().split(/\r?\n/);paint(JSON.parse(lines[lines.length-1]));}catch(_){el('message').textContent='Не удалось обратиться к службе VPN. Откройте приложение ещё раз.';}schedulePoll();};
 bridge.call('luna://org.webosbrew.hbchannel.service/exec',JSON.stringify({command:'/bin/sh '+appPath+'/launch.sh '+action+(action==='choose'?' '+Number(id):'')}));
}
country.addEventListener('click',function(){
 if(!state||state.busy||pending)return;list.textContent='';
 state.locations.forEach(function(location){var b=document.createElement('button');b.type='button';b.dataset.id=location.id;b.appendChild(image(location));var name=document.createElement('span');name.className='country-label';name.textContent=location.name;b.appendChild(name);var ping=document.createElement('span');ping.className='ping';paintPing(ping,location);b.appendChild(ping);b.setAttribute('aria-pressed',state.selected&&state.selected.id===location.id?'true':'false');b.addEventListener('click',function(){closePicker();lastAction='country';request('choose',location.id);});list.appendChild(b);});
 picker.hidden=false;var target=list.querySelector('[aria-pressed=true]')||list.firstElementChild;if(target){target.focus();target.scrollIntoView({block:'nearest'});}if(!state.measuring&&(!state.latencyUpdatedAt||Date.now()-state.latencyUpdatedAt>1800000)){measured=true;request('measure');}
});
el('picker-close').addEventListener('click',closePicker);settingsButton.addEventListener('click',showSettings);el('settings-close').addEventListener('click',closePanel);
toggle.addEventListener('click',function(){if(!state)return;lastAction='toggle';request(state.running&&!different(state.selected,state.active)?'stop':'connect');});
reconnect.addEventListener('click',function(){lastAction='reconnect';request('connect');});refresh.addEventListener('click',function(){lastAction='refresh';refreshed=true;measured=true;request('refresh');});
el('autostart').addEventListener('click',function(){request('toggle-autostart');});el('auto-update').addEventListener('click',function(){request('toggle-autoUpdate');});
el('check-update').addEventListener('click',function(){request('check-update');});el('install-update').addEventListener('click',function(){request('install');});
el('split-open').addEventListener('click',showSplit);el('split-close').addEventListener('click',closeSplit);
el('split-enabled').addEventListener('click',function(){request('toggle-split');});el('kinopoisk').addEventListener('click',function(){request('toggle-kinopoisk');});
document.addEventListener('keydown',function(event){var code=event.keyCode;
 if(code===461||code===27){event.preventDefault();if(!splitPanel.hidden)closeSplit();else if(!picker.hidden)closePicker();else if(!panel.hidden)closePanel();else platformBack();return;}
 if([37,38,39,40].indexOf(code)<0)return;event.preventDefault();var options,index,next;
 if(!splitPanel.hidden){options=[el('split-enabled'),el('kinopoisk'),el('split-close')].filter(function(b){return !b.disabled;});index=options.indexOf(document.activeElement);next=(index+(code===37||code===38?-1:1)+options.length)%options.length;}
 else if(!picker.hidden){options=Array.prototype.slice.call(list.children);index=options.indexOf(document.activeElement);next=index<0?0:Math.max(0,Math.min(options.length-1,index+(code===38?-2:code===40?2:code===37?-1:1)));}
 else if(!panel.hidden){options=[el('split-open'),el('autostart'),el('auto-update'),el('check-update'),el('install-update'),el('settings-close')].filter(function(b){return !b.hidden&&!b.disabled;});index=options.indexOf(document.activeElement);next=(index+(code===37||code===38?-1:1)+options.length)%options.length;}
 else{options=controls();index=options.indexOf(document.activeElement);next=(index+(code===37||code===38?-1:1)+options.length)%options.length;}
 if(options[next]){options[next].focus();options[next].scrollIntoView({block:'nearest'});}
});
document.addEventListener('visibilitychange',function(){clearTimeout(pollTimer);if(!document.hidden&&!pending)request('status');});
request('status');
}());
