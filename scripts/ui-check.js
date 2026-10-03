"use strict";
/* Optional real-browser smoke check. Requires Playwright + Chromium; all generated output is labelled MOCK. */
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("node:assert/strict");
const { createApp } = require("../server/app"), { createMockAI } = require("../server/ai"), { createResearch } = require("../server/research");
const ready=page=>page.waitForFunction(()=>{const s=document.querySelector("#reading-status");return s&&/Your reading is ready/.test(s.textContent);},null,{timeout:60000});
const T = Array.from({length:18},(_,i)=>(i%2?"GUEST":"HOST")+": This is an argument with enough words for a quoted passage number "+i+".").join("\n");
(async()=>{
  const { chromium } = require("playwright");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deflate-browser-")), shots=path.join(__dirname,"ui-shots");fs.mkdirSync(shots,{recursive:true});
  // the transcript chain runs against an injected fetch: a feed with one published transcript and one episode without,
  // YouTube refusing the built-in reader, no yt-dlp, no engine installed
  const FEED='<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>UI Check Show</title><link>https://show.test/</link>'+
    '<item><title>With a transcript</title><guid>g-yes</guid><pubDate>Thu, 02 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>600</itunes:duration><enclosure url="https://cdn.test/yes.mp3" type="audio/mpeg"/><podcast:transcript url="https://show.test/yes.vtt" type="text/vtt"/></item>'+
    '<item><title>Without a transcript</title><guid>g-no</guid><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate><itunes:duration>5400</itunes:duration><enclosure url="https://cdn.test/no.mp3" type="audio/mpeg"/></item></channel></rss>';
  const VTT="WEBVTT\n\n"+T.split("\n").map((l,i)=>{const [sp,...rest]=l.split(": ");return "00:00:"+String(i).padStart(2,"0")+".000 --> 00:00:"+String(i+1).padStart(2,"0")+".000\n<v "+sp+">"+rest.join(": ")+"\n";}).join("\n");
  const fakeFetch=async url=>{const u=String(url);const res=(status,body,type)=>({status,url:u,headers:{get:k=>/content-type/i.test(k)?type||"text/plain":null},text:async()=>typeof body==="string"?body:JSON.stringify(body)});
    if(u==="https://show.test/feed.xml")return res(200,FEED,"application/rss+xml");if(u==="https://slow.test/feed.xml"){await new Promise(r=>setTimeout(r,4000));return res(200,FEED.replace("UI Check Show","Slow Show"),"application/rss+xml");}if(u==="https://show.test/yes.vtt")return res(200,VTT,"text/vtt");
    if(/youtubei\/v1\/player/.test(u))return res(200,{playabilityStatus:{status:"LOGIN_REQUIRED",reason:"Sign in to confirm you’re not a bot"}},"application/json");if(/youtube\.com\/oembed/.test(u))return res(200,{title:"A video"},"application/json");
    return res(404,"nope");};
  const system=createApp({dataDir:dir,ai:createMockAI(),research:createResearch({DEFLATE_MOCK_RESEARCH:"1"}),fetch:fakeFetch,run:async()=>({code:-1,out:"",err:"ENOENT"}),env:{},envPath:path.join(dir,".env")});await system.ready;
  const server=await new Promise(r=>{const s=system.app.listen(0,"127.0.0.1",()=>r(s));});
  let browser;
  const errors=[],report={};
  try{
    browser=await chromium.launch({headless:true, ...(process.env.DEFLATE_CHROMIUM_EXECUTABLE ? {executablePath:process.env.DEFLATE_CHROMIUM_EXECUTABLE} : {})});const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:"+server.address().port);await page.waitForSelector("#f-text");
    report.contextClosed=!(await page.locator("details.ctx").evaluate(d=>d.open));
    await page.locator("#f-file").setInputFiles({name:"interview.txt",mimeType:"text/plain",buffer:Buffer.from(T)});
    await page.waitForFunction(()=>document.querySelector("#f-text").value.startsWith("HOST:"));
    await page.locator("#stage-intake .btn.primary").click();
    await ready(page);
    report.cards=await page.locator(".card").count();assert.equal(report.cards,3);
    report.processingClosed=!(await page.locator(".processing-record").evaluate(d=>d.open));
    report.cardDetailsClosed=!(await page.locator(".card details.more").first().evaluate(d=>d.open));
    report.overview=await page.locator("#stage-patterns .pattern").count();assert.equal(report.overview,1);
    const card=page.locator(".card").first();
    await card.locator("header button:has-text('Fifth grade')").click();assert.equal(await card.getAttribute("data-level"),"5");
    report.topLevelButtons=await card.locator("header button").allTextContents();
    await page.screenshot({path:path.join(shots,"automatic-reading-desktop.png"),fullPage:true});
    // Sources are available from a small chip; every record decision remains optional.
    await card.locator(".claim .chip-ev:has-text('Searched')").click();
    assert.ok(await card.locator(".chip-panel a[href^='http']").count());
    await card.locator("details.more > summary").click();
    await card.locator("button:has-text('Accept as a source')").first().click();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll(".card .chip-ev")).some(x=>/Sources · 1/.test(x.textContent)));
    report.sourceAccepted=true;
    // Normal reading hides the supplied pilot until it has passed preparation.
    await page.locator("#runList button").filter({hasText:"example"}).first().click();
    await page.waitForFunction(()=>{const v=document.querySelector("#runView");return v&&/example/i.test(v.textContent)&&!/Your reading is ready/.test((document.querySelector("#reading-status")||{}).textContent||"");},null,{timeout:20000}).catch(()=>{});
    report.exampleHeld=await page.locator(".card").count()===0 && /held/.test(await page.locator("#runView").textContent());
    if(!report.exampleHeld)console.error("exampleHeld debug:",await page.locator(".card").count(),(await page.locator("#runView").textContent()).slice(0,600));
    // A podcast feed link: the episode list appears; picking the episode with a published transcript fetches it and
    // the reading starts by itself, with the origin recorded on the run.
    await page.locator("#newRun").click();await page.fill("#f-text","https://show.test/feed.xml");
    report.linkWording=/find its transcript/.test(await page.textContent("#f-kind"));
    await page.locator("#stage-intake .btn.primary").click();
    await page.waitForSelector("#stage-intake .episodes .btn.ep",{timeout:20000});
    report.episodeList=await page.locator("#stage-intake .episodes .btn.ep").count();assert.equal(report.episodeList,2);
    report.episodeListMarksTranscript=/transcript published/.test(await page.locator("#stage-intake .episodes .btn.ep").first().textContent());
    await page.locator("#stage-intake .episodes .btn.ep").first().click();
    await ready(page);
    report.chainCards=await page.locator(".card").count();assert.equal(report.chainCards,3);
    const chainRun=await page.evaluate(()=>fetch("/api/runs/"+location.hash.slice(5)).then(r=>r.json()));
    report.chainOrigin=chainRun.run.import&&chainRun.run.import.source&&chainRun.run.import.source.kind==="feed-transcript"&&/UI Check Show/.test(chainRun.run.sourceLabel)&&chainRun.run.sourceUrl==="https://show.test/feed.xml";
    if(!report.chainOrigin)console.error("chainOrigin debug:",JSON.stringify({import:chainRun.run.import,sourceLabel:chainRun.run.sourceLabel,sourceUrl:chainRun.run.sourceUrl,intake:chainRun.run.intake}));
    report.chainIntakeRecord=chainRun.run.intake&&chainRun.run.intake.source==="transcript-chain";
    await page.screenshot({path:path.join(shots,"transcript-chain-reading.png"),fullPage:true});
    // The episode without one: every step reported, then the one-time engine choice; a bad Deepgram key is refused.
    await page.locator("#newRun").click();await page.fill("#f-text","https://show.test/feed.xml");await page.locator("#stage-intake .btn.primary").click();
    await page.waitForSelector("#stage-intake .episodes .btn.ep",{timeout:20000});await page.locator("#stage-intake .episodes .btn.ep").nth(1).click();
    await page.waitForSelector("#stage-intake .enginebox",{timeout:20000});
    const body0=await page.textContent("#stage-intake .body");
    report.noTranscriptSteps=/feed transcript: the feed has no transcript/.test(body0)&&/youtube search:.*title-only search cannot establish/.test(body0);
    report.engineChoiceOffered=/can be transcribed\. Choose once/.test(body0)&&(await page.locator("#stage-intake .enginebox button:has-text('Install local transcription')").count())===1&&(await page.locator("#stage-intake .enginebox input[type=password]").count())===1;
    await page.locator("#stage-intake .enginebox").screenshot({path:path.join(shots,"engine-choice.png")});
    await page.fill("#stage-intake .enginebox input[type=password]","short");await page.locator("#stage-intake .enginebox button:has-text('Save key and transcribe')").click();
    await page.waitForFunction(()=>/does not look like a Deepgram API key/.test(document.querySelector("#stage-intake .body").textContent),null,{timeout:10000});
    report.badDeepgramKeyRefused=!fs.existsSync(path.join(dir,".env"))||!fs.readFileSync(path.join(dir,".env"),"utf8").includes("short");
    report.linkNotSavedAsRun=(await page.evaluate(()=>fetch("/api/runs").then(r=>r.json()).then(l=>l.length)))===3; // example + upload + chain; the failed pick saved nothing
    // A YouTube link whose captions cannot be read gets an account of what was tried, not a fake reading.
    await page.locator("#newRun").click();await page.fill("#f-text","https://www.youtube.com/watch?v=QBEZhjnZTks");await page.locator("#stage-intake .btn.primary").click();
    await page.waitForFunction(()=>/not a bot|paste the transcript/i.test(document.querySelector("#stage-intake .body").textContent),null,{timeout:20000});
    report.youtubeHonest=/yt-dlp.*not installed/.test(await page.textContent("#stage-intake .body"));
    // A fetch that was running before the page opened (a reload during a long transcription) is picked up and finishes
    // the same way; the person does not lose it and does not start it twice.
    const slow=await page.evaluate(()=>fetch("/api/transcript/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://slow.test/feed.xml",guid:"g-yes"})}).then(r=>r.json()));
    await page.reload();
    await page.waitForFunction(()=>/Still finding the transcript/.test((document.querySelector("#stage-intake .body")||{}).textContent||""),null,{timeout:10000}).catch(async e=>{console.error("resume debug:",JSON.stringify(slow),await page.evaluate(()=>fetch("/api/transcript/engines").then(r=>r.json())),(await page.locator("#stage-intake").textContent()).slice(0,300));throw e;});
    report.resumedJob=await page.evaluate(()=>document.querySelector("#f-text").value)==="https://slow.test/feed.xml";
    await ready(page);
    report.resumedCards=await page.locator(".card").count()===3&&/Slow Show/.test(await page.locator("#runView").textContent());
    report.resumedOnce=(await page.evaluate(()=>fetch("/api/transcript/engines").then(r=>r.json()))).running.length===0&&!!slow.jobId;
    // Return only after the server has finished; an old remembered run must not hide the fetch.
    const rootURL="http://127.0.0.1:"+server.address().port;
    const closed=await page.evaluate(()=>fetch("/api/transcript/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://show.test/feed.xml",guid:"g-yes"})}).then(r=>r.json()));
    await page.goto("about:blank");
    for(let n=0;n<100;n++){if((await system.jobs.get(closed.jobId)).state!=="running")break;await new Promise(r=>setTimeout(r,20));}
    const beforeClosed=(await system.store.listRuns()).length;
    await page.goto(rootURL);await ready(page);
    report.completedWhileClosed=(await system.store.listRuns()).length===beforeClosed+1 && (await system.jobs.get(closed.jobId)).runId===await page.evaluate(()=>location.hash.slice(5));
    // Both pages race to import one finished fetch; each must open the same saved reading.
    await page.goto("about:blank");
    const raced=await fetch(rootURL+"/api/transcript/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://show.test/feed.xml",guid:"g-yes"})}).then(r=>r.json());
    for(let n=0;n<100;n++){if((await system.jobs.get(raced.jobId)).state!=="running")break;await new Promise(r=>setTimeout(r,20));}
    const beforeRace=(await system.store.listRuns()).length, other=await page.context().newPage();
    const engineReplies=[];
    await context.route("**/api/transcript/engines",async route=>{
      const response=await route.fetch();engineReplies.push({route,response});
      if(engineReplies.length===2)await Promise.all(engineReplies.map(x=>x.route.fulfill({response:x.response})));
    });
    await Promise.all([page.goto(rootURL),other.goto(rootURL)]);
    try { await Promise.all([ready(page),ready(other)]); } catch(e) { console.error("two-tab debug",await page.locator("#runView").textContent(),await other.locator("#runView").textContent());throw e; }
    await context.unroute("**/api/transcript/engines");
    const racedId=(await system.jobs.get(raced.jobId)).runId;
    report.twoTabsOneImport=(await system.store.listRuns()).length===beforeRace+1 && await page.evaluate(()=>location.hash.slice(5))===racedId && await other.evaluate(()=>location.hash.slice(5))===racedId;
    await other.close();
    // A transcript with no speaker labels reads as Speaker unknown; naming the speakers (under Add context) labels
    // the turns with the model, says so, and reads again by itself.
    await page.locator("#newRun").click();
    await page.fill("#f-text",Array.from({length:10},(_,i)=>"This is paragraph "+i+" of a transcript made from audio, with enough words in it to be quoted by a card, mentioning "+(i%2?"my book":"the show")+".").join("\n\n"));
    await page.locator("#stage-intake .btn.primary").click();await ready(page);
    report.unlabeledReads=/Speaker unknown/.test(await page.locator(".card").first().textContent());
    report.nameBoxBuried=!(await page.locator(".namebox").isVisible());
    await page.locator("#stage-intake > header").click();await page.locator("details.ctx > summary").click();
    report.nameBoxBuried=report.nameBoxBuried&&(await page.locator(".namebox").isVisible());
    await page.fill(".namebox input","Joe Rogan, Jordan Peterson");await page.locator(".namebox button").click();
    await page.waitForFunction(()=>/assigned by the model/.test((document.querySelector("#stage-prov")||{}).textContent||""),null,{timeout:60000});
    await ready(page);
    const named=await page.evaluate(()=>fetch("/api/runs/"+location.hash.slice(5)).then(r=>r.json()));
    report.namedSpeakers=named.run.provenance.labelsOrigin==="model"&&named.run.provenance.assignment.named===10&&/^JOE ROGAN: /.test(named.transcript)&&named.passages.every(p=>p.readingGate.status==="ready");
    report.namedOnCard=/Joe Rogan/.test(await page.locator(".card").first().textContent())&&!/Speaker unknown/.test(await page.locator(".card").first().textContent());
    await page.locator(".card").first().locator("header button:has-text('Preparation')").click();
    report.namedSaidSo=/assigned by the model from the words alone/.test(await page.locator(".card").first().textContent());
    await page.screenshot({path:path.join(shots,"named-speakers.png"),fullPage:true});
    // A no-key upload is saved, then continues the complete job after one key prompt.
    system.state.ai=null;await page.reload();await page.locator("#newRun").click();
    await page.fill("#f-text",T);await page.locator("#stage-intake .btn.primary").click();
    await page.waitForSelector(".keybox");
    await page.route("**/api/settings/anthropic-key",async route=>{system.state.ai=createMockAI();await route.fulfill({json:{ok:true,ai:{kind:"mock",model:"mock",mock:true}}});});
    await page.fill(".keybox input","test-only-key");await page.locator(".keybox button").click();
    await ready(page);
    report.keyContinued=await page.locator(".card").count()===3 && await page.locator(".keybox").count()===0;
    await page.setViewportSize({width:390,height:844});await page.locator("#lvl5").click();
    report.phoneFits=await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1);
    await page.screenshot({path:path.join(shots,"automatic-reading-phone.png"),fullPage:true});
    for(const name of ["contextClosed","processingClosed","cardDetailsClosed","sourceAccepted","exampleHeld","linkWording","episodeListMarksTranscript","chainOrigin","chainIntakeRecord","noTranscriptSteps","engineChoiceOffered","badDeepgramKeyRefused","linkNotSavedAsRun","youtubeHonest","resumedJob","resumedCards","resumedOnce","unlabeledReads","nameBoxBuried","namedSpeakers","namedOnCard","namedSaidSo","keyContinued","phoneFits","completedWhileClosed","twoTabsOneImport"])assert.equal(report[name],true,name);
    assert.deepEqual(errors,[]);report.errors=errors;console.log(JSON.stringify(report,null,2));
  }finally{
    for(const job of system.reader.jobs.values())job.controller.abort();await Promise.all([...system.reader.jobs.values()].map(j=>j.done));
    if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
