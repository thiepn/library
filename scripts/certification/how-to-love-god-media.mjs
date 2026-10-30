// Read-only acquisition of exactly seven immutable release media objects.
// No credentials, secrets, release writes or fallback to unverified imagery.
// Store bytes only in GitHub runner temp; retain only hashes/diagnostics.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const release=await readFile('src/publications/releases/how-to-love-god/1.1.0.yaml','utf8');
const assets=[...release.matchAll(/^  (cover|figure0[1-6]):\r?\n    url: (\S+)\r?\n    filename: (\S+)\r?\n    mimeType: (\S+)\r?\n    sizeBytes: (\d+)\r?\n    sha256: ([0-9a-f]{64})/gm)].map(m=>({key:m[1],url:m[2],name:m[3],mime:m[4],size:Number(m[5]),sha256:m[6]}));
if(assets.length!==7)throw Error('Release manifest must contain exactly six figures and cover');
const dir=path.join(process.env.RUNNER_TEMP||'/tmp','book1-format-qa');
const out=path.join(dir,'media');await mkdir(out,{recursive:true,mode:0o700});
const status=[];
for(const a of assets){
  const url=new URL(a.url);
  if(url.protocol!=='https:'||url.hostname!=='thiepn.dev'||!url.pathname.startsWith('/library/media/works/how-to-love-god/editions/1.1.0/'))throw Error('Untrusted release media URL '+a.key);
  if(path.basename(url.pathname)!==a.name||!/^[A-Za-z0-9_.-]+$/.test(a.name))throw Error('Unexpected release media file name '+a.name);
  try{
    const resp=await fetch(a.url,{redirect:'follow',signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Book1PublicationQA/1.0'}});
    if(!resp.ok)throw Error('HTTP '+resp.status+' '+resp.statusText);
    const b=Buffer.from(await resp.arrayBuffer());
    const hash=createHash('sha256').update(b).digest('hex');
    if(b.length!==a.size||hash!==a.sha256)throw Error('Immutable release size/SHA mismatch');
    if(a.mime==='image/png'&&!b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('Invalid PNG signature');
    if(a.mime==='image/webp'&&(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP'))throw Error('Invalid WEBP signature');
    await writeFile(path.join(out,a.name),b,{mode:0o600});
    status.push({...a,verified:true});
    console.log('ORIGINAL_RELEASE_MEDIA_PASS',a.key,a.size,a.sha256);
  }catch(e){status.push({key:a.key,name:a.name,verified:false,reason:String(e.message||e).slice(0,240)});console.error('ORIGINAL_RELEASE_MEDIA_BLOCKED',a.key,String(e.message||e).slice(0,240));}
}
await writeFile(path.join(dir,'media-verification.json'),JSON.stringify(status,null,2));
if(status.some(x=>!x.verified))process.exitCode=2;
else console.log('RELEASE_MEDIA_7_OF_7_SHA256_PASS');
