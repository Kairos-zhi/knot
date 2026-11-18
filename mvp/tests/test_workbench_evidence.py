"""Project evidence UI contracts in the existing synthetic DOM model."""
import pytest

from test_workbench_projects import run_projects
from test_workbench_usability import PAGE, Structure


SETUP = r'''
const e=id=>els['project-evidence'+(id?'-'+id:'')];
const ui=execute('projectEvidenceUI');
const ref=sceneA.materials[0];
const key=source=>source.asset_id+':'+source.content_hash;
const demand={title:'Demand <b>literal</b>',deliverable:'A preview',criteria:'A clear source',
  reference:'',sample:true};
const evidence={criterion:'A clear source',contribution:'Built the preview',status:'pending',
  asset_id:ref.asset_id,content_hash:ref.content_hash,quote:'<img src=x onerror=alert(1)>',link:''};
const set=(node,value,event='input',property='value')=>{
  node[property]=value;
  for(const handler of node.events[event]||[])handler();
};
const change=(node,value)=>set(node,value,'change','checked');
const row=index=>e('items').children[index];
const labelled=(group,label)=>{
  const wrapper=group.children.find(node=>node.tagName==='LABEL'&&
    (node.textContent===label||node.children.some(child=>child.tagName==='SPAN'&&child.textContent===label)));
  assert(wrapper,label);
  return wrapper.children[0];
};
const quoteAllowed=index=>labelled(row(index),'允许分享这段摘录');
const linkAllowed=index=>labelled(row(index),'允许分享这个链接');
const contributionChecked=index=>labelled(row(index),'我已核对贡献');
const binding=scene=>({project_id:scene.project_id,revision:scene.revision,manifest_hash:scene.manifest_hash});
const importItems=(items,gaps='Pending verification',extra={})=>{
  set(e('return'),JSON.stringify({items,gaps,...extra}));
  return ui.importDraft();
};
const record=(url,options,action)=>{
  assert.equal(url,'/api/project-evidence-'+action);
  assert.equal(options.method,'POST');
  assert.equal(options.headers['X-Knot-Action'],'explicit');
  assert.equal(options.headers['Content-Type'],'application/json');
  return JSON.parse(options.body);
};
const projectedCard=body=>({demand:body.demand,items:body.approved.map(({index,quote,link})=>{
  const item=body.items[index];
  return {criterion:item.criterion,contribution:item.contribution,status:item.status,
    quote:quote?item.quote:'',link:link?item.link:''};
}),gaps:body.gaps});
const digest='a'.repeat(64);
let answerMarkdown='# Sample\nOnly server-approved text';
const serve=(url,options)=>{
  const action=url.split('-').at(-1);
  const body=record(url,options,action);
  if(action==='prepare')return {digest,card:projectedCard(body)};
  if(action==='share')return {markdown:answerMarkdown,card:projectedCard(body)};
  throw Error('Unexpected evidence request: '+url);
};
async function openScene(scene=sceneA){
  respond=url=>{assert.equal(url,'/api/project?project_id='+scene.project_id);return scene;};
  assert.equal(await execute('openProject('+JSON.stringify(scene.project_id)+')'),true);
}
function fillDemand(){
  for(const [key,value] of Object.entries(demand)){
    if(key==='sample')change(e(key),value);else set(e(key),value);
  }
}
async function setupApproved(){
  await openScene();fillDemand();
  assert(importItems([evidence]));
  change(quoteAllowed(0),true);
  respond=serve;
}
'''


def run_evidence(body):
    run_projects(SETUP + body)


def test_evidence_markup_lives_in_existing_project_view_with_readonly_fallback():
    structure = Structure()
    structure.feed(PAGE.read_text(encoding='utf-8'))
    nodes = structure.nodes
    assert nodes['project-evidence'][0] == 'details'
    assert 'hidden' in nodes['project-evidence'][1]
    assert any(attrs.get('id') == 'project-review-container'
               for _, attrs in nodes['project-evidence'][2])
    assert nodes['project-evidence-preview'][0] == 'aside'
    assert 'readonly' in nodes['project-evidence-markdown'][1]


