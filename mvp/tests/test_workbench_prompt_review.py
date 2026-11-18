"""Human-paced project review in the served HTML's Node DOM; no browser clicks.

The model reparents the same elements, tracks focus and media changes, and only
returns explicitly supplied API responses. No business store or model is used.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path
from hashlib import sha256

import pytest

from test_workbench_projects import HARNESS, LIST, PAGE, SCENE_A, SCENE_B, Structure
from test_project_http import env, call, body as http_import


ENHANCE = r'''
E.prototype.removeAttribute=function(key){delete this.attrs[key];};
E.prototype.append=function(...nodes){for(const node of nodes){if(node.parentElement){node.parentElement.children=node.parentElement.children.filter(child=>child!==node);}node.parentElement=this;this.children.push(node);}};
E.prototype.replaceChildren=function(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes);};
E.prototype.select=function(){this.selected=true;};
E.prototype.contains=function(node){while(node){if(node===this)return true;node=node.parentElement;}return false;};
E.prototype.insertBefore=function(node,before){this.append(node);this.children=this.children.filter(child=>child!==node);const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,node);};
E.prototype.setPointerCapture=function(id){this.captured=id;};E.prototype.hasPointerCapture=function(id){return this.captured===id;};E.prototype.releasePointerCapture=function(){delete this.captured;};
E.prototype.focus=function(){this.focused++;ctx.document.activeElement=this;};
const media={};const clipboard=[];let clipboardFailure=false;
const mediaQuery=query=>media[query]??=( {matches:false,listeners:[],addEventListener(event,fn){this.listeners.push(fn);}} );
Object.defineProperty(E.prototype,'id',{get(){return this._id;},set(value){this._id=value;els[value]=this;}});
// Complete the existing lightweight parser with actual parent links.
const stack=[],voids=new Set(['meta','input','br','hr','img','link','source','area','base','wbr']);
for(const match of html.split('<script')[0].matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)){
  const tag=match[2].toLowerCase();if(match[1]){while(stack.length){const node=stack.pop();if(node.tagName.toLowerCase()===tag)break;}continue;}
  const id=match[3].match(/\bid="([^"]+)"/),node=id?els[id[1]]:new E(tag);if(!node)continue;
  if(id)node._id=id[1];const tail=html.slice(match.index+match[0].length);if(!tail.startsWith('<'))node.textContent=tail.split('<')[0].trim();if(stack.length)stack.at(-1).append(node);if(!voids.has(tag))stack.push(node);
}
const scheduled=[],windowEvents={};
ctx.setTimeout=(fn,delay)=>{scheduled.push({fn,delay});return scheduled.length;};ctx.clearTimeout=id=>{if(scheduled[id-1])scheduled[id-1].fn=null;};
const flushTimers=delay=>{for(const task of scheduled.slice())if(task.fn&&task.delay<=delay){const fn=task.fn;task.fn=null;fn();}};
ctx.addEventListener=(event,fn)=>(windowEvents[event]??=[]).push(fn);
ctx.matchMedia=mediaQuery;ctx.navigator={clipboard:{writeText:async value=>{if(clipboardFailure)throw Error('Denied');clipboard.push(value);}}};
'''
REVIEW_HARNESS = HARNESS.replace(
    "execute(html.split('<script id=\"workbench-code\">')[1].split('</script>')[0]);",
    ENHANCE + "\nexecute(html.split('<script id=\"workbench-code\">')[1].split('</script>')[0]);"
)


def run_review(body, *, dataset=None, listing=None, scene_a=None, scene_b=None, extra=None):
    node = shutil.which('node')
    assert node, 'Node required for project review DOM contracts'
    result = subprocess.run(
        [node, '-e', REVIEW_HARNESS + SETUP + body +
         '\n})().catch(e=>{console.error(e);process.exitCode=1;});'],
        input=json.dumps(dict(page=str(PAGE), list=LIST if listing is None else listing,
                             sceneA=SCENE_A if scene_a is None else scene_a,
                             sceneB=SCENE_B if scene_b is None else scene_b,extra=extra,
                             dataset=dict(projects='enabled') if dataset is None else dataset)),
        text=True, encoding='utf-8', capture_output=True, timeout=20)
    assert result.returncode == 0, result.stderr


SETUP = r'''
const ui=name=>els['project-review-'+name],api=code=>execute('projectReviewUI.'+code),state=()=>api('state()');
const source={...sceneA.materials[0],text:'Exact original 😀 <img src=x>\nActual early record',message_time_ms:1794700000000,thread_id:'t',message_id:'m'};
sceneA.observations=[source];
const bind=scene=>({project_id:scene.project_id,revision:scene.revision,manifest_hash:scene.manifest_hash});
const evidence={asset_id:source.asset_id,content_hash:source.content_hash,quote:'Exact original 😀 <img src=x>'};
const resultFor=scene=>({version:'knot.project-review/0.1',...bind(scene),...Object.fromEntries(['origin','current','completed','blocked','next'].map(key=>[key,{summary:key+' summary <script>literal</script>',evidence:key==='next'?[]:[evidence]}])),milestones:[{id:'m1',title:'A natural milestone',summary:'A supported change',on:null,evidence:[evidence]}],gaps:['Uncertain point']});
const prepareReply=model=>({...bind(model),document:{title:'项目主动回顾.json',text:JSON.stringify(model)},human_view:'# Human view\nAgent 概括，待人核对'});
const promptReply=scene=>({...bind(scene),prompt:'FULL instruction\n'+source.text,collection_prompt:'Search all windows; page fully; Markdown coverage',coverage:{readable_sources:1,has_unavailable:false,unavailable_count:null}});
const receipt={project_id:sceneA.project_id,revision:'3',manifest_hash:'f'.repeat(64)};
let latest=sceneA;
const respondNormally=(url,options)=>{
  if(url.startsWith('/api/project?'))return latest;
  if(url==='/api/project-review-prompt')return promptReply(latest);
  if(url==='/api/project-review-prepare')return prepareReply(JSON.parse(options.body));
  if(url==='/api/project-review-collect')return {...bind(latest),available:false,document:null,summary:{documents:0,media:0,git:false,limited:false},message:'未配置开发记录，可使用已留存材料。'};
  if(url==='/api/project-import'){const body=JSON.parse(options.body);latest={...copy(sceneA),...receipt,materials:[...sceneA.materials,{asset_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',content_hash:'e'.repeat(64),title:body.documents[0].title}]};return receipt;}
  if(url.startsWith('/api/project-material?')){const args=new URLSearchParams(url.split('?')[1]);return {project_id:args.get('project_id'),revision:args.get('revision'),asset_id:args.get('asset_id'),content_hash:args.get('expected_hash'),title:'项目主动回顾.json',text:JSON.stringify(resultFor(sceneA))};}
  if(url==='/api/projects')return payload.list;
  throw Error('Unexpected '+url);
};
const open=async()=>{respond=respondNormally;await execute('openProject(sceneA.project_id)');};
const launch=async()=>{respond=respondNormally;assert.equal(await api('launch()'),true);};
const paste=model=>{ui('return').value=JSON.stringify(model??resultFor(sceneA));api('returnChanged()');};
const prepare=async()=>{paste();respond=respondNormally;assert.equal(await api('prepare()'),true);};
const ready=()=>{ui('checked').checked=true;ui('checked').events.change[0]();api('ready()');};
'''


def test_entry_immediately_shows_real_prompt_and_nodes_do_not_run_requests():
    run_review(r'''
assert.equal(calls.length,1);assert.equal(ui('launch').hidden,true);
await open();const before=calls.length;assert.equal(ui('launch').textContent,'整理这个项目');
await launch();assert.equal(calls.length,before+1);
assert(ui('prompt').value.includes(source.text));assert.equal(state().selected,2);
assert.equal(api('current()'),2);assert.equal(ui('step-2').attrs['aria-current'],'step');
assert.equal(ui('step-2').attrs['aria-pressed'],'true');
api('selectNode(1)');api('selectNode(5)');assert.equal(calls.length,before+1);
assert(ui('prerequisite').textContent);assert.equal(ui('save').disabled,true);
api('selectNode(2)');assert.equal(ui('step-2').attrs['aria-current'],'step');
await api('copyPrompt()');assert.equal(clipboard.at(-1),ui('prompt').value);
assert.equal(ui('step-3').attrs['aria-current'],'step');
clipboardFailure=true;assert.equal(await api('copyPrompt()'),false);assert(ui('prompt').selected);assert(ui('feedback').textContent.includes('手动复制'));
''')


def test_three_views_and_media_move_one_work_area_without_clearing_focus_or_text():
    run_review(r'''
await open();await launch();paste();api('selectNode(3)');
const work=ui('work'),input=ui('return'),text=input.value;input.focus();
const mq=mediaQuery('(max-width:959px)');mq.matches=true;for(const fn of mq.listeners)fn();
assert.equal(work.parentElement,ui('node-3'));assert.equal(input.value,text);assert.equal(ctx.document.activeElement,input);
api('selectNode(2)');assert.equal(work.parentElement,ui('node-2'));assert.equal(input.value,text);
mq.matches=false;for(const fn of mq.listeners)fn();assert.equal(work.parentElement,ui('layout'));
const before=calls.length;api('setView("records")');api('setView("activity")');api('setView("flow")');assert.equal(calls.length,before);assert.equal(input.value,text);
assert.equal(els['project-records-legacy'].parentElement,ui('records-slot'));
''')


def test_manual_history_collection_is_text_exact_import_and_fresh_prompt():
    run_review(r'''
await open();api('setView("flow")');await api('copyCollection()');
assert.equal(clipboard.at(-1),'Search all windows; page fully; Markdown coverage');
const raw='# All related windows\nRead: one\nPartial: two\nUnreadable: three\nLiteral <img src=x> 😀';
ui('collection-input').value=raw;api('collectionChanged()');const before=calls.length;
api('addCollection()');assert.equal(calls.length,before);assert.equal(state().collection.document.title,'Agent收集的项目资料.md');
await api('saveDocument("collect")');
const save=calls.find(call=>call.url==='/api/project-import'),body=JSON.parse(save.options.body);
assert.deepEqual(body.documents,[{title:'Agent收集的项目资料.md',text:raw}]);assert.equal(body.project_id,sceneA.project_id);assert.equal(body.expected_revision,'2');
assert.equal(state().binding.revision,'3');assert.equal(state().selected,2);assert(ui('prompt').value);
const prompt=calls.filter(call=>call.url==='/api/project-review-prompt').at(-1);assert.equal(JSON.parse(prompt.options.body).revision,'3');
''')


def test_unknown_collection_keeps_same_request_and_disallows_rekey_or_abandon():
    run_review(r'''
await open();ui('collection-input').value='Human Markdown package';api('collectionChanged()');api('addCollection()');
respond=()=>{throw Error('Lost reply');};await api('saveDocument("collect")');
const serialized=calls.at(-1).options.body,requestId=JSON.parse(serialized).request_id;
assert.equal(state().saves.collect.phase,'unknown');assert.equal(await execute('openProject(sceneB.project_id)'),false);
assert.throws(()=>api('abandon()'));await assert.rejects(api('generatePrompt()'));
ui('collection-input').value='Changed body';api('collectionChanged()');assert.equal(ui('collection-input').value,'Human Markdown package');
respond=(url,options)=>{if(url==='/api/project-import'){assert.equal(options.body,serialized);return respondNormally(url,options);}return respondNormally(url,options);};
await api('saveDocument("collect")');assert.equal(state().saves.collect.body.request_id,requestId);assert.equal(state().saves.collect.phase,'saved');
''')


def test_prepare_is_human_readable_literal_and_requires_read_confirmation_before_save():
    run_review(r'''
await open();await launch();await prepare();
assert.equal(state().selected,4);assert(flat(ui('preview')).includes('A natural milestone'));
assert(flat(ui('preview')).includes('<script>literal</script>'));assert(flat(ui('preview')).includes('无出处，待核'));
assert(!flat(ui('preview')).includes('"manifest_hash"'));assert.equal(calls.filter(call=>call.url==='/api/project-import').length,0);
assert.throws(()=>api('ready()'));ready();assert.equal(state().selected,5);
await api('saveDocument("review")');assert.equal(state().saves.review.phase,'saved');
const body=JSON.parse(calls.find(call=>call.url==='/api/project-import').options.body);
assert.equal(body.documents.length,1);assert.equal(body.documents[0].title,'项目主动回顾.json');assert.equal(body.expected_revision,'2');
await api('viewSaved()');assert(flat(ui('activity-prose')).includes('current summary'));
assert(ui('current').textContent.includes('current summary'));assert.equal(state().saves.review.phase,'saved');
const validated=calls.filter(call=>call.url==='/api/project-review-prepare').at(-1);assert.equal(JSON.parse(validated.options.body).revision,'2');
''')


def test_bad_json_wrong_binding_prepare_failure_and_size_limit_preserve_input():
    run_review(r'''
await open();await launch();ui('return').value='{broken';api('returnChanged()');await assert.rejects(api('prepare()'));assert.equal(ui('return').value,'{broken');
paste({...resultFor(sceneA),project_id:sceneB.project_id});await assert.rejects(api('prepare()'));
paste();respond=()=>({syntheticError:'CONTENT_MISMATCH'});assert.equal(await api('prepare()'),false);assert.equal(state().returnText,ui('return').value);assert.equal(ui('preview').children.length,0);
ui('collection-input').value='中'.repeat(20001);api('collectionChanged()');assert.throws(()=>api('addCollection()'));assert.equal(ui('collection-input').value.length,20001);
''')


def test_recheck_instruction_is_manual_and_new_return_invalidates_previous_preview():
    run_review(r'''
await open();await launch();await prepare();const before=calls.length;
api('refine()');assert(ui('refine-prompt').value.includes('严格 knot.project-review/0.1 JSON'));
assert(ui('refine-prompt').value.includes(state().returnText));assert.equal(calls.length,before);
ui('return').value=JSON.stringify({...resultFor(sceneA),gaps:['New gap']});api('returnChanged()');assert.equal(state().preview,null);assert.equal(ui('preview').children.length,0);assert.equal(state().checked,false);
''')


def test_unknown_review_retries_same_body_and_stays_locked_across_views():
    run_review(r'''
await open();await launch();await prepare();ready();respond=()=>{throw Error('Lost response');};await api('saveDocument("review")');
const original=calls.at(-1).options.body,seq=sequence;assert.equal(state().saves.review.phase,'unknown');
api('setView("records")');api('setView("flow")');assert.equal(state().saves.review.serialized,original);
assert.equal(await execute('showProjectOverview()'),false);assert.equal(await execute('openProject(sceneB.project_id)'),false);assert.throws(()=>api('abandon()'));
respond=(url,options)=>{if(url==='/api/project-import')assert.equal(options.body,original);return respondNormally(url,options);};await api('saveDocument("review")');assert.equal(sequence,seq);assert.equal(state().saves.review.phase,'saved');
''')


def test_capability_off_has_no_new_requests_or_fake_workflow():
    run_review(r'''
assert.equal(calls.length,0);assert.equal(ui('launch').hidden,true);await assert.rejects(api('launch()'));assert.equal(calls.length,0);
''', dataset={})


def test_markup_and_breakpoints_have_single_work_area_and_no_technical_visible_labels():
    html = PAGE.read_text(encoding='utf-8')
    structure = Structure()
    structure.feed(html)
    assert structure.nodes['project-review-work'][0] == 'section'
    assert html.count('id="project-review-work"') == 1
    for number in range(1, 6):
        assert structure.nodes[f'project-review-step-{number}'][1]['aria-controls'] == 'project-review-work'
    assert 'grid-template-columns:168px minmax(0,1fr)' in html
    assert '@media(max-width:959px)' in html
    assert '@media(max-width:759px)' in html
    assert 'height:100dvh' in html
    assert 'prefers-reduced-motion:reduce' in html


def test_conflict_rebind_is_explicit_preserves_original_and_revalidates_before_new_save():
    run_review(r'''
await open();await launch();await prepare();ready();const oldText=state().returnText;
respond=()=>({syntheticError:'REVISION_CONFLICT',status:409});await api('saveDocument("review")');
const oldRequest=state().saves.review.body.request_id;assert.equal(ui('rebind').hidden,false);assert.equal(state().returnText,oldText);
latest={...copy(sceneA),revision:'3',manifest_hash:'f'.repeat(64)};respond=respondNormally;
assert.equal(await api('rebind()'),true);assert.equal(state().previousReturn,oldText);
assert.equal(JSON.parse(state().returnText).revision,'3');assert.equal(state().preview.binding.revision,'3');
ready();respond=(url,options)=>{if(url==='/api/project-import'){const b=JSON.parse(options.body);assert.equal(b.expected_revision,'3');assert.notEqual(b.request_id,oldRequest);latest={...latest,revision:'4',manifest_hash:'e'.repeat(64)};return {...receipt,revision:'4',manifest_hash:'e'.repeat(64)};}return respondNormally(url,options);};
await api('saveDocument("review")');assert.equal(state().saves.review.phase,'saved');
''')


def test_no_root_and_prompt_limit_are_honest_zero_import_preparations():
    run_review(r'''
await open();assert.equal(await api('collect()'),true);assert.equal(state().collection.available,false);assert(ui('collect-message').textContent.includes('未配置'));
assert.equal(calls.filter(call=>call.url==='/api/project-import').length,0);
respond=()=>({syntheticError:'RESPONSE_LIMIT',status:503});assert.equal(await api('launch()'),false);
assert.equal(ui('prompt').value,'');assert(ui('feedback').textContent.includes('未生成'));
assert.equal(calls.filter(call=>call.url==='/api/project-import').length,0);
''')


def test_calendar_focus_scroll_never_deletes_or_rebuilds_retained_day_groups():
    run_review(r'''
sceneA.observations=[{...source,message_time_ms:Date.parse('2024-02-28T08:00:00Z')},{...source,asset_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',text:'Later retained original',message_id:'later',message_time_ms:Date.parse('2024-03-02T08:00:00Z')}];
await open();api('setView("records")');const groups=els['project-observations'].children.slice();
assert.equal(groups.length,2);assert(groups.every(group=>group.children.find(node=>node.tagName==='DETAILS').open===false));
const index=execute('projectCalendarIndex("2024-02-29")');assert.equal(index,1);
execute('projectCalendarUI.submit('+index+')');assert.equal(execute('projectCutoff'),'2024-02-29');
assert.deepEqual(els['project-observations'].children,groups);assert(flat(els['project-observations']).includes('Later retained original'));
assert(els['project-day-position'].textContent.includes('暂无已读取记录'));assert(els['focus-subtitle'].textContent.includes('当前全部可读记录'));
execute('projectCalendarUI.userIntent()');assert.equal(execute('projectDateFromScroll("2024-03-02")'),true);
assert.equal(execute('projectCutoff'),'2024-03-02');assert.deepEqual(els['project-observations'].children,groups);
assert.equal(execute('projectScrollTarget'),null);assert.equal(calls.filter(call=>call.url.startsWith('/api/project?')).length,1);
''')


def test_virtual_calendar_keyboard_day_steps_and_end_are_distinct_from_latest():
    run_review(r'''
source.message_time_ms=Date.parse('2020-02-28T08:00:00Z');sceneA.observations=[source];await open();
const key=name=>execute('projectCalendarUI.keyboard({key:'+JSON.stringify(name)+',preventDefault(){}})');
key('Home');assert.equal(execute('projectCutoff'),'2020-02-28');key('ArrowDown');assert.equal(execute('projectCutoff'),'2020-02-29');key('ArrowDown');assert.equal(execute('projectCutoff'),'2020-03-01');
key('PageDown');assert.equal(execute('projectCutoff'),'2020-03-08');key('End');assert.equal(execute('projectCutoff'),execute('projectCalendarEnd()'));
assert.notEqual(execute('projectCutoff'),null);execute('latestProjectDate()');assert.equal(execute('projectCutoff'),null);
assert(Number(els['project-date-range'].max)>1000);assert(els['project-calendar-rows'].children.length<25);
assert.equal(els['project-date-range'].step,'1');
''')


def test_calendar_drag_cancel_capture_cleanup_and_content_preview_are_bounded():
    run_review(r'''
source.message_time_ms=Date.parse('2026-01-01T08:00:00Z');sceneA.observations=[source];await open();
execute('selectProjectDate(4,{locate:false})');const before=execute('projectCutoff'),node=els['project-calendar-viewport'];
execute('projectCalendarUI.pointerDown({button:0,pointerId:7,clientY:100})');execute('projectCalendarUI.pointerMove({pointerId:7,clientY:95,preventDefault(){}})');assert.equal(node.captured,undefined);
execute('projectCalendarUI.pointerMove({pointerId:7,clientY:28,preventDefault(){}})');assert.equal(node.captured,7);
execute('projectCalendarUI.finish({pointerId:7},true)');assert.equal(node.captured,undefined);assert.equal(execute('projectCutoff'),before);assert.equal(execute('projectCalendarUI.state().dragging'),false);
execute('projectCalendarUI.contentPreview("2026-01-03")');assert.equal(execute('projectCutoff'),before);flushTimers(100);assert.equal(execute('projectCutoff'),'2026-01-03');
execute('projectCalendarUI.contentPreview("2026-01-04")');execute('projectCalendarUI.userIntent()');flushTimers(100);assert.equal(execute('projectCutoff'),'2026-01-03');
''')


def test_wheel_commits_last_native_scroll_to_visible_activity_and_distinguishes_other_projects():
    run_review(r'''
const first='2026-10-03',other='2026-10-04',second='2026-10-05';
const stamp=day=>Date.parse(day+'T08:00:00Z');
source.message_time_ms=stamp(first);
sceneA.observations=[source,{...source,asset_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  text:'Second day real project activity',message_id:'later',message_time_ms:stamp(second)}];
payload.list.items[0].chronology={appearance_at:stamp(first),appearance_basis:'first_saved',
  observation_times:[stamp(first),stamp(second)],observation_count:2};
payload.list.items[1].chronology={appearance_at:stamp(other),appearance_basis:'first_saved',
  observation_times:[],observation_count:0};
respond=respondNormally;await execute('loadProjects()');await open();
const rail=execute('projectCalendarUI'),viewport=els['project-calendar-viewport'];
const groups=Array.from(execute('visibleProjectDays()'));
const seen=[];for(const group of groups)group.scrollIntoView=()=>seen.push(group.dataset.day);
assert.deepEqual(groups.map(group=>group.dataset.day),[first,second]);
const move=day=>{viewport.events.wheel[0]();viewport.scrollTop=execute('projectCalendarIndex('+JSON.stringify(day)+')')*36;viewport.events.scroll[0]();};
rail.contentPreview(first);move(other);move(second);
assert.equal(execute('projectCutoff'),null);assert.equal(rail.state().previewDay,second);
flushTimers(100);
assert.equal(execute('projectCutoff'),second);assert.deepEqual(seen,[second]);
assert(flat(groups[1]).includes('Second day real project activity'));
assert.equal(groups[1].dataset.current,'true');
move(other);flushTimers(100);
assert.equal(execute('projectCutoff'),other);
const row=els['project-calendar-rows'].children.find(row=>row.dataset.day===other);
assert.equal(row.dataset.recorded,'false');assert.equal(row.dataset.otherRecord,'true');
assert(els['project-activity-date'].textContent.includes('本项目当天暂无可读记录'));
assert(flat(els['project-activity-context']).includes(payload.list.items[1].title));
assert.deepEqual(seen,[second]);
move(first);viewport.events.wheel[0]();flushTimers(100);
assert.equal(execute('projectCutoff'),first);assert.deepEqual(seen,[second,first]);
''')


def test_main_scroll_returning_to_committed_day_cancels_its_previous_preview():
    run_review(r'''
const first='2026-10-03',second='2026-10-05';
source.message_time_ms=Date.parse(first+'T08:00:00Z');
sceneA.observations=[source,{...source,asset_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  text:'Second day real project activity',message_time_ms:Date.parse(second+'T08:00:00Z')}];
await open();
const rail=execute('projectCalendarUI');
execute('selectProjectDate(0,{locate:false})');
const groups=Array.from(execute('visibleProjectDays()'));
els['workbench-main'].getBoundingClientRect=()=>({top:0,bottom:600,height:600});
groups[0].getBoundingClientRect=()=>({top:-100});
let secondTop=100;groups[1].getBoundingClientRect=()=>({top:secondTop});
rail.userIntent();rail.contentScroll();
assert.equal(rail.state().previewDay,second);
secondTop=240;rail.contentScroll();flushTimers(100);
assert.equal(rail.state().previewDay,null);
assert.equal(execute('projectCutoff'),first);
assert.equal(els['project-activity-date'].textContent,first);
''')


def test_date_known_only_in_newer_revision_is_not_marked_as_another_project():
    run_review(r'''
const first='2026-10-03',headDay='2026-10-05',stamp=day=>Date.parse(day+'T08:00:00Z');
source.message_time_ms=stamp(first);
payload.list.items[0].chronology={appearance_at:stamp(first),appearance_basis:'first_saved',
  observation_times:[stamp(first),stamp(headDay)],observation_count:2};
respond=respondNormally;await execute('loadProjects()');await open();
execute('selectProjectDate(projectCalendarIndex("'+headDay+'"),{locate:false})');
const row=els['project-calendar-rows'].children.find(row=>row.dataset.day===headDay);
assert.equal(row.dataset.recorded,'false');
assert.equal(row.dataset.otherRecord,'false');
assert.equal(els['project-activity-context'].hidden,true);
''')


def test_latest_and_project_change_cancel_queued_calendar_commits():
    run_review(r'''
source.message_time_ms=Date.parse('2026-10-03T08:00:00Z');await open();
const rail=execute('projectCalendarUI'),viewport=els['project-calendar-viewport'];
rail.contentPreview('2026-10-04');
execute('latestProjectDate()');
viewport.events.scroll[0]();flushTimers(100);
assert.equal(execute('projectCutoff'),null);assert.equal(execute('projectScrollTarget'),null);
viewport.events.wheel[0]();viewport.scrollTop=36;viewport.events.scroll[0]();
assert.equal(rail.state().previewDay,'2026-10-04');
respond=url=>url.startsWith('/api/project?')?sceneB:respondNormally(url);
assert.equal(await execute('openProject(sceneB.project_id)'),true);
flushTimers(100);
assert.equal(execute('projectCutoff'),null);assert.equal(execute('projectScrollTarget'),null);
assert.equal(rail.state().previewDay,null);
''')


def test_selected_day_updates_when_saved_history_index_finishes_loading():
    run_review(r'''
const selected='2026-10-05',stamp=Date.parse('2026-10-03T08:00:00Z');
source.message_time_ms=stamp;
const index={...sceneA.materials[0],asset_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',title:'历史窗口日回顾索引·样例'};
sceneA.materials.push(index);
let release;
const pending=new Promise(resolve=>{release=resolve;});
respond=url=>url.startsWith('/api/project-material?')?pending:respondNormally(url);
await execute('openProject(sceneA.project_id)');
const visited=[];E.prototype.scrollIntoView=function(){if(this.dataset.day)visited.push(this.dataset.day);};
execute('projectCalendarUI.submit(projectCalendarIndex("'+selected+'"))');
assert(els['project-activity-date'].textContent.includes('正在读取'));
release({...index,...bind(sceneA),text:JSON.stringify({version:'knot.history-window-days/0.1',project_id:sceneA.project_id,
  coverage:{windows:1,read:1,partial:0,messages:1},days:[{on:selected,user_records:1,assistant_records:0,
    windows:[{thread_id:'t-sample',title:'Saved window',status:'read',source_document_title:'source',
      user_records:1,assistant_records:0,tags:[],excerpts:[]}]}]})});
for(let i=0;i<30;i++)await Promise.resolve();
assert.equal(els['project-activity-date'].textContent,selected);
assert.deepEqual(visited,[selected]);
assert.equal(els['project-history-days'].children.find(group=>group.dataset.day===selected).dataset.current,'true');
''')


def test_poll_hash_change_recovers_reading_automatically_but_keeps_returned_input_locked():
    run_review(r'''
const list={items:payload.list.items.map(item=>item.project_id===sceneA.project_id?{...item,visibility_hash:'a'.repeat(64)}:item)};
respond=()=>list;await execute('loadProjects()');await open();
const updated={items:list.items.map(item=>item.project_id===sceneA.project_id?{...item,visibility_hash:'b'.repeat(64)}:item)};
respond=url=>url==='/api/projects'?updated:sceneA;await execute('refreshCapturedProjects()');
assert.equal(execute('projectSceneInvalidated'),false);assert.equal(els['project-read-stale'].hidden,true);
await launch();paste();const raw=state().returnText;
respond=()=>({items:updated.items.map(item=>({...item,visibility_hash:'c'.repeat(64)}))});const count=calls.filter(call=>call.url.startsWith('/api/project?')).length;
await execute('refreshCapturedProjects()');assert.equal(execute('projectSceneInvalidated'),true);assert.equal(state().returnText,raw);assert.equal(ui('prompt').value,'');assert.equal(ui('replay-text').value,'');
assert.equal(calls.filter(call=>call.url.startsWith('/api/project?')).length,count);
''')


def test_real_broker_collection_prompt_save_and_source_revalidated_activity(env):
    database, core, ui_port = env
    request = http_import(text='Exact original 😀 <img src=x>\nActual early record')
    assert call(ui_port, '/api/project-import', request, broker=True)[0] == 200
    catalog = call(ui_port, '/api/projects')[1]
    scene = call(ui_port, '/api/project?project_id=' + request['project_id'])[1]
    run_review(r'''
const http=require('http'),port=payload.extra.port;
respond=(url,options={})=>new Promise((resolve,reject)=>{const headers={...(options.headers||{})};if(options.method==='POST'){headers.Origin='http://127.0.0.1:'+port;headers['Content-Length']=Buffer.byteLength(options.body||'');}const req=http.request({hostname:'127.0.0.1',port,path:url,method:options.method||'GET',headers},res=>{let raw='';res.setEncoding('utf8');res.on('data',chunk=>raw+=chunk);res.on('end',()=>{const value=JSON.parse(raw);resolve(res.statusCode===200?value:{syntheticError:value.error,status:res.statusCode});});});req.on('error',reject);if(options.body)req.write(options.body);req.end();});
await execute('openProject(sceneA.project_id)');assert.equal(await api('launch()'),true);
assert(ui('prompt').value.includes('Exact original'));assert(ui('collection-prompt').value.includes('分页'));
paste(resultFor(sceneA));assert.equal(await api('prepare()'),true);ready();assert.equal(await api('saveDocument("review")'),true);
assert.equal(state().saves.review.phase,'saved');assert.equal(await api('viewSaved()'),true);
assert(flat(ui('activity-prose')).includes('A natural milestone'));assert(ui('current').textContent.includes('current summary'));
assert.equal(JSON.parse(calls.filter(call=>call.url==='/api/project-review-prepare').at(-1).options.body).revision,sceneA.revision);
''', listing=catalog, scene_a=scene, extra=dict(port=ui_port))


def test_actual_history_indexes_open_with_project_and_merge_by_day():
    configured=os.environ.get('KNOT_HISTORY_TEST_ROOT')
    if not configured:
        pytest.skip('No private history payload was supplied')
    root=Path(configured)
    if not (root/'index.json').exists():
        pytest.skip('Private authorized history payload is not present on this host')
    index = json.loads((root/'index.json').read_text(encoding='utf-8'))
    documents = [json.loads(Path(ref['documentPath']).read_text(encoding='utf-8')) for ref in index['documents']]
    project_id = json.loads(documents[0]['text'])['project_id']
    scene = json.loads(json.dumps(SCENE_A))
    scene['project_id'] = project_id
    materials = []
    for number, document in enumerate(documents):
        materials.append(dict(asset_id=f'dddddddd-dddd-4ddd-8ddd-{number:012d}',
                              content_hash=sha256(document['text'].encode()).hexdigest(), title=document['title']))
    scene['materials'] += materials
    catalog = dict(items=[dict(LIST['items'][0], project_id=project_id, material_count=len(scene['materials']))])
    run_review(r'''
const docs=payload.extra.documents,materials=sceneA.materials.filter(ref=>ref.title.startsWith('历史窗口日回顾索引·'));
respond=(url,options)=>{if(!url.startsWith('/api/project-material?'))return respondNormally(url,options);const args=new URLSearchParams(url.split('?')[1]),i=materials.findIndex(ref=>ref.asset_id===args.get('asset_id'));if(i<0)throw Error('Unexpected source');return {...materials[i],project_id:sceneA.project_id,revision:sceneA.revision,text:docs[i].text};};
await execute('openProject(sceneA.project_id)');
for(let i=0;i<40;i++)await Promise.resolve();
assert.equal(calls.filter(call=>call.url.startsWith('/api/project-material?')).length,docs.length);
assert.equal(execute('projectHistoryUI.days().length'),payload.extra.days);
assert.equal(els['project-history-days'].children.length,payload.extra.days);
assert(els['project-history-status'].textContent.includes('48 个窗口'));assert(els['project-history-status'].textContent.includes('2498'));
assert(!flat(els['project-history-days']).includes('阅读全文'));
assert(flat(els['project-history-days']).includes('以下只展示片段'));
for(const group of els['project-history-days'].children){const windows=group.children.filter(node=>node.className==='history-window');assert.equal(new Set(windows.map(node=>node.dataset.threadId)).size,windows.length);assert(windows.every(node=>node.open===false));}
const days=Array.from(execute('projectHistoryUI.days()'));for(const day of days)assert(Array.from(execute('projectDateDays()')).includes(day));
execute('invalidateProjectScene()');assert.equal(execute('projectHistoryUI.days().length'),0);assert.equal(els['project-history-days'].children.length,0);
''', listing=catalog, scene_a=scene, extra=dict(documents=documents, days=index['days']))


def test_rejected_daily_index_withdraws_appearance_even_if_list_still_has_the_reference():
    run_review(r'''
const indexRef={...sceneA.materials[0],title:'历史窗口日回顾索引·1.json'};
sceneA.materials.push(indexRef);
const stamp=Date.parse('2026-08-31T10:00:00Z');
const item=payload.list.items.find(row=>row.project_id===sceneA.project_id);
item.chronology={appearance_at:stamp,appearance_basis:'first_window_record',appearance_source:{asset_id:indexRef.asset_id,content_hash:indexRef.content_hash},observation_times:[],observation_count:0};
respond=(url,options)=>url.startsWith('/api/project-material?')?{syntheticError:'ACCESS_DENIED',status:403}:respondNormally(url,options);
await execute('loadProjects()');
await execute('openProject(sceneA.project_id)');
for(let i=0;i<40;i++)await Promise.resolve();
assert.equal(execute('projectSceneInvalidated'),true);
assert(!Array.from(execute('projectDateDays()')).includes('2026-08-31'));
assert.equal(els['project-appearance-info'].children.length,0);
assert.equal(els['project-history-days'].children.length,0);
assert(calls.filter(call=>call.url.startsWith('/api/projects')).length>=2);
''')
