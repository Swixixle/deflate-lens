"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const shared = require("../shared/transcript");
const { cutTurns } = require("../server/assign");
const { createJobs } = require("../server/jobs");

test("numeric fallback cannot turn zero or compound scales into another quantity", () => {
  for (const [quote, text] of [["1000000", "zero million"], ["100", "zero hundred"], ["1001000", "one thousand million"], ["2000000", "one million million"], ["1900", "nineteen ninety eight million"]]) {
    assert.equal(shared.matchQuote(quote, text), null, text + " must not match " + quote);
  }
  assert.deepEqual(shared.matchQuote("0 dollars", "zero dollars"), { tolerated: ["numbers written differently"] });
  assert.deepEqual(shared.matchQuote("125000000", "one hundred twenty five million"), { tolerated: ["numbers written differently"] });
});

test("a missing or invalid first speaker boundary cannot silently credit the prefix", () => {
  const keys = new Set(["HOST", "GUEST"]);
  const r = cutTurns("An unknown person introduces us. Welcome to the show.", [{ speaker: "HOST", start: "Welcome to the show" }], keys);
  assert.equal(r.turns[0].speaker, "UNKNOWN");
  assert.equal(r.turns.map(t => t.text).join(" "), "An unknown person introduces us. Welcome to the show.");
  const dropped = cutTurns("Welcome back. Thanks for having me. Next question.", [{ speaker: "HOST", start: "Welcome back" }, { speaker: "GUEST", start: "Thanks for having you" }, { speaker: "HOST", start: "Next question" }], keys);
  assert.equal(dropped.turns[0].speaker, "UNKNOWN", "an unlocatable switch makes the containing span uncertain");
});

test("job listings always contain string states, even with multiple jobs", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deflate-jobs-review-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const jobs = createJobs({ dataDir: dir });
  const first = jobs.start("resolve", {}, () => new Promise(() => {}));
  jobs.start("resolve", {}, () => new Promise(() => {}));
  await jobs.get(first.id);
  await Promise.all(jobs.running("resolve").map(j => jobs.get(j.id)));
  assert.deepEqual(jobs.running("resolve").map(j => j.state), ["running", "running"]);
});

const {createApp} = require("../server/app");
const {createMockAI} = require("../server/ai");
const {createResearch} = require("../server/research");
const sourceText = Array.from({length:18},(_,i)=>(i%2 ? "GUEST" : "HOST")+": Here is an argument with enough original words to read in this passage number "+i+".").join("\n");
async function fixture(t, options={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"deflate-recovery-review-"));
  const systems=[];
  async function start() {
    const app=createApp({dataDir:dir,examplesDir:dir,env:{},envPath:path.join(dir,".env"),ai:createMockAI(),research:createResearch({DEFLATE_MOCK_RESEARCH:"1"}),run:async()=>({code:1,out:""}),resolver:{locate:async()=>({kind:"episode"}),words:async()=>({ok:true,text:sourceText,title:"Recovered interview",source:{kind:"feed-transcript",url:"https://example.org/words.txt"}})},...options});
    await app.ready;const server=await new Promise(r=>{const s=app.app.listen(0,"127.0.0.1",()=>r(s));});
    const api=async(method,p,body)=>{const res=await fetch("http://127.0.0.1:"+server.address().port+p,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};};
    const close=async()=>{for(const job of app.reader.jobs.values())job.controller.abort();await Promise.all([...app.reader.jobs.values()].map(j=>j.done));await new Promise(r=>server.close(r));};
    const value={...app,api,close};systems.push(value);return value;
  }
  t.after(async()=>{for(const s of systems)await s.close();await fs.rm(dir,{recursive:true,force:true});});
  const s=await start();return {...s,restart:start};
}
async function finished(s,id) {for(let i=0;i<200;i++){const j=await s.jobs.get(id);if(j.state!=="running")return j;await new Promise(r=>setTimeout(r,5));}throw Error("fetch did not finish");}
async function startFetch(s, extra={}) {const r=await s.api("POST","/api/transcript/resolve",{url:"https://example.org/episode",...extra});assert.equal(r.status,200);await finished(s,r.data.jobId);return r.data.jobId;}