def test_manual_review_reads_exact_source_and_only_renders_server_card():
    run_evidence(r'''
assert.equal(e().hidden,true);
await openScene();fillDemand();
assert.equal(e().hidden,false);
assert.equal(calls.length,2);
ui.add();
set(labelled(row(0),'对应哪项要求'),evidence.criterion);
set(labelled(row(0),'我做了什么'),evidence.contribution);
set(labelled(row(0),'来源材料'),key(ref),'change');
respond=(url,options)=>{
  const [path,query]=url.split('?');
  assert.equal(path,'/api/project-material');
  assert.equal(options.method,undefined);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(query)),{
    project_id:sceneA.project_id,revision:sceneA.revision,asset_id:ref.asset_id,expected_hash:ref.content_hash});
  return {...ref,project_id:sceneA.project_id,revision:sceneA.revision,text:evidence.quote};
};
assert.equal(await ui.readSource(0),true);
assert.equal(e('source-text').textContent,evidence.quote);
set(labelled(row(0),'逐字摘录'),evidence.quote);
respond=(url,options)=>{
  const body=record(url,options,'prepare');
  assert.deepEqual(body,{...binding(sceneA),demand,items:[evidence],gaps:'',approved:[]});
  return {digest,card:projectedCard(body)};
};
assert.equal(await ui.prepare(),true);
assert.equal(e('preview').hidden,false);
assert.equal(e('share').hidden,true);
assert(!flat(e('card')).includes(evidence.quote));

change(quoteAllowed(0),true);
assert.equal(e('preview').hidden,true);
respond=(url,options)=>{
  const body=record(url,options,'prepare');
  const card=projectedCard(body);
  card.items[0].asset_id=ref.asset_id;
  card.items[0].internal='private raw field';
  card.demand.title='Server card <b>literal</b>';
  return {digest,card};
};
assert.equal(await ui.prepare(),true);
const visible=flat(e('card'));
for(const label of ['样例','本人贡献待核','原文在项目内','Server card <b>literal</b>',evidence.quote])assert(visible.includes(label));
for(const privateValue of [ref.asset_id,ref.content_hash,'private raw field',demand.title])assert(!visible.includes(privateValue));
''')


def test_prompt_selection_limit_utf8_validation_and_strict_local_agent_import():
    run_evidence(r'''
const more=Array.from({length:6},(_,index)=>({...ref,asset_id:String(index),title:'Doc '+index}));
await openScene({...sceneA,materials:[ref,...more]});fillDemand();
assert.equal(e('prompt-build').disabled,true);
const boxes=e('sources').children.map(label=>label.children[0]);
for(const node of boxes)change(node,true);
assert.equal(boxes[6].checked,false);
change(boxes[1],false);
set(e('title'),'要'.repeat(54));
assert.equal(await ui.buildPrompt(),false);
assert.equal(calls.length,2);
set(e('title'),demand.title);
respond=(url,options)=>{
  const body=record(url,options,'prompt');
  const sources=[ref,...more.slice(1,5)].map(({asset_id,content_hash})=>({asset_id,content_hash}));
  assert.deepEqual(body,{...binding(sceneA),demand,sources});
  return {prompt:'Only selected body'};
};
assert.equal(await ui.buildPrompt(),true);
assert.equal(e('prompt-area').hidden,false);
assert.equal(e('prompt-view').open,false);
assert.equal(e('prompt').value,'Only selected body');
assert.equal(await ui.copyText(true),false);
assert.equal(e('prompt-view').open,true);
assert.equal(calls.length,3);
assert(!importItems([evidence],'gap',{approved:[{index:0,quote:true,link:true}]}));
assert(!importItems([{...evidence,asset_id:sceneB.materials[0].asset_id}]));
assert(!importItems([{...evidence,status:['pending']}]));
assert(!importItems([{...evidence,quote:'',link:''}]));
assert(!importItems([{...evidence,quote:'',link:'https://external.example/agent'}]));
assert(!importItems([evidence,evidence,evidence,evidence]));
assert(importItems([{...evidence,status:'documented',link:'https://external.example/agent'}]));
assert.equal(e('return').value,'');
assert(e('status').textContent.includes('待核对'));
assert.equal(contributionChecked(0).checked,false);
assert.equal(labelled(row(0),'可对外打开的成品链接（手动填写）').value,'');
assert.equal(quoteAllowed(0).checked,false);
assert.equal(linkAllowed(0).checked,false);
assert.equal(calls.length,3);
change(quoteAllowed(0),true);
assert.equal(contributionChecked(0).checked,false);
let expectedStatus='pending';
respond=(url,options)=>{
  assert.equal(record(url,options,'prepare').items[0].status,expectedStatus);
  return serve(url,options);
};
assert(await ui.prepare());
assert(flat(e('card')).includes('本人贡献待核'));
change(contributionChecked(0),true);
expectedStatus='documented';
assert(await ui.prepare());
assert(flat(e('card')).includes('开发者确认'));

set(labelled(row(0),'我做了什么'),'Edited contribution');
assert.equal(contributionChecked(0).checked,false);
change(quoteAllowed(0),true);
expectedStatus='pending';
assert(await ui.prepare());
assert(flat(e('card')).includes('本人贡献待核'));
change(contributionChecked(0),true);
set(labelled(row(0),'来源材料'),key(more[1]),'change');
assert.equal(contributionChecked(0).checked,false);
assert.equal(labelled(row(0),'逐字摘录').value,'');
set(labelled(row(0),'逐字摘录'),'Quote from replacement material');
change(quoteAllowed(0),true);
assert(await ui.prepare());
assert(flat(e('card')).includes('本人贡献待核'));

for(const [label,value] of [['对应哪项要求','Edited criterion'],['逐字摘录','Edited quote'],
  ['可对外打开的成品链接（手动填写）','https://public.example/changed']]){
  change(contributionChecked(0),true);
  set(labelled(row(0),label),value);
  assert.equal(contributionChecked(0).checked,false);
  change(quoteAllowed(0),true);
  assert(await ui.prepare());
  assert(flat(e('card')).includes('本人贡献待核'));
}
change(contributionChecked(0),true);
set(e('criteria'),'Changed demand criteria');
assert.equal(contributionChecked(0).checked,false);
assert.equal(e('preview').hidden,true);
assert(await ui.prepare());
assert(flat(e('card')).includes('本人贡献待核'));
''')


