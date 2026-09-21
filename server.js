const http=require("http"),crypto=require("crypto");
const PORT=Number(process.env.PORT||10000);
const OWNER=process.env.GITHUB_OWNER||"yoonhj27-coder",REPO=process.env.GITHUB_REPO||"nalnal-play-school",BRANCH=process.env.GITHUB_BRANCH||"main";
const TOKEN=process.env.GITHUB_TOKEN,PASS=process.env.ADMIN_PASSWORD,SECRET=process.env.SESSION_SECRET;
const ORIGIN=process.env.ALLOWED_ORIGIN||"https://nalnal-play-school.onrender.com";
if(!TOKEN||!PASS||!SECRET){console.error("Missing GITHUB_TOKEN, ADMIN_PASSWORD or SESSION_SECRET");process.exit(1)}
const cors=o=>o===ORIGIN?{"Access-Control-Allow-Origin":o,"Access-Control-Allow-Credentials":"true","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}:{};
function out(res,code,data,h={}){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...h});res.end(JSON.stringify(data))}
function cookies(s=""){return Object.fromEntries(s.split(";").map(x=>x.trim()).filter(Boolean).map(x=>{let i=x.indexOf("=");return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function sig(v){return crypto.createHmac("sha256",SECRET).update(v).digest("hex")}
function session(){let v=String(Date.now());return v+"."+sig(v)}
function valid(req){let t=cookies(req.headers.cookie).admin_session;if(!t)return false;let [v,s]=t.split(".");if(!v||!s)return false;let e=sig(v);return s.length===e.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e))&&Date.now()-Number(v)<43200000}
function body(req,max=20*1024*1024){return new Promise((ok,no)=>{let n=0,a=[];req.on("data",c=>{n+=c.length;if(n>max){no(Error("Request too large"));req.destroy()}else a.push(c)});req.on("end",()=>{try{ok(JSON.parse(Buffer.concat(a).toString()||"{}"))}catch(e){no(e)}});req.on("error",no)})}
async function gh(path,opt={}){let r=await fetch("https://api.github.com"+path,{...opt,headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+TOKEN,"X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json",...(opt.headers||{})}}),t=await r.text(),d;try{d=JSON.parse(t)}catch{d={message:t}}if(!r.ok)throw Error(d.message||"GitHub API "+r.status);return d}
async function save(html){
 const ref=await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`),parent=ref.object.sha;
 const pc=await gh(`/repos/${OWNER}/${REPO}/git/commits/${parent}`);
 const blob=await gh(`/repos/${OWNER}/${REPO}/git/blobs`,{method:"POST",body:JSON.stringify({content:Buffer.from(html).toString("base64"),encoding:"base64"})});
 const tree=await gh(`/repos/${OWNER}/${REPO}/git/trees`,{method:"POST",body:JSON.stringify({base_tree:pc.tree.sha,tree:[{path:"index.html",mode:"100644",type:"blob",sha:blob.sha}]})});
 const commit=await gh(`/repos/${OWNER}/${REPO}/git/commits`,{method:"POST",body:JSON.stringify({message:"Update homepage from admin",tree:tree.sha,parents:[parent]})});
 await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`,{method:"PATCH",body:JSON.stringify({sha:commit.sha,force:false})});
 return commit.sha;
}
http.createServer(async(req,res)=>{
 const h=cors(req.headers.origin);
 if(req.method==="OPTIONS"){res.writeHead(204,h);return res.end()}
 if(req.url==="/health"&&req.method==="GET")return out(res,200,{ok:true},h);
 if(req.headers.origin&&req.headers.origin!==ORIGIN)return out(res,403,{error:"Origin not allowed"});
 try{
  if(req.url==="/api/login"&&req.method==="POST"){let b=await body(req,32768);if(b.password!==PASS)return out(res,401,{error:"비밀번호가 올바르지 않습니다."},h);return out(res,200,{ok:true},{...h,"Set-Cookie":`admin_session=${encodeURIComponent(session())}; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=None`})}
  if(req.url==="/api/logout"&&req.method==="POST")return out(res,200,{ok:true},{...h,"Set-Cookie":"admin_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None"});
  if(req.url==="/api/save"&&req.method==="POST"){if(!valid(req))return out(res,401,{error:"관리자 로그인이 필요합니다."},h);let b=await body(req),html=b.html;if(typeof html!=="string"||!html.trim().toLowerCase().startsWith("<!doctype html"))return out(res,400,{error:"index.html 형식이 아닙니다."},h);if(Buffer.byteLength(html)>20*1024*1024)return out(res,413,{error:"파일이 너무 큽니다."},h);return out(res,200,{ok:true,commit:await save(html)},h)}
  return out(res,404,{error:"Not found"},h);
 }catch(e){console.error(e);return out(res,500,{error:"GitHub 저장 중 오류가 발생했습니다.",detail:e.message},h)}
}).listen(PORT,"0.0.0.0",()=>console.log("Admin API listening on "+PORT));