test("completed fetches survive a closed page and restart; concurrent imports and lost responses make one reading",async t=>{
  const s=await fixture(t), id=await startFetch(s,{context:{title:"My title"}});
  assert.equal((await s.api("GET","/api/transcript/engines")).data.pending[0].id,id);
  const next=await s.restart();
  assert.equal((await next.api("GET","/api/transcript/engines")).data.pending[0].id,id);
  const [a,b]=await Promise.all([next.api("POST","/api/transcript/jobs/"+id+"/consume"),next.api("POST","/api/transcript/jobs/"+id+"/consume")]);
  assert.equal(a.status,202,JSON.stringify(a));assert.equal(b.status,202);assert.equal(a.data.run.id,b.data.run.id);
  const runId=a.data.run.id;const active=next.reader.jobs.get(runId);if(active)await active.done;
  assert.equal((await next.store.listRuns()).length,1);assert.equal((await next.store.getRun(runId)).title,"My title");
  assert.equal((await next.api("GET","/api/transcript/engines")).data.pending.length,0);
  const third=await s.restart(), retry=await third.api("POST","/api/transcript/jobs/"+id+"/consume");
  assert.equal(retry.data.run.id,runId);assert.equal((await third.store.listRuns()).length,1);
});

test("an acknowledgment write failure retries the same committed run instead of duplicating it",async t=>{
  const s=await fixture(t),id=await startFetch(s),ack=s.jobs.acknowledge;
  s.jobs.acknowledge=async()=>{throw Error("simulated disk error");};
  assert.equal((await s.api("POST","/api/transcript/jobs/"+id+"/consume")).status,500);
  assert.equal((await s.store.listRuns()).length,1);
  s.jobs.acknowledge=ack;
  const r=await s.api("POST","/api/transcript/jobs/"+id+"/consume");assert.equal(r.status,202);
  assert.equal((await s.store.listRuns()).length,1);
});

test("a fetch bound to an existing run preserves edits made while it was away",async t=>{
  const s=await fixture(t),target=await s.store.createRun({},sourceText);
  const id=await startFetch(s,{targetRunId:target});
  const changed=sourceText.replace("Here is","Here was");await s.store.saveRun(target,{},changed);
  const r=await s.api("POST","/api/transcript/jobs/"+id+"/consume");assert.equal(r.status,409);assert.equal(r.data.code,"input_changed");
  assert.equal(await s.store.getTranscript(target),changed);
});

test("restarting an unfinished fetch reports interruption rather than losing it or claiming it completed",async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"deflate-interrupted-review-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const jobs=createJobs({dataDir:dir});await jobs.ready;const started=jobs.start("resolve",{url:"https://example.org/episode"},()=>new Promise(()=>{}));await jobs.get(started.id);
  const next=createJobs({dataDir:dir});await next.ready;assert.equal((await next.get(started.id)).state,"interrupted");assert.equal((await next.pending("resolve")).length,1);
});

test("ordinary repeated speech survives SRT, JSON and untimed transcription conversion",()=>{
  const {transcriptToText,cuesToText}=require("../server/podcast/transcripts");
  const srt="1\n00:00:01,000 --> 00:00:02,000\nNo.\n\n2\n00:00:03,000 --> 00:00:04,000\nNo.";
  assert.equal(transcriptToText(srt,"application/x-subrip").text,"No. No.");
  assert.equal(transcriptToText({segments:[{speaker:"Host",body:"No."},{speaker:"Host",body:"No."}]},"application/json").text,"HOST: No. No.");
  assert.equal(cuesToText([{speaker:"",text:"We have to be very careful here."},{speaker:"",text:"We have to be very careful here."}]).text,"We have to be very careful here. We have to be very careful here.");
});

test("speaker requests stay bounded even for a long single paragraph and keep all source words",()=>{
  const {assignmentChunks}=require("../server/assign");const source="INTRODUCTION\n2026\n"+"This is one long paragraph with numbers 15% and 1998. ".repeat(1500);
  const chunks=assignmentChunks(source);assert.ok(chunks.length>1);assert.ok(chunks.every(c=>c.length<=14000));assert.equal(shared.wordsOf(chunks.join(" ")),shared.wordsOf(source));
});

