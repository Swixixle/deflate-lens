"use strict";
/* Fetch results survive a closed page. Unfinished work after a server restart is explicitly interrupted;
   completed, unclaimed results remain discoverable until a page imports or dismisses them. */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
function createJobs({ dataDir }) {
  const dir = path.join(dataDir, "jobs"), jobs = new Map();
  const view = (j, state = j.state) => ({ id:j.id, kind:j.kind, state, startedAt:j.startedAt, finishedAt:j.finishedAt || "", input:j.input, steps:j.steps, progress:j.progress || null, result:state === "done" ? j.result : null, resultKind:j.resultKind || "", error:j.error || null, runId:j.runId || "", acknowledgedAt:j.acknowledgedAt || "" });
  async function persist(v) { await fs.mkdir(dir,{recursive:true}); const tmp=path.join(dir,v.id+"."+crypto.randomBytes(6).toString("hex")+".tmp"); await fs.writeFile(tmp,JSON.stringify(v,null,2)); await fs.rename(tmp,path.join(dir,v.id+".json")); }
  const ready = (async () => {
    await fs.mkdir(dir,{recursive:true});
    for (const name of await fs.readdir(dir)) {
      if (!/^job[A-Za-z0-9]+\.json$/.test(name)) continue;
      let j; try { j=JSON.parse(await fs.readFile(path.join(dir,name),"utf8")); } catch(e) { continue; }
      if (j.id+".json" !== name) continue;
      // 0.11.0 saved finished jobs but never recorded whether the page had imported them.
      // Keep their results, but do not automatically create duplicate readings on upgrade.
      if (!("acknowledgedAt" in j)) {
        j.acknowledgedAt = j.finishedAt || new Date().toISOString();
        j.recoveryNote = "Legacy fetch: prior import status was not recorded; automatic re-import is disabled.";
        await persist(j);
      }
      if (j.state === "running") { j.state="interrupted"; j.error={code:"interrupted",message:"The server stopped before the fetch finished. Start the link again."}; await persist(j); }
      if (!j.resultKind) j.resultKind = j.result && j.result.kind || "";
      delete j.result; j.diskOnly=true; jobs.set(j.id,j);
    }
  })();
  function start(kind,input,runner,opts) {
    const ctl=new AbortController();
    const j={id:"job"+Date.now().toString(36)+crypto.randomBytes(3).toString("hex"),kind,input:input||null,state:"running",startedAt:new Date().toISOString(),steps:[],progress:null,result:null,error:null,ctl};
    // Do not write or run the new job until recovery has finished scanning the old files.
    const ctx={signal:ctl.signal,step:(name,note)=>{j.steps.push({at:new Date().toISOString(),name,note:String(note||"")}); if(j.steps.length>200)j.steps.splice(0,j.steps.length-200);},progress:p=>{j.progress=Object.assign({at:new Date().toISOString()},p||{});}};
    jobs.set(j.id,j);
    j.saved=ready.then(()=>persist(view(j)));
    const finish=async(state,result,error)=>{
      if(ctl.signal.aborted){state="cancelled";result=null;}
      // what the job held only for itself (an uploaded recording) is let go however the job ended
      if(opts && opts.onEnd){ try { await opts.onEnd(); } catch(e){} }
      j.result=result; j.resultKind=result && result.kind || ""; j.error=error; j.finishedAt=new Date().toISOString();
      try { await persist(view(j,state)); j.state=state; j.result=null; j.diskOnly=true; }
      catch(e){j.state="error";j.error={code:"save_failed",message:"Could not save this fetch: "+e.message};}
    };
    j.done=j.saved.then(()=>{if(ctl.signal.aborted)throw Object.assign(new Error("Stopped"),{code:"cancelled"});return runner(ctx);}).then(result=>finish("done",result,null),e=>finish(ctl.signal.aborted || e.code==="cancelled"?"cancelled":"error",null,{message:String(e.message||e),code:e.code||""}));
    return view(j);
  }
  async function get(id){
    await ready; if(!/^[A-Za-z0-9]+$/.test(String(id||"")))return null;
    const j=jobs.get(id); if(j && j.saved)await j.saved.catch(()=>{});
    if(j && !j.diskOnly)return view(j);
    try { return JSON.parse(await fs.readFile(path.join(dir,id+".json"),"utf8")); } catch(e){if(e.code==="ENOENT")return null;throw e;}
  }
  function running(kind){return [...jobs.values()].filter(j=>j.state==="running"&&(!kind||j.kind===kind)).map(j=>view(j));}
  async function pending(kind){await ready;return [...jobs.values()].filter(j=>(j.state==="running"||j.state==="done"||j.state==="interrupted")&&!j.acknowledgedAt&&(!kind||j.kind===kind)).map(j=>view(j)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));}
  function cancel(id){const j=jobs.get(id);if(!j)return false;if(j.state==="running"&&j.ctl){j.ctl.abort();return true;}return false;}
  async function acknowledge(id,runId){const current=await get(id);if(!current)return false;const v=Object.assign(current,{acknowledgedAt:new Date().toISOString(),runId:runId||current.runId||""});await persist(v);const j=jobs.get(id);if(j)Object.assign(j,{acknowledgedAt:v.acknowledgedAt,runId:v.runId});return true;}
  return {start,get,cancel,running,pending,acknowledge,ready,dir};
}
module.exports={createJobs};
