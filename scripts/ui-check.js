"use strict";
/* Optional real-browser smoke check. Requires Playwright + Chromium; all generated output is labelled MOCK. */
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("node:assert/strict");
const { createApp } = require("../server/app"), { createMockAI } = require("../server/ai"), { createResearch } = require("../server/research");
const T = Array.from({length:18},(_,i)=>(i%2?"GUEST":"HOST")+": This is an argument with enough words for a quoted passage number "+i+".").join("\n");
(async()=>{
  const { chromium } = require("playwright");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deflate-browser-")), shots=path.join(__dirname,"ui-shots");fs.mkdirSync(shots,{recursive:true});
  const system=createApp({dataDir:dir,ai:createMockAI(),research:createResearch({DEFLATE_MOCK_RESEARCH:"1"})});await system.ready;
  const server=await new Promise(r=>{const s=system.app.listen(0,"127.0.0.1",()=>r(s));});
  let browser;
  const errors=[],report={};
  try{
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:"+server.address().port);await page.waitForSelector("#f-text");
    report.contextClosed=!(await page.locator("details.ctx").evaluate(d=>d.open));
    await page.locator("#f-file").setInputFiles({name:"interview.txt",mimeType:"text/plain",buffer:Buffer.from(T)});
    await page.waitForFunction(()=>document.querySelector("#f-text").value.startsWith("HOST:"));
    await page.locator("#stage-intake .btn.primary").click();
    await page.waitForFunction(()=>/Your reading is ready/.test(document.querySelector("#reading-status").textContent),null,{timeout:60000});
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
    report.exampleHeld=await page.locator(".card").count()===0 && /held/.test(await page.locator("#runView").textContent());
    // A no-key upload is saved, then continues the complete job after one key prompt.
    system.state.ai=null;await page.reload();await page.locator("#newRun").click();
    await page.fill("#f-text",T);await page.locator("#stage-intake .btn.primary").click();
    await page.waitForSelector(".keybox");
    await page.route("**/api/settings/anthropic-key",async route=>{system.state.ai=createMockAI();await route.fulfill({json:{ok:true,ai:{kind:"mock",model:"mock",mock:true}}});});
    await page.fill(".keybox input","test-only-key");await page.locator(".keybox button").click();
    await page.waitForFunction(()=>/Your reading is ready/.test(document.querySelector("#reading-status").textContent),null,{timeout:60000});
    report.keyContinued=await page.locator(".card").count()===3 && await page.locator(".keybox").count()===0;
    await page.setViewportSize({width:390,height:844});await page.locator("#lvl5").click();
    report.phoneFits=await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1);
    await page.screenshot({path:path.join(shots,"automatic-reading-phone.png"),fullPage:true});
    for(const name of ["contextClosed","processingClosed","cardDetailsClosed","sourceAccepted","exampleHeld","keyContinued","phoneFits"])assert.equal(report[name],true,name);
    assert.deepEqual(errors,[]);report.errors=errors;console.log(JSON.stringify(report,null,2));
  }finally{
    for(const job of system.reader.jobs.values())job.controller.abort();await Promise.all([...system.reader.jobs.values()].map(j=>j.done));
    if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
