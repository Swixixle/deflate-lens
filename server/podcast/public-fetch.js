"use strict";
/* A hostname check is not enough: public-looking names can resolve to localhost, or change
   between validation and connection. Resolve once, reject non-public answers, and pin the socket. */
const dns = require("node:dns/promises");
const net = require("node:net");
const http = require("node:http"), https = require("node:https");
const {Readable} = require("node:stream");
function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a,b,c] = address.split(".").map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&(b===168 || b===0&&(c===0||c===2)) || a===100&&b>=64&&b<=127 || a===198&&(b===18||b===19||b===51&&c===100) || a===203&&b===0&&c===113);
  }
  // Conservatively accept global-unicast IPv6 only; mapped, translation, local and multicast
  // ranges cannot tunnel around the IPv4 check. Documentation and benchmarking ranges are excluded.
  return net.isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:0?db8|0?0?0?2|0{0,4}):/i.test(address) && !/^2002:/i.test(address);
}
async function resolveTarget(url, lookup=dns.lookup) {
  const u=new URL(url), host=u.hostname.replace(/^\[|\]$/g,"");
  if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw new Error("Only public http(s) links without credentials can be fetched.");
  const answers=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await lookup(host,{all:true,verbatim:true});
  if(!answers.length || answers.some(a=>!publicAddress(a.address)))throw Object.assign(new Error("The address resolves to this computer or a private network."),{code:"private_address"});
  const selected=answers.find(a=>a.family===4)||answers[0];
  return {url:u, lookup:(_host,options,callback)=>{if(typeof options==="function"){callback=options;options={};}callback(null,options&&options.all?[selected]:selected.address,selected.family);}};
}
function createPublicFetch({lookup=dns.lookup, request}={}) {
  return async function publicFetch(url, options={}) {
    let current=String(url), method=options.method||"GET", body=options.body, headers={...options.headers};
    for(let hop=0;hop<=5;hop++) {
      const signal=options.signal;
      let onAbort;
      const aborted=signal ? new Promise((_,reject)=>{onAbort=()=>reject(Object.assign(new Error("Stopped"),{name:"AbortError"}));if(signal.aborted)onAbort();else signal.addEventListener("abort",onAbort,{once:true});}) : null;
      let target;try{target=await (aborted?Promise.race([resolveTarget(current,lookup),aborted]):resolveTarget(current,lookup));}finally{if(signal&&onAbort)signal.removeEventListener("abort",onAbort);}
      if(options.signal && options.signal.aborted)throw Object.assign(new Error("Stopped"),{name:"AbortError"});
      const res=await new Promise((resolve,reject)=>{
        const req=(request || (target.url.protocol==="https:"?https.request:http.request))(target.url,{method,headers,lookup:target.lookup,agent:false,signal:options.signal},resolve);
        req.on("error",reject);req.end(body);
      });
      if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location&&options.redirect!=="manual") {
        res.resume();if(hop===5)throw new Error("Too many redirects.");
        const next=new URL(res.headers.location,target.url);
        if(next.origin!==target.url.origin)for(const key of Object.keys(headers))if(/^(authorization|cookie|proxy-authorization)$/i.test(key))delete headers[key];
        if(res.statusCode===303 || [301,302].includes(res.statusCode)&&method==="POST"){method="GET";body=undefined;for(const key of Object.keys(headers))if(/^content-/i.test(key))delete headers[key];}
        current=next.href;continue;
      }
      const hs=new Headers();for(const [name,value]of Object.entries(res.headers))if(value!==undefined)hs.set(name,Array.isArray(value)?value.join(", "):String(value));
      const compression=String(res.headers["content-encoding"]||"").toLowerCase();
      const zlib=require("node:zlib");
      const decode=compression==="gzip"?zlib.createGunzip():compression==="deflate"?zlib.createInflate():compression==="br"?zlib.createBrotliDecompress():null;
      const stream=decode?res.pipe(decode):res;
      if(decode){res.on("error",e=>decode.destroy(e));hs.delete("content-encoding");hs.delete("content-length");}
      const empty=[204,205,304].includes(res.statusCode)||method==="HEAD";if(empty)res.resume();
      const response=new Response(empty?null:Readable.toWeb(stream),{status:res.statusCode,headers:hs});
      Object.defineProperty(response,"url",{value:target.url.href});return response;
    }
  };
}
const publicFetch=createPublicFetch();
module.exports={publicFetch,createPublicFetch,resolveTarget,publicAddress};