def test_preview_does_not_accept_server_upgrading_unconfirmed_contribution():
    run_evidence(r'''
await setupApproved();
respond=(url,options)=>{
  const body=record(url,options,'prepare');
  assert.equal(body.items[0].status,'pending');
  const card=projectedCard(body);
  card.items[0].status='documented';
  return {digest,card};
};
assert.equal(await ui.prepare(),false);
assert.equal(e('preview').hidden,true);
assert.equal(e('share').hidden,true);
assert(!flat(e('card')).includes('开发者确认'));
''')


def test_gaps_only_preview_keeps_share_unavailable():
    run_evidence(r'''
await openScene();fillDemand();
change(e('sample'),false);
assert(importItems([],'No retained evidence for this criterion'));
respond=(url,options)=>{
  const body=record(url,options,'prepare');
  assert.deepEqual(body,{...binding(sceneA),demand:{...demand,sample:false},
    items:[],gaps:'No retained evidence for this criterion',approved:[]});
  return serve(url,options);
};
assert(await ui.prepare());
assert(flat(e('card')).includes('No retained evidence for this criterion'));
assert(!flat(e('card')).includes('样例'));
assert.equal(e('share').hidden,true);
assert.equal(await ui.share(),false);
assert.equal(await ui.copyText(),false);
assert.equal(calls.length,3);
''')


def test_partial_approval_share_revalidates_again_on_copy_and_clears_on_change():
    run_evidence(r'''
await openScene();fillDemand();
const second={...evidence,contribution:'Unapproved contribution',quote:'Unapproved quote'};
assert(importItems([evidence,second]));
const link=labelled(row(0),'可对外打开的成品链接（手动填写）');
set(link,'https://public.example/work');
change(linkAllowed(0),true);
let prepared;
const requests=[];
let shareQuote=false;
respond=(url,options)=>{
  const action=url.split('-').at(-1);
  const body=record(url,options,action);
  requests.push(action);
  if(action==='prepare'){
    assert.deepEqual(body.approved,[{index:0,quote:shareQuote,link:true}]);
    assert.equal(body.items.length,2);
    prepared=body;
  }else assert.deepEqual(body,{...prepared,digest});
  return serve(url,options);
};
assert.equal(await ui.prepare(),true);
const visible=flat(e('card'));
assert(visible.includes(link.value));
assert(visible.includes('开发者提供的成品链接'));
assert(visible.includes('请自行核对链接能否打开及其内容'));
assert(!visible.includes(second.contribution));
assert(!visible.includes(evidence.quote));
const anchor=e('card').children.flatMap(node=>node.children).flatMap(node=>node.children)
  .find(node=>node.tagName==='A');
assert.equal(anchor.href,link.value);
assert.equal(anchor.rel,'noopener noreferrer');
assert.equal(e('share').hidden,true);
assert(e('status').textContent.includes('勾选一段可分享的逐字摘录'));
assert.equal(await ui.share(),false);
assert.deepEqual(requests,['prepare']);

shareQuote=true;
change(quoteAllowed(0),true);
assert.equal(await ui.prepare(),true);
assert.equal(e('share').hidden,false);
assert(flat(e('card')).includes(evidence.quote));
assert(!flat(e('card')).includes(second.quote));
assert.equal(await ui.share(),true);
assert.deepEqual(requests,['prepare','prepare','share']);
assert.equal(e('fallback').hidden,true);
assert.equal(await ui.copyText(),false); // No clipboard in the DOM model.
assert.deepEqual(requests,['prepare','prepare','share','share']);
assert.equal(e('markdown').value,answerMarkdown);
assert.equal(e('fallback').hidden,false);
assert.equal(e('markdown').focused,1);
change(quoteAllowed(0),false);
assert.equal(e('preview').hidden,true);
assert.equal(e('copy').hidden,true);
assert.equal(e('markdown').value,'');
assert.equal(await ui.copyText(),false);
assert.equal(requests.length,4);
''')


