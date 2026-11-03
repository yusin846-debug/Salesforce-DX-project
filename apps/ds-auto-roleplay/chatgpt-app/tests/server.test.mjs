import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker,{callTool,TOOLS} from '../dist/server/index.js';
export class Bucket {
 constructor(){this.map=new Map();this.n=0;}
 async get(key){const item=this.map.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.body)}:null;}
 async put(key,body,opts={}){const old=this.map.get(key);if(opts.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;if(opts.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const value={etag:String(++this.n),body};this.map.set(key,value);return value;}
}
const env=()=>({BUCKET:new Bucket()});
const start=(e,user='alice',mode='full')=>callTool('start_roleplay',{mode,request_id:crypto.randomUUID()},e,user);
const mutate=(s,extra={})=>({session_id:s.id,expected_revision:s.revision,request_id:crypto.randomUUID(),...extra});
const grade=(s,extra={})=>({...mutate(s),answer_id:s.answer_id,score:8,strengths:['핵심을 먼저 말함'],improvements:['다음 행동을 한 문장으로 합의'],flags:[],reply:'구체적인 검증 범위가 궁금합니다.',followup:'누구와 언제 확인하시겠어요?',...extra});
test('courses preserve RP → interview, and latest corrected deck',async()=>{const e=env();let r=await start(e);assert.equal(r.session.total,29);assert.equal(r.session.scene.id,'rp-open');for(let i=0;i<16;i++){r=await callTool('submit_roleplay_answer',mutate(r.session,{choice_index:0}),e,'alice');r=await callTool('advance_roleplay',mutate(r.session,{action:'next'}),e,'alice');}assert.equal(r.session.phase,'interview');assert.equal(r.session.scene.id,'int-reflect');assert.equal((await start(e,'b','interview')).session.total,13);assert.equal((await start(e,'c','rp')).session.total,16);const content=JSON.parse(await readFile(new URL('../content/scenarios.json',import.meta.url),'utf8'));assert.equal(content.deck.length,12);assert.match(JSON.stringify(content.deck[4]),/단절/);assert.doesNotMatch(JSON.stringify(content),/[\u3040-\u30ff]/);});
test('user isolation, resume, anonymous tool refusal',async()=>{const e=env();const a=await start(e);assert.equal((await callTool('get_roleplay_context',{},e,'bob')).session,null);assert.equal((await callTool('get_roleplay_context',{},e,'alice')).session.id,a.session.id);const res=await rpc(e,'tools/call',{name:'get_roleplay_context',arguments:{}});assert.equal(res.result.isError,true);});
test('free answer needs actual GPT evaluation, then followup and retry',async()=>{const e=env();let r=await start(e);r=await callTool('submit_roleplay_answer',mutate(r.session,{answer:'감사합니다. 먼저 검증할 범위부터 맞춰도 괜찮을까요?'}),e,'alice');assert.equal(r.session.stage,'awaiting');assert.equal(r.session.evaluation,null);assert.match(r.pendingEvaluation.accuracyRules[0],/반복 설명은 결과/);assert.ok(r.pendingEvaluation.rubric.length);await assert.rejects(callTool('advance_roleplay',mutate(r.session,{action:'next'}),e,'alice'));const g=grade(r.session);r=await callTool('record_roleplay_evaluation',g,e,'alice');assert.equal(r.session.evaluation.source,'ChatGPT 평가');assert.equal(r.session.evaluation.score,8);assert.equal((await callTool('record_roleplay_evaluation',g,e,'alice')).session.history.length,1);r=await callTool('advance_roleplay',mutate(r.session,{action:'followup'}),e,'alice');assert.equal(r.session.question,'누구와 언제 확인하시겠어요?');assert.equal(r.session.round,1);r=await callTool('submit_roleplay_answer',mutate(r.session,{answer:'COO와45분 미팅을 잡겠습니다.'}),e,'alice');r=await callTool('record_roleplay_evaluation',grade(r.session),e,'alice');r=await callTool('advance_roleplay',mutate(r.session,{action:'retry'}),e,'alice');assert.equal(r.session.stage,'answer');assert.equal(r.session.round,1);});
test('idempotent submission, stale revisions, stale answer IDs and length limits',async()=>{const e=env();const a=await start(e);const args=mutate(a.session,{answer:'같은 답변'});const r=await callTool('submit_roleplay_answer',args,e,'alice');assert.equal((await callTool('submit_roleplay_answer',args,e,'alice')).session.revision,r.session.revision);await assert.rejects(callTool('submit_roleplay_answer',mutate(a.session,{answer:'오래된 창'}),e,'alice'),/진행 상태/);await assert.rejects(callTool('record_roleplay_evaluation',grade(r.session,{answer_id:'other'}),e,'alice'),/일치/);const b=await start(e,'bob');await assert.rejects(callTool('submit_roleplay_answer',mutate(b.session,{answer:'x'.repeat(6001)}),e,'bob'));await assert.rejects(callTool('submit_roleplay_answer',mutate(b.session,{choice_index:0,answer:'둘 다'}),e,'bob'));});
test('R2 conditional writes detect concurrent updates',async()=>{const e=env();const r=await start(e);const results=await Promise.allSettled([callTool('submit_roleplay_answer',mutate(r.session,{answer:'첫 창'}),e,'alice'),callTool('submit_roleplay_answer',mutate(r.session,{answer:'두 번째 창'}),e,'alice')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,409);});
test('flags cap scores, no evaluation forgery from normal web endpoint',async()=>{const e=env();let r=await start(e);r=await callTool('submit_roleplay_answer',mutate(r.session,{answer:'제가 실제 고객에게 상용 구축했습니다.'}),e,'alice');r=await callTool('record_roleplay_evaluation',grade(r.session,{score:10,flags:['교육용 PoC를 상용 구축으로 과장']}),e,'alice');assert.equal(r.session.evaluation.score,5);const response=await worker.fetch(new Request('https://app.test/api/tool',{method:'POST',headers:{origin:'https://app.test','oai-authenticated-user-id':'alice'},body:JSON.stringify({name:'record_roleplay_evaluation',arguments:{}})}),e);assert.equal(response.status,403);});
test('MCP discovery, tools, resources, UI metadata and origin checks',async()=>{const e=env();assert.deepEqual((await rpc(e,'server/discover')).result.supportedVersions,['2026-07-28']);assert.equal((await rpc(e,'tools/list')).result.tools.length,6);const uri=TOOLS[0]._meta.ui.resourceUri;const resource=(await rpc(e,'resources/read',{uri})).result.contents[0];assert.equal(resource.mimeType,'text/html;profile=mcp-app');assert.match(resource.text,/ui\/initialize/);assert.match(resource.text,/ui\/message/);assert.doesNotMatch(resource.text,/[\u3040-\u30ff]/);const untrusted=await worker.fetch(new Request('https://app.test/api/tool',{method:'POST',headers:{origin:'https://other.test','oai-authenticated-user-id':'alice'},body:'{}'}),e);assert.equal(untrusted.status,403);const missing=await worker.fetch(new Request('https://app.test/api/tool',{method:'POST',headers:{origin:'https://app.test'},body:'{}'}),e);assert.equal(missing.status,401);});
test('all answers complete and final summary counts latest scene scores',async()=>{const e=env();let r=await start(e,'alice','interview');for(let i=0;i<13;i++){r=await callTool('submit_roleplay_answer',mutate(r.session,{choice_index:0}),e,'alice');r=await callTool('advance_roleplay',mutate(r.session,{action:'next'}),e,'alice');}assert.equal(r.session.stage,'complete');assert.equal(r.session.completedScenes,13);assert.ok(Number.isFinite(r.session.average));});
async function rpc(e,method,params={}){const response=await worker.fetch(new Request('https://app.test/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),e);return response.json();}

test('every choice produces the matching score, explanation and saved question across all 29 scenes',async()=>{
 const e=env(), actor='matrix', data=JSON.parse(await readFile(new URL('../content/scenarios.json',import.meta.url),'utf8'));
 let result=await start(e,actor), optionsTested=0;
 for(const scene of data.scenes){
  const initial=result.session;
  assert.equal(initial.scene.id,scene.id);
  assert.ok(initial.question.trim());
  assert.deepEqual(initial.scene.slides.map(slide=>slide.no),scene.slideRefs);
  const before=new Map(e.BUCKET.map);
  for(const [i,option] of scene.opts.entries()){
   e.BUCKET.map=new Map(before);
   result=await callTool('submit_roleplay_answer',mutate(initial,{choice_index:i}),e,actor);
   const saved=result.session.history.at(-1);
   assert.equal(saved.answer,option.t);
   assert.equal(saved.question,initial.question);
   assert.equal(saved.evaluation.score,option.s);
   assert.equal(saved.evaluation.explanation,option.f);
   assert.equal(saved.evaluation.reply,option.r);
   assert.ok(saved.evaluation.followup.trim());
   optionsTested++;
  }
  result=await callTool('advance_roleplay',mutate(result.session,{action:'next'}),e,actor);
 }
 assert.equal(optionsTested,117);
 assert.equal(result.session.completedScenes,29);
 assert.equal(result.session.stage,'complete');
});

test('followup retries use their parent round, the customer role and the correct question in the record',async()=>{
 const e=env(), actor='followup';
 let result=await start(e,actor,'rp');
 const change=async(name,args)=>{result=await callTool(name,mutate(result.session,args),e,actor);};
 const answer=async(answer)=>change('submit_roleplay_answer',{answer});
 const score=async()=>{result=await callTool('record_roleplay_evaluation',grade(result.session),e,actor);};
 await change('submit_roleplay_answer',{choice_index:0});
 await change('advance_roleplay',{action:'next'});
 await answer('원래 발표');assert.equal(result.pendingEvaluation.role,'CEO');await score();
 await change('advance_roleplay',{action:'followup'});
 await answer('첫 꼬리질문 답변');await score();
 await change('advance_roleplay',{action:'retry'});
 await answer('첫 꼬리질문 수정');
 assert.equal(result.pendingEvaluation.previousAnswer,'원래 발표');await score();
 await change('advance_roleplay',{action:'followup'});await answer('두 번째 꼬리질문');
 assert.equal(result.pendingEvaluation.previousAnswer,'첫 꼬리질문 수정');await score();
 await assert.rejects(change('advance_roleplay',{action:'followup'}),/2회/);
 assert.equal(result.session.history.at(-1).question,result.session.question);
});

test('standalone API validates input, resumes each mode and completes with JSON history',async()=>{
 const e=env();
 const request=async(raw)=>worker.fetch(new Request('https://test.local/api/tool',{
  method:'POST',headers:{origin:'https://test.local','oai-authenticated-user-id':'web'},body:raw
 }),e);
 for(const raw of ['{','null','[]'])assert.equal((await request(raw)).status,400);
 const call=async(name,args={})=>{
  const res=await request(JSON.stringify({name,arguments:args}));
  assert.equal(res.status,200);return (await res.json()).structuredContent.session;
 };
 for(const mode of ['rp','interview','full']){
  let session=await call('start_roleplay',{mode,request_id:crypto.randomUUID()});
  const total=session.total;
  for(let i=0;i<total;i++){
   session=await call('submit_roleplay_answer',mutate(session,{choice_index:0}));
   assert.deepEqual(await call('get_roleplay_context'),session);
   session=await call('advance_roleplay',mutate(session,{action:'next'}));
  }
  assert.equal(session.stage,'complete');
  assert.equal(session.history.length,total);
  assert.equal(session.average,session.history.reduce((sum,h)=>sum+h.evaluation.score,0)/total);
 }
});

test('a reused request ID cannot silently acknowledge different answers or an unsaved evaluation',async()=>{
 const e=env();
 const first=await start(e);
 const submission=mutate(first.session,{answer:'첫 번째 답변'});
 const pending=await callTool('submit_roleplay_answer',submission,e,'alice');
 await assert.rejects(callTool('submit_roleplay_answer',{...submission,answer:'바뀐 답변'},e,'alice'),/요청 ID/);
 await assert.rejects(callTool('record_roleplay_evaluation',grade(pending.session,{request_id:submission.request_id}),e,'alice'),/요청 ID/);
 assert.equal((await callTool('get_roleplay_context',{},e,'alice')).session.stage,'awaiting');
 assert.equal((await callTool('record_roleplay_evaluation',grade(pending.session),e,'alice')).session.stage,'evaluated');
});

test('MCP rejects browser-origin cross-site mutations before touching the session',async()=>{
 const e=env();
 const req=new Request('https://app.test/mcp',{method:'POST',headers:{origin:'https://other.test','oai-authenticated-user-id':'alice'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'start_roleplay',arguments:{mode:'full',request_id:'cross-site'}}})});
 assert.equal((await worker.fetch(req,e)).status,403);
 assert.equal((await callTool('get_roleplay_context',{},e,'alice')).session,null);
});
