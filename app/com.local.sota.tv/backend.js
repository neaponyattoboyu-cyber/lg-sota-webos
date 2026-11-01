'use strict';
var fs=require('fs'),path=require('path');
var storage=require('./lib/storage'),Service=require('./lib/service'),Provider=require('./lib/provider'),Engine=require('./lib/engine'),Jobs=require('./lib/jobs');
var UserError=require('./lib/error'),profile=require('./lib/profile'),latency=require('./lib/latency'),settings=require('./lib/settings'),Updater=require('./lib/update').Updater;
var DATA='/media/developer/sota-lg',STATE='/tmp/sota-lg-jobs';
var store=new storage.Store(DATA),session=new storage.Store('/tmp/sota-lg-session'),engine=new Engine(__dirname,DATA),jobs=new Jobs(STATE,__filename);
var measurements=new Jobs('/tmp/sota-lg-latency',path.join(__dirname,'measure.js')),updater=new Updater(store,__dirname);
function publicMessage(e){return e instanceof UserError?e.message:'Не удалось выполнить действие. Попробуйте ещё раз.';}
function flag(l){var name=l.flag&&/^[a-z0-9-]+\.(svg|png)$/.test(l.flag)?l.flag.replace(/\.svg$/,'.png'):'globe.png';return fs.existsSync(path.join(__dirname,'flags',name))?name:'globe.png';}
async function status(){
 jobs.recover();measurements.recover();
 var job=jobs.read(),state=await engine.status(),cached=store.get('locations',{items:[]}),prefs=store.get('prefs',{}),active=store.get('active',null),metrics=store.get('latency',{});
 if(metrics.schemaVersion!==2)metrics={byId:{}};
 var sorted=latency.sorted(cached.items,metrics),selected=profile.resolve(sorted,prefs.selected),activeMetric=metrics.active&&metrics.active.digest===latency.digest(engine.readConfig())?metrics.active:null;
 function visible(l){if(!l)return null;var fresh=sorted.filter(function(x){return x.id===l.id;})[0]||l;var out=profile.identity(fresh);out.flag=flag(fresh);out.latencyMs=typeof fresh.latencyMs==='number'?fresh.latencyMs:null;return out;}
 var shownActive=visible(active);if(shownActive){shownActive.bestLatencyMs=shownActive.latencyMs;shownActive.latencyMs=activeMetric?activeMetric.ms:null;}
 return {running:state.running,busy:jobs.busy(),message:job.message||state.message||'',active:shownActive,selected:visible(selected||prefs.selected),
 locations:sorted.map(visible),updatedAt:cached.updatedAt||null,version:updater.info.version,measuring:measurements.busy(),latencyUpdatedAt:metrics.updatedAt||null,activeLatencyUpdatedAt:activeMetric&&activeMetric.updatedAt||null,
 settings:settings.get(store),updates:updater.state(),split:require('./lib/split').view(store)};
}
async function execute(job,progress){
 if(job.action==='toggle-split'||job.action==='toggle-kinopoisk')return new Service(store,null,engine,progress).configureSplit(job.action);
 if(job.action==='choose'){return new Service(store,null,engine,progress).choose(job.id);}
 if(job.action==='toggle-autostart'||job.action==='toggle-autoUpdate'){settings.change(store,job.action.slice(7));return '';}
 if(job.action==='check-update')return updater.check(progress);
 if(job.action==='install')return updater.install(progress);
 if(job.action==='stop'){session.set('intent',{manualOff:true});return new Service(store,null,engine,progress).stop();}
 if(['connect','refresh','resume'].indexOf(job.action)<0)throw new Error('Invalid action');
 var service=new Service(store,new Provider(store.get('account',null)),engine,progress);
 if(job.action==='resume'){
  if(session.get('intent',{}).manualOff)return '';
  if(engine.readConfig()){try{var r=await engine.start();if(r.running&&!r.message)return '';}catch(_){}}
  return service.connect();
 }
 if(job.action==='connect'){session.set('intent',{manualOff:false});return service.connect();}
 var message=await service.refresh();measurements.enqueue('measure',null);return message;
}
async function main(){
 var action=process.argv[2]||'status';
 if(action==='worker'&&/^[a-f0-9]{32}$/.test(process.argv[3]||''))return jobs.work(process.argv[3],execute,publicMessage);
 if(action==='measure'||action==='measure-active')measurements.enqueue(action==='measure-active'?'active':'measure',null);
 if(['connect','stop','refresh','choose','resume','toggle-autostart','toggle-autoUpdate','check-update','install','toggle-split','toggle-kinopoisk'].indexOf(action)>=0){
  var id=Number(process.argv[3]);if(action!=='choose'||(/^\d{1,10}$/.test(process.argv[3]||'')&&Number.isInteger(id)&&id<=2147483647))jobs.enqueue(action,id);
 }
 console.log(JSON.stringify(await status()));
}
main().catch(function(){console.log(JSON.stringify({error:true,message:'Служба VPN недоступна. Откройте приложение ещё раз.'}));process.exitCode=1;});