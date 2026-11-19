"""Candidate projection and explicit workflows in the Node workbench model."""
from test_workbench_global_time import run_global


SETUP = r'''
const quote='Decision: literal <script>source</script>';
const before='😀 heading\n'+quote+'\n';
const source=before+quote+'\nend';
const original={...sceneA.materials[0],claim_id:'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  claim_type:'decision',atom:'decision',quote,quote_start:Array.from(before).length,
  message_time_ms:null,document_on:'2026-09-12',saved_at:sceneA.saved_at,status:'pending'};
const fallback={...original,claim_id:'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa',
  claim_type:'question',atom:'open_question',document_on:null,status:'rejected'};
let items=[original,fallback];
let owner=true;
const superRespond=respond;
respond=async(url,options)=>{
  if(url.startsWith('/api/project-claims?')){
    const params=new URLSearchParams(url.split('?')[1]);
    return {project_id:params.get('project_id'),revision:params.get('revision'),items,
      has_unavailable:false,can_write:owner&&params.get('revision')==='2'};
  }
  if(url.startsWith('/api/project-material?')){
    return {...sceneA.materials[0],project_id:sceneA.project_id,revision:sceneA.revision,text:source};
  }
  return superRespond(url,options);
};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
ctx.sceneA=sceneA;
assert(await execute('openProject(sceneA.project_id)'));
assert(!calls.some(call=>call.url.startsWith('/api/project-claims')));
assert(execute('projectReviewUI.setView("claims")'));
await flush();
const groups=()=>els['project-claims-list'].children;
const contents=()=>flat(els['project-claims-list']);
'''


def test_filters_exact_source_and_mutation_readback():
    run_global(SETUP + r'''
assert.equal(groups().length,2);
assert(contents().includes('文档日期'));
assert(contents().includes('留存日期'));
assert(execute('currentProjectDays().has("2026-09-12")'));
execute('selectProjectDate(projectCalendarIndex("2026-09-12"),{locate:false})');
assert.equal(groups().length,1);
assert.equal(groups()[0].dataset.day,'2026-09-12');
assert(contents().includes(quote));
assert(!contents().includes('open_question'));
assert(await execute('projectClaimsUI.readSource(projectClaimsUI.state(),projectClaimsUI.state().items[0])'));
const pre=els['project-detail-content'].children[0];
assert.equal(pre.children[0].textContent,before);
assert.equal(pre.children[1].tagName,'MARK');
assert.equal(pre.children[1].textContent,quote);
assert.equal(pre.children[2].textContent,'\nend');
assert(calls.at(-1).url.includes('expected_hash='+original.content_hash));
execute('latestProjectDate()');
els['project-claims-status-filter'].value='rejected';execute('projectClaimsUI.render()');
assert(contents().includes('open_question'));assert(!contents().includes('待核对'));
els['project-claims-type'].value='decision';execute('projectClaimsUI.render()');
assert(contents().includes('没有符合当前筛选'));
els['project-claims-status-filter'].value='';els['project-claims-query'].value='literal <script>';
execute('projectClaimsUI.render()');assert(contents().includes(quote));
const previous=respond;
respond=async(url,options)=>{
  if(url==='/api/project-claims-extract'){
    assert.deepEqual(JSON.parse(options.body),{project_id:sceneA.project_id,revision:sceneA.revision});
    return {project_id:sceneA.project_id,revision:sceneA.revision,inserted:0,unchanged:2,has_unavailable:false};
  }
  if(url==='/api/project-claims-review'){
    assert.equal(options.headers['X-Knot-Action'],'explicit');
    assert.deepEqual(JSON.parse(options.body),{project_id:sceneA.project_id,revision:sceneA.revision,
      claim_id:original.claim_id,decision:'accept'});
    items=[{...original,status:'accepted'},fallback];
    return {claim_id:original.claim_id,decision:'accept',status:'confirmed'};
  }
  return previous(url,options);
};
assert(await execute('projectClaimsUI.mutate("extract",projectClaimsUI.state())'));
assert(calls.at(-1).url.startsWith('/api/project-claims?'));
assert(await execute('projectClaimsUI.mutate("review",projectClaimsUI.state(),projectClaimsUI.state().items[0],"accept")'));
assert(calls.at(-1).url.startsWith('/api/project-claims?'));
assert(contents().includes('已确认'));assert(!contents().includes('待核对'));
''')


def test_historical_review_rejected_and_invalidated_source_removed():
    run_global(SETUP + r'''
const previous=respond;
respond=async(url,options)=>{
  if(url.startsWith('/api/project?')&&url.includes('revision=1'))return {...sceneA,revision:'1'};
  if(url.startsWith('/api/project-material?')){
    return {...sceneA.materials[0],project_id:sceneA.project_id,revision:'1',text:'different quote'};
  }
  return previous(url,options);
};
assert(await execute('openProject(sceneA.project_id,"1")'));
await flush();
assert.equal(els['project-claims-extract'].disabled,true);
assert.equal(els['project-claims-read-only'].hidden,false);
assert(!contents().includes('重新确认'));
const count=calls.length;
assert.equal(await execute('projectClaimsUI.mutate("review",projectClaimsUI.state(),projectClaimsUI.state().items[0],"accept")'),false);
assert.equal(calls.length,count);
assert.equal(await execute('projectClaimsUI.readSource(projectClaimsUI.state(),projectClaimsUI.state().items[0])'),false);
assert(!contents().includes(quote));
assert(!flat(els['project-detail-content']).includes('different quote'));
execute('invalidateProjectScene()');
assert.equal(groups().length,0);
assert(!execute('projectDateDays().includes("2026-09-12")'));
''')


def test_granted_reader_can_inspect_without_write_controls():
    run_global(SETUP + r'''
owner=false;
assert(await execute('projectClaimsUI.load()'));
assert.equal(els['project-claims-extract'].disabled,true);
assert.equal(els['project-claims-read-only'].hidden,false);
assert(els['project-claims-read-only'].textContent.includes('项目所有者'));
assert(contents().includes('定位原文'));assert(!contents().includes('重新确认'));
const count=calls.length;
assert.equal(await execute('projectClaimsUI.mutate("extract",projectClaimsUI.state())'),false);
assert.equal(calls.length,count);
''')
