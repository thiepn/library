#!/usr/bin/env node
// N1E disposable-only PostgreSQL witness. No external DB URL or credential accepted.
// Creates, tests, and destroys a fresh local UNIX-socket-only cluster.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { randomInt } from 'node:crypto';

const bin = (name) => process.env.N1E_PG_BIN_DIR ? join(process.env.N1E_PG_BIN_DIR, name) : name;
for (const name of ['initdb','pg_ctl','psql']) {
  const p = spawnSync(bin(name), ['--version'], {encoding:'utf8'});
  if (p.status !== 0) {
    console.error('NOT_TESTED: missing local binary ' + name + '; no DB contacted.');
    process.exit(2);
  }
}
if (process.getuid?.() === 0) throw new Error('Must run as unprivileged OS user.');
const base=mkdtempSync(join(tmpdir(),'thiepn-n1e-isolated-'));
chmodSync(base,0o700);
const data=join(base,'pgdata'), socket=join(base,'socket'), port=randomInt(23000,46000);
mkdirSync(socket,{mode:0o700});
const env={PATH:process.env.PATH ?? '',HOME:process.env.HOME ?? base,
  PGHOST:socket,PGPORT:String(port),PGDATABASE:'postgres',PGUSER:userInfo().username,
  PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5'};
const cmd=(name,args,options={})=>{
  const p=spawnSync(bin(name),args,{env,encoding:'utf8',timeout:45000,...options});
  if(p.status!==0) throw new Error(name+': '+(p.error?.message??p.stderr??p.stdout).slice(0,2000));
  return p.stdout.trim();
};
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',env.PGUSER,'-d','postgres'];
const sql=(statement, expectedError)=>{
  const p=spawnSync(bin('psql'),[...args,'-c',statement],{env,encoding:'utf8',timeout:45000});
  if(expectedError){
    if(p.status===0 || !(p.stderr??'').includes(expectedError))
      throw new Error('Expected '+expectedError+'; got '+(p.stderr??p.stdout).slice(0,1000));
  }else if(p.status!==0) throw new Error('SQL: '+(p.stderr??p.stdout).slice(0,1600));
  return p.stdout.trim();
};
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const user={
  a:'11111111-1111-4111-8111-111111111111',
  b:'22222222-2222-4222-8222-222222222222',
  noWrite:'33333333-3333-4333-8333-333333333333'
};
const session=(identity,command,claims={})=>'BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('+
  quote('request.jwt.claim.sub')+','+quote(identity?user[identity]:'')+',true); SELECT set_config('+
  quote('request.jwt.claims')+','+quote(JSON.stringify(claims))+',true); '+command+' COMMIT;';
const bookNote={schemaVersion:1,id:'synthetic-note',workId:'synthetic-book',scope:'reading-note',
  title:'Synthetic',bodyMarkdown:'No private records',sourceAnnotations:[],revision:1,
  createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z'};
const state=(version,device,notes=[bookNote])=>JSON.stringify({
  format:'thiepn-library-backup',schemaVersion:version,exportedAt:'2026-10-12T00:00:00Z',
  state:{main:{schemaVersion:1,...(version===2?{noteDocuments:{schemaVersion:1,records:notes}}:{})}},device
});
const call=(revision,value)=>'SELECT (public.sync_thiepn_library_state('+
  (revision===null?'NULL':revision)+','+quote(value)+'::jsonb,'+quote('n1e-disposable')+
  ','+quote('synthetic-device')+',NULL))->>\'revision\';';
const assertRows=(id,n)=>sql(session(id,
  'DO $test$ BEGIN IF (SELECT count(*) FROM public.library_sync_state)<>'+n+
  " THEN RAISE EXCEPTION 'RLS_ISOLATION_FAILURE'; END IF; END $test$;"));
const parallel=(command)=>new Promise(resolveResult=>{
  const p=spawn(bin('psql'),[...args,'-c',command],{env});
  let stderr='';
  p.stderr.on('data',b=>stderr+=b.toString());
  p.on('close',status=>resolveResult({status,stderr}));
  p.on('error',e=>resolveResult({status:-1,stderr:String(e)}));
});
let started=false;
try{
  cmd('initdb',['-D',data,'-A','trust','-U',env.PGUSER,'--no-instructions']);
  cmd('pg_ctl',['-D',data,'-o',"-c listen_addresses='' -k "+socket+' -p '+port,'-w','start']);
  started=true;
  sql([
    'CREATE ROLE anon NOLOGIN','CREATE ROLE authenticated NOLOGIN','CREATE SCHEMA auth',
    "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $f$",
    "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $f$",
    "CREATE FUNCTION public.is_thiepn_first_party_oauth_client_for_app(text) RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT $1='library' AND (auth.jwt()->>'client_id')='n1e-firstparty' $f$",
    'CREATE TABLE public.library_sync_state(user_id uuid PRIMARY KEY,revision bigint NOT NULL,state jsonb NOT NULL,app_version text,device_id text,client_updated_at timestamptz,updated_at timestamptz DEFAULT now())',
    'CREATE TABLE public.account_app_connections(user_id uuid,app_slug text,status text)',
    'CREATE TABLE public.account_app_grants(user_id uuid,app_slug text,permission_id text,status text)',
    'CREATE TABLE public.library_file_deletion_authorizations(user_id uuid,expires_at timestamptz)',
    'ALTER TABLE public.library_sync_state ENABLE ROW LEVEL SECURITY',
    'GRANT USAGE ON SCHEMA public,auth TO authenticated',
    'GRANT SELECT ON public.library_sync_state TO authenticated',
    // In production these relations have their own read/RLS contracts; the isolated
    // fixture grants read so the latest Library RLS policy can evaluate its predicates.
    'GRANT SELECT ON public.account_app_connections,public.account_app_grants TO authenticated',
    "INSERT INTO public.account_app_connections VALUES ('"+user.a+"','library','connected'),('"+user.b+"','library','connected'),('"+user.noWrite+"','library','connected')",
    "INSERT INTO public.account_app_grants VALUES ('"+user.a+"','library','app_data.read','granted'),('"+user.a+"','library','app_data.write','granted'),('"+user.b+"','library','app_data.read','granted'),('"+user.b+"','library','app_data.write','granted'),('"+user.noWrite+"','library','app_data.read','granted')"
  ].join(';\n')+';');
  // Execute the actual final pre-N1C SSO/RLS source migration, then N1E RPC.
  const migrations=resolve('supabase/migrations');
  cmd('psql',[...args,'-f',join(migrations,'20261006202154_library_first_party_sso_access.sql')]);
  cmd('psql',[...args,'-f',join(migrations,'20261012093000_library_notebook_v2_downgrade_guard.sql')]);
  sql(session('a',call(null,state(1,'a-v1'))));
  assertRows('a',1);assertRows('b',0);
  sql(session('a',call(1,state(2,'a-v2'))));
  sql(session('a',call(2,state(1,'v1-downgrade'))),'LIBRARY_SYNC_CONFLICT_OR_VERSION_DOWNGRADE');
  sql(session('a',call(2,state(2,'duplicate',[bookNote,bookNote]))),'LIBRARY_V2_NOTEBOOK_DUPLICATE_ID');
  sql(session('a',call(2,state(2,'missing-body',[{...bookNote,bodyMarkdown:undefined}]))),'LIBRARY_V2_NOTEBOOK_RECORD_INVALID');
  sql(session('a',call(2,state(2,'a-v2-rev3'))));
  sql(session('a',call(3,state(2,'firstparty')),{client_id:'n1e-firstparty'}));
  sql(session('a',call(4,state(2,'delegated')),{client_id:'unapproved'}),'DELEGATED_OAUTH_RAW_DATA_DENIED');
  sql(session('a',call(4,state(2,'anonymous')),{is_anonymous:true}),'ANONYMOUS_IDENTITY_NOT_SUPPORTED');
  sql(session(null,call(4,state(2,'no-user'))),'AUTH_REQUIRED');
  sql("INSERT INTO public.library_file_deletion_authorizations VALUES ('"+user.a+"',now()+interval '1 hour')");
  sql(session('a',call(4,state(2,'deletion-lock'))),'LIBRARY_DELETION_IN_PROGRESS');
  sql("DELETE FROM public.library_file_deletion_authorizations WHERE user_id='"+user.a+"'");
  sql(session('noWrite',call(null,state(2,'no-write'))),'LIBRARY_WRITE_NOT_GRANTED');
  sql("DELETE FROM public.account_app_grants WHERE user_id='"+user.a+"' AND permission_id='app_data.read'");
  assertRows('a',0);
  sql("INSERT INTO public.account_app_grants VALUES ('"+user.a+"','library','app_data.read','granted')");
  assertRows('a',1);
  sql(session('b',call(null,state(2,'b'))));
  assertRows('b',1);assertRows('a',1);
  const pair=await Promise.all([
    parallel(session('a','SELECT pg_sleep(0.2); '+call(4,state(2,'device1')))),
    parallel(session('a','SELECT pg_sleep(0.2); '+call(4,state(2,'device2')))),
  ]);
  if(pair.filter(x=>x.status===0).length!==1 ||
    pair.filter(x=>x.status!==0 && x.stderr.includes('LIBRARY_SYNC_CONFLICT_OR_VERSION_DOWNGRADE')).length!==1)
    throw new Error('CAS race should have one winner and one stale-revision rejection: '+JSON.stringify(pair));
  const rev=sql("SELECT revision FROM public.library_sync_state WHERE user_id='"+user.a+"'");
  if(rev!=='5')throw new Error('Wrong final revision after competing writes: '+rev);
  console.log('PASS N1E isolated RLS/SSO/deletion/CAS/downgrade/concurrent-device witness');
  console.log('Limit: synthetic auth provider and permissions. No production access or human review.');
}finally{
  try{if(started)cmd('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}
  finally{rmSync(base,{recursive:true,force:true});}
}
