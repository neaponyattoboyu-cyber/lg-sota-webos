(function(){
'use strict';
function el(id){return document.getElementById(id);}
var pending=false,state=null,bridge,serial=0,refreshed=false,measured=false,lastAction='toggle';
var toggle=el('toggle'),country=el('country'),reconnect=el('reconnect'),refresh=el('refresh'),settingsButton=el('settings');
var picker=el('picker'),panel=el('settings-panel'),list=el('country-list'),appPath='/media/developer/apps/usr/palm/applications/com.local.sota.tv';
function different(a,b){return a&&b&&(a.id!==b.id||a.name!==b.name);}
function ms(l){return l&&typeof l.latencyMs==='number'?l.latencyMs+' мс':'—';}
function flagName(l){return l&&/^[a-z0-9-]+\.svg$/.test(l.flag||'')?l.flag:'globe.svg';}
function image(l){var img=document.createElement('img');img.className='flag';img.alt='';img.src='flags/'+flagName(l);img.onerror=function(){this.onerror=null;this.src='flags/globe.svg';};return img;}
function controls(){return [country,toggle,reconnect,refresh,settingsButton].filter(function(b){return !b.disabled&&!b.hidden;});}
function showSettings(){panel.hidden=false;el('autostart').focus();}
function closePanel(){panel.hidden=true;settingsButton.focus();}
function closePicker(){picker.hidden=true;country.focus();}
function paint(result){
 if(result.error){el('message').textContent=result.message;return;}
 var wasBusy=state&&state.busy;state=result;
 document.body.className=result.running?'connected':'';
 el('status').textContent=result.busy?'Подождите…':result.running?'VPN включён':'VPN выключен';
 el('active').textContent=result.running?'Подключено: '+(result.active?result.active.name:'Sota'):'Выберите страну и подключитесь';
 el('country-name').textContent=result.selected?result.selected.name:'Выбрать страну';el('country-flag').src='flags/'+flagName(result.selected);el('country-ping').textContent=ms(result.selected);
 toggle.textContent=result.running?(different(result.selected,result.active)?'Сменить страну':'Отключить'):'Подключить';el('message').textContent=result.message||'';
 country.disabled=result.busy||!result.locations.length;toggle.disabled=result.busy||!result.selected;reconnect.hidden=!result.running||different(result.selected,result.active);reconnect.disabled=result.busy;refresh.disabled=result.busy;
 el('latency-status').textContent=result.measuring?'Измеряю отклик… Россия и мосты останутся в конце.':'По отклику · Россия и мосты в конце';
 // Update values without moving or reordering buttons while the picker is open.
 if(!picker.hidden)Array.prototype.forEach.call(list.children,function(b){var l=result.locations.filter(function(x){return x.id===Number(b.dataset.id);})[0];if(l)b.querySelector('.ping').textContent=ms(l);});
 var s=result.settings||{},u=result.updates||{};
 el('version').textContent=result.version||'1.2.0';el('autostart-value').textContent=s.autostart?'Вкл':'Выкл';el('autostart').setAttribute('aria-pressed',s.autostart?'true':'false');
 el('auto-update-value').textContent=s.autoUpdate?'Вкл':'Выкл';el('auto-update').setAttribute('aria-pressed',s.autoUpdate?'true':'false');
 el('update-versions').textContent='Клиент LG: '+(u.currentVersion||result.version)+' · Последняя Sota: '+(u.upstreamVersion||'—');
 el('update-message').textContent=(u.message||'Обновления проверяются автоматически раз в сутки.')+(u.upstreamNewer?' У Sota вышла новая версия. Совместимое обновление для LG появится отдельно.':'');
 el('install-update').hidden=!u.available;el('install-update').textContent=u.available?'Установить '+u.available:'Установить';
 ['autostart','auto-update','check-update','install-update'].forEach(function(id){el(id).disabled=result.busy;});
 if(picker.hidden&&panel.hidden&&(document.activeElement===document.body||(wasBusy&&!result.busy))){var target=el(lastAction);if(!target||target.disabled||target.hidden)target=toggle.disabled?settingsButton:toggle;target.focus();}
 if(!refreshed&&!result.busy&&(!result.updatedAt||Date.now()-result.updatedAt>21600000)){refreshed=true;setTimeout(function(){request('refresh');},100);}
 else if(!measured&&!result.measuring&&(!result.latencyUpdatedAt||Date.now()-result.latencyUpdatedAt>1800000)){measured=true;setTimeout(function(){request('measure');},150);}
}
function request(action,id){
 if(pending||(state&&state.busy&&action!=='status'&&action!=='measure'))return;
 var Bridge=window.webOSServiceBridge||window.PalmServiceBridge;if(!Bridge){el('message').textContent='Откройте приложение на телевизоре LG.';return;}
 if(action==='choose'&&!/^\d{1,10}$/.test(String(id)))return;
 pending=true;var ticket=++serial;bridge=new Bridge();
 var timer=setTimeout(function(){if(serial!==ticket)return;serial++;pending=false;el('message').textContent='Ответ задерживается. Состояние проверится автоматически.';},10000);
 bridge.onservicecallback=function(raw){if(serial!==ticket)return;clearTimeout(timer);pending=false;try{var response=typeof raw==='string'?JSON.parse(raw):raw;if(!response.returnValue)throw new Error('service');var lines=(response.stdoutString||'').trim().split(/\r?\n/);paint(JSON.parse(lines[lines.length-1]));}catch(_){el('message').textContent='Не удалось обратиться к службе VPN. Откройте приложение ещё раз.';}};
 bridge.call('luna://org.webosbrew.hbchannel.service/exec',JSON.stringify({command:'/bin/sh '+appPath+'/launch.sh '+action+(action==='choose'?' '+Number(id):'')}));
}
country.addEventListener('click',function(){
 if(!state||state.busy||pending)return;list.textContent='';
 state.locations.forEach(function(location){var b=document.createElement('button');b.type='button';b.dataset.id=location.id;b.appendChild(image(location));var name=document.createElement('span');name.className='country-label';name.textContent=location.name;b.appendChild(name);var ping=document.createElement('span');ping.className='ping';ping.textContent=ms(location);b.appendChild(ping);b.setAttribute('aria-pressed',state.selected&&state.selected.id===location.id?'true':'false');b.addEventListener('click',function(){closePicker();lastAction='country';request('choose',location.id);});list.appendChild(b);});
 picker.hidden=false;var target=list.querySelector('[aria-pressed=true]')||list.firstElementChild;if(target){target.focus();target.scrollIntoView({block:'nearest'});}
});
el('picker-close').addEventListener('click',closePicker);settingsButton.addEventListener('click',showSettings);el('settings-close').addEventListener('click',closePanel);
toggle.addEventListener('click',function(){if(!state)return;lastAction='toggle';request(state.running&&!different(state.selected,state.active)?'stop':'connect');});
reconnect.addEventListener('click',function(){lastAction='reconnect';request('connect');});refresh.addEventListener('click',function(){lastAction='refresh';refreshed=true;measured=true;request('refresh');});
el('autostart').addEventListener('click',function(){request('toggle-autostart');});el('auto-update').addEventListener('click',function(){request('toggle-autoUpdate');});
el('check-update').addEventListener('click',function(){request('check-update');});el('install-update').addEventListener('click',function(){request('install');});
document.addEventListener('keydown',function(event){var code=event.keyCode;
 if(code===461||code===27){event.preventDefault();if(!picker.hidden)closePicker();else if(!panel.hidden)closePanel();else if(window.PalmSystem)window.PalmSystem.close();return;}
 if([37,38,39,40].indexOf(code)<0)return;event.preventDefault();var options,index,next;
 if(!picker.hidden){options=Array.prototype.slice.call(list.children);index=options.indexOf(document.activeElement);next=index<0?0:Math.max(0,Math.min(options.length-1,index+(code===38?-2:code===40?2:code===37?-1:1)));}
 else if(!panel.hidden){options=[el('autostart'),el('auto-update'),el('check-update'),el('install-update'),el('settings-close')].filter(function(b){return !b.hidden&&!b.disabled;});index=options.indexOf(document.activeElement);next=(index+(code===37||code===38?-1:1)+options.length)%options.length;}
 else{options=controls();index=options.indexOf(document.activeElement);next=(index+(code===37||code===38?-1:1)+options.length)%options.length;}
 if(options[next]){options[next].focus();options[next].scrollIntoView({block:'nearest'});}
});
request('status');setInterval(function(){if(!pending)request('status');},2000);
}());