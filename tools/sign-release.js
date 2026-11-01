'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const [keyFile,packageFile,packageUrl,outputFile]=process.argv.slice(2);
if(!keyFile||!packageFile||!packageUrl||!outputFile)throw new Error('Usage: node sign-release.js PRIVATE_KEY PACKAGE HTTPS_PACKAGE_URL OUTPUT_JSON');
const root=path.resolve(__dirname,'..'),info=JSON.parse(fs.readFileSync(path.join(root,'app/com.local.sota.tv/release-info.json'))),bytes=fs.readFileSync(packageFile);
const release={schema:1,appId:'com.local.sota.tv',platform:'webos-5-armv7',version:info.version,minClientVersion:'1.2.0',upstreamBaseVersion:info.upstreamBaseVersion,
 createdAt:new Date().toISOString(),package:{url:packageUrl,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},
 notes:'Кинопоиск напрямую, точнее измерения отклика, меньше фоновой нагрузки и возврат к домашней карусели.'};
const payload=Buffer.from(JSON.stringify(release)),signer=crypto.createSign('RSA-SHA256');signer.update(payload);
fs.writeFileSync(outputFile,JSON.stringify({payload:payload.toString('base64'),signature:signer.sign(fs.readFileSync(keyFile),'base64')})+'\n');
console.log(JSON.stringify({version:release.version,sha256:release.package.sha256,size:bytes.length,signed:true}));
