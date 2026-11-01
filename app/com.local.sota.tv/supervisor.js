'use strict';
var fs=require('fs'),path=require('path'),spawn=require('child_process').spawn;
var storage=require('./lib/storage'),Engine=require('./lib/engine'),Jobs=require('./lib/jobs'),settings=require('./lib/settings'),Supervisor=require('./lib/supervisor'),Updater=require('./lib/update').Updater;
var store=new storage.Store('/media/developer/sota-lg'),session=new storage.Store('/tmp/sota-lg-session');
var engine=new Engine(__dirname,store.dir),jobs=new Jobs('/tmp/sota-lg-jobs',path.join(__dirname,'backend.js')),updater=new Updater(store,__dirname);
function command(bin,args){return new Promise(function(resolve){var p=spawn(bin,args,{stdio:'ignore'});p.on('error',function(){resolve(false);});p.on('close',function(code){resolve(code===0);});});}
var monitor=new Supervisor({now:Date.now,settings:function(){return settings.get(store);},paused:function(){return session.get('intent',{}).manualOff===true;},
 updating:function(){return command('flock',['-n','/tmp/sota-lg/update.lock','/bin/true']).then(function(free){return !free;});},lastCheck:function(){return updater.state().checkedAt||0;},
 busy:function(){jobs.recover();return jobs.busy();},ready:function(){return !!updater.state().available;},enqueue:function(action){return jobs.enqueue(action,null);},
 status:function(){return engine.status();},hasConfig:function(){return !!engine.readConfig();},startCached:function(){return engine.start();},healthy:function(){return engine.healthy();},
 networkReady:function(){return command('/bin/sh',['-c','ip route show default | grep -q default']);}});
async function main(){while(true){
 if(await monitor.d.updating()){await new Promise(function(resolve){setTimeout(resolve,1000);});continue;}
 if(!fs.existsSync(path.join(__dirname,'appinfo.json')))return;
 if(storage.read(path.join(__dirname,'release-info.json'),{}).version!==updater.info.version){process.exitCode=73;return;}
 try{await monitor.tick();}catch(_){}await new Promise(function(resolve){setTimeout(resolve,10000);});
}}
main().catch(function(){process.exitCode=1;});
