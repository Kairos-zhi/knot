"""Decision reading path contracts using synthetic snapshots and Node DOM."""
from test_workbench_projects import PAGE, Structure, run_projects


def test_message_dates_sort_stably_and_archive_dates_never_fill_unknown_dates():
    run_projects(r'''
const scene=copy(sceneA),base=scene.decisions.items[0],plan=scene.decisions.items[1];
const direct=(id,day)=>({...base,id,title:id,kind:'direct_user_message',occurred_on:day,archived_on:null});
scene.decisions.items=[
  {...base,id:'archive-new',archived_on:'2026-12-01'},
  direct('late','2026-11-03'),plan,direct('same-first','2026-10-02'),
  {...base,id:'archive-old',archived_on:'2020-01-01'},
  direct('same-second','2026-10-02'),direct('unknown',null),direct('early','2026-01-01')
];
const original=JSON.stringify(scene.decisions.items);
respond=()=>scene;await execute('openProject(sceneA.project_id)');
assert.deepEqual(Array.from(execute('projectCards.filter(c=>c.item&&c.item.kind!=="document_plan").map(c=>c.id)')),
  ['early','same-first','same-second','late','archive-new','archive-old','unknown']);
assert.equal(JSON.stringify(scene.decisions.items),original);
assert.equal(els['project-background-cards'].children.length,1);
assert(!flat(els['project-decisions']).includes(plan.title));
assert(flat(els['project-decisions'].children[0]).includes('原消息日期 2026-01-01'));
assert(flat(els['project-decisions'].children[4]).includes('归档于 2026-12-01 · 原消息日期未知'));
assert(flat(els['project-decisions'].children[6]).includes('原消息日期未知'));
assert.equal(els['project-decision-order'].hidden,false);
assert.equal(calls.length,2);
''')


def test_cards_stay_short_sidebar_has_exact_fields_and_selection_keeps_cards_in_place():
    run_projects(r'''
const scene=copy(sceneA),base=scene.decisions.items[0];
const reason='Literal <script>reason</script>\n'+ '完整原因'.repeat(90);
scene.decisions.items=[{...base,id:'first',reason},
  {...base,id:'second',title:'Second decision',before:null,after:'Exact after',reason:null},
  {...base,id:'blank',before:'',after:null,reason:'   '}];
respond=()=>scene;await execute('openProject(sceneA.project_id)');
const cards=[...els['project-decisions'].children],beforeCalls=calls.length;
assert(!flat(cards[0]).includes(base.before));assert(!flat(cards[0]).includes(base.after));
assert.equal(cards[0].children.length,3); // Title, date, short reason only.
const short=cards[0].children[2].textContent;
assert(Array.from(short).length<120);assert(short.endsWith('…'));
assert(reason.startsWith(short.slice(0,-1)));assert(!flat(cards[0]).includes(reason));
for(const id of ['first','second','blank']){
  assert.equal(execute('selectProjectDecision('+JSON.stringify(id)+')'),true);
  assert.deepEqual(els['project-decisions'].children,cards);
  assert.equal(cards.filter(c=>c.attrs['aria-expanded']==='true').length,1);
}
execute('selectProjectDecision("first")');
for(const value of [base.before,base.after,reason,base.evidence[0].quote])assert(flat(els['project-detail-content']).includes(value));
execute('clearProjectDetail(true)');assert.equal(cards[0].focused,1);
execute('selectProjectDecision("second")');
assert(!flat(cards[1]).includes('原因'));assert(!flat(els['project-detail-content']).includes('原因'));
assert(flat(els['project-detail-content']).includes('Exact after'));
execute('selectProjectDecision("blank")');
assert(!flat(cards[2]).includes('原因'));assert(!flat(els['project-detail-content']).includes('原因'));
assert.equal(calls.length,beforeCalls);assert.equal(execute('draft'),null);assert.equal(execute('contextAllowed.size'),0);
''')


def test_snapshot_switch_clears_path_and_detail_before_loading_and_rebuilds_only_that_version():
    run_projects(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
execute('selectProjectDecision("choice")');
const previous=els['project-decisions'].children[0];let release;
respond=(url)=>{assert.equal(url,'/api/project?project_id='+sceneA.project_id+'&revision=1');return new Promise(resolve=>release=resolve);};
const pending=execute('selectProjectSnapshot(0)');
assert.equal(els['project-decisions'].children.length,0);
assert.equal(els['project-detail-content'].children.length,0);
assert.equal(els['project-detail-view'].hidden,true);
assert.equal(els['project-decision-order'].hidden,true);
const old=copy(sceneA);Object.assign(old,old.snapshots[0]);
old.decisions.items=[{...old.decisions.items[0],id:'older-only',title:'Only in older snapshot'}];
release(old);await pending;
assert.equal(execute('projectScene.revision'),'1');
assert.equal(els['project-decisions'].children.length,1);
assert.notEqual(els['project-decisions'].children[0],previous);
assert(flat(els['project-decisions']).includes('Only in older snapshot'));
assert.equal(els['project-detail-content'].children.length,0);
assert.equal(els['project-decision-order'].hidden,false);
execute('selectProjectDecision("choice")');assert.equal(els['project-detail-view'].hidden,true);
execute('selectProjectDecision("older-only")');
respond=()=>({syntheticError:'ACCESS_DENIED',status:403});
await assert.rejects(execute('selectProjectSnapshot(1)'));
assert.equal(els['project-decisions'].children.length,0);
assert.equal(els['project-detail-content'].children.length,0);
assert.equal(els['project-decision-order'].hidden,true);
assert.equal(calls.length,4);
''')


def test_unavailable_source_removes_path_and_empty_path_has_no_order_claim():
    run_projects(r'''
respond=()=>sceneA;await execute('openProject(sceneA.project_id)');
execute('selectProjectDecision("choice")');
respond=()=>({syntheticError:'ACCESS_DENIED',status:403});
await execute('readProjectMaterial(projectScene.materials[0])');
assert.equal(els['project-decisions'].children.length,0);
assert.equal(els['project-decision-order'].hidden,true);
assert(!flat(els['project-detail-content']).includes(sceneA.decisions.items[0].evidence[0].quote));
for(const decisions of [null,{...sceneA.decisions,items:[]},{...sceneA.decisions,items:[sceneA.decisions.items[1]]}]){
  respond=()=>({...sceneA,decisions});await execute('openProject(sceneA.project_id)');
  assert.equal(els['project-decisions'].children.length,0);
  assert.equal(els['project-decision-order'].hidden,true);
}
''')


def test_path_explains_reading_order_and_uses_existing_sibling_sidebar():
    html = PAGE.read_text(encoding='utf-8')
    structure = Structure()
    structure.feed(html)
    nodes = structure.nodes
    assert nodes['project-decisions'][1]['aria-describedby'] == 'project-decision-order-detail'
    assert nodes['project-decisions'][1]['class'] == 'project-decisions decision-path'
    assert '连线仅表示阅读／整理顺序，不表示因果或依赖。' in html
    assert '按原消息日期排列 · 日期未知另列</p>' in html
    assert '日期未知项保留回顾包整理顺序' in html
    assert '.decision-path>.decision-card:not(:last-child)::after' in html
    assert nodes['project-detail'][0] == 'aside'
    assert not any(attrs.get('id') == 'project-decisions'
                   for _, attrs in nodes['project-detail'][2])
    assert nodes['project-observations-section'][1]['hidden'] is None