@pytest.mark.parametrize('phase,change_kind', [
    ('prompt', 'typing'), ('prepare', 'typing'), ('share', 'typing'),
    ('prepare', 'project'), ('share', 'invalidate'), ('copy', 'typing'),
    ('source', 'typing'), ('source', 'project'),
])
def test_late_responses_cannot_restore_preview_prompt_or_copy(phase, change_kind):
    run_evidence(f"const phase='{phase}',changeKind='{change_kind}';" + r'''
await setupApproved();
if(phase==='prompt')change(e('sources').children[0].children[0],true);
if(phase==='share'||phase==='copy')assert.equal(await ui.prepare(),true);
if(phase==='copy')assert.equal(await ui.share(),true);
let clipboardCalls=0;
ctx.navigator={clipboard:{writeText:()=>{clipboardCalls++;}}};
let release,response;
respond=(url,options)=>{
  if(phase==='prompt')response={prompt:'Late prompt'};
  else if(phase==='source')response={...ref,...binding(sceneA),text:evidence.quote};
  else response=serve(url,options);
  return new Promise(resolve=>release=resolve);
};
const command={prompt:ui.buildPrompt,prepare:ui.prepare,share:ui.share,copy:ui.copyText,
  source:()=>ui.readSource(0)}[phase];
const pending=command();
assert.equal(typeof release,'function');
if(changeKind==='typing')set(e('title'),'Changed during request');
if(changeKind==='invalidate')execute('invalidateProjectScene()');
if(changeKind==='project')await openScene(sceneB);
release(response);
assert.equal(await pending,false);
assert.equal(e('preview').hidden,true);
assert.equal(e('prompt-area').hidden,true);
assert.equal(e('copy').hidden,true);
assert.equal(e('markdown').value,'');
assert.equal(e('source').hidden,true);
assert.equal(e('source-text').textContent,'');
assert.equal(clipboardCalls,0);
''')


@pytest.mark.parametrize('error,status', [('REVISION_CONFLICT', 409), ('ACCESS_DENIED', 403)])
def test_copy_denial_removes_preview_and_same_project_refresh_preserves_draft(error, status):
    run_evidence(f"const failure={{syntheticError:'{error}',status:{status}}};" + r'''
await setupApproved();
assert.equal(await ui.prepare(),true);
assert.equal(await ui.share(),true);
let clipboard='';
ctx.navigator={clipboard:{writeText:value=>{clipboard=value;}}};
respond=()=>failure;
assert.equal(await ui.copyText(),false);
assert.equal(clipboard,'');
assert.equal(e('preview').hidden,true);
assert.equal(e('work').hidden,true);
assert.equal(e('refresh').hidden,false);
assert.equal(e('markdown').value,'');
const snapshot={revision:'3',manifest_hash:'d'.repeat(64)};
const refreshed={...sceneA,...snapshot,snapshots:[...sceneA.snapshots,snapshot]};
await openScene(refreshed);
assert.equal(e('work').hidden,false);
assert.equal(e('title').value,demand.title);
assert.equal(labelled(row(0),'逐字摘录').value,evidence.quote);
assert.equal(quoteAllowed(0).checked,false);
change(quoteAllowed(0),true);
respond=(url,options)=>{
  const action=url.split('-').at(-1);
  const body=record(url,options,action);
  assert.equal(body.revision,'3');
  assert.equal(body.manifest_hash,snapshot.manifest_hash);
  return serve(url,options);
};
assert.equal(await ui.copyText(),false);
assert.equal(await ui.prepare(),true);
assert.equal(await ui.share(),true);
assert.equal(await ui.copyText(),true);
assert.equal(clipboard,answerMarkdown);
''')