test("source identity is not inferred from an arbitrary URL substring or an ambiguous feed title",()=>{
  const {videoId}=require("../server/podcast/youtube"),{matchEpisode}=require("../server/podcast/feed");
  assert.equal(videoId("https://evil.test/youtube.com/watch?v=AbCdEfGhIjK"),"");
  assert.equal(videoId("https://youtube.com/watch?v=AbCdEfGhIjK"),"AbCdEfGhIjK");
  const feed={items:[{guid:"a",title:"The interview",pubDate:"2026-01-01",enclosure:{url:"https://cdn.test/audio?id=1"}},{guid:"b",title:"The interview",pubDate:"2026-01-02",enclosure:{url:"https://cdn.test/audio?id=2"}}]};
  assert.equal(matchEpisode(feed,{title:"The interview"}),null);assert.equal(matchEpisode(feed,{title:"Unrelated",pubDate:"2026-01-01"}),null);
  assert.equal(matchEpisode(feed,{enclosureUrl:"https://cdn.test/audio?id=2"}).item.guid,"b");
});

test("public-looking DNS names cannot reach a private address, and the checked address is pinned",async()=>{
  const {resolveTarget,publicAddress}=require("../server/podcast/public-fetch");let calls=0;
  await assert.rejects(resolveTarget("https://public-looking.example/feed",async()=>[{address:"127.0.0.1",family:4}]),/private network/);
  await assert.rejects(resolveTarget("https://public-looking.example/feed",async()=>[{address:"8.8.8.8",family:4},{address:"10.0.0.1",family:4}]),/private network/);
  const target=await resolveTarget("https://public-looking.example/feed",async()=>{calls++;return [{address:"8.8.8.8",family:4}];});
  const got=await new Promise((resolve,reject)=>target.lookup("public-looking.example",{},(e,a)=>e?reject(e):resolve(a)));assert.equal(got,"8.8.8.8");assert.equal(calls,1);
  for(const address of ["::1","::ffff:127.0.0.1","64:ff9b::7f00:1","192.168.0.1","169.254.169.254","2001:db8::1"])assert.equal(publicAddress(address),false,address);
});

test("the pinned transport decodes gzip and rejects redirects to private DNS targets before opening a socket",async()=>{
  const {createPublicFetch}=require("../server/podcast/public-fetch"),{PassThrough}=require("node:stream"),{EventEmitter}=require("node:events"),{gzipSync}=require("node:zlib");let sockets=0;
  const fetcher=createPublicFetch({lookup:async host=>[{address:host==="private.example"?"127.0.0.1":"8.8.8.8",family:4}],request:(url,opts,callback)=>{
    sockets++;opts.lookup(url.hostname,{},(e,address)=>{assert.ifError(e);assert.equal(address,"8.8.8.8");});
    const req=new EventEmitter();req.end=()=>{const res=new PassThrough();res.statusCode=url.pathname==="/redirect"?302:200;res.headers=url.pathname==="/redirect"?{location:"https://private.example/"}:{"content-encoding":"gzip"};callback(res);res.end(url.pathname==="/redirect"?"":gzipSync("Transcript text"));};return req;
  }});
  assert.equal(await (await fetcher("https://public.example/text")).text(),"Transcript text");
  await assert.rejects(fetcher("https://public.example/redirect"),/private network/);assert.equal(sockets,2);
});

test("stopping a fetch while DNS is pending prevents it from reaching a socket",async()=>{
  const {createPublicFetch}=require("../server/podcast/public-fetch");const ctl=new AbortController();
  const f=createPublicFetch({lookup:()=>new Promise(()=>{}),request:()=>{throw Error("must not connect");}});
  const pending=f("https://public.example/text",{signal:ctl.signal});ctl.abort();await assert.rejects(pending,{name:"AbortError"});
});

test("upgrading never automatically re-imports legacy completed fetches without a consumption record",async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"deflate-legacy-jobs-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.mkdir(path.join(dir,"jobs"));const old={id:"joblegacy123",kind:"resolve",state:"done",startedAt:"2026-10-03T00:00:00Z",finishedAt:"2026-10-03T00:01:00Z",input:{url:"https://example.org/episode"},steps:[],result:{kind:"transcript",text:sourceText}};
  await fs.writeFile(path.join(dir,"jobs",old.id+".json"),JSON.stringify(old));const jobs=createJobs({dataDir:dir});await jobs.ready;
  assert.equal((await jobs.pending("resolve")).length,0);assert.equal((await jobs.get(old.id)).result.text,sourceText);
});

test("a dismissed completed fetch cannot be consumed by a stale tab",async t=>{
  const s=await fixture(t),id=await startFetch(s);
  assert.equal((await s.api("POST","/api/transcript/jobs/"+id+"/dismiss")).status,200);
  assert.equal((await s.api("POST","/api/transcript/jobs/"+id+"/consume")).status,409);
  assert.equal((await s.store.listRuns()).length,0);
});
