import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const output = new URL('packages/dsh-plugin/lib/', root);
await mkdir(output, { recursive: true });
const frozen = {
  'services/workspace-state.ts': 'EFD9F11009698F69F6F3523D0DF1065BFDB2D56A809D39E8C03A1A416237F699',
  'services/asset-persistence.ts': '95EBE71ED73FE07577D241C32C4EDE268142CA3ED99F5D93AD3BF5F25A16AD72',
  'services/asset-sync.ts': '8B2622AF993A5A0A6528381D855F0EF77AD62045176BBC4E8DCB266391C99773',
  'knot-model.ts': '7EBDFE583FE308303CFCF7998F5B9788F7427ECE26BA0A8FCD31714695A0EAF3',
};
const sources = {};
for (const [file, hash] of Object.entries(frozen)) {
  const bytes = await readFile(new URL(`vendor/knot/src/${file}`, root));
  if (createHash('sha256').update(bytes).digest('hex').toUpperCase() !== hash) throw new Error(`Frozen Knot source changed: ${file}`);
  sources[file] = bytes.toString('utf8');
}
const core = sources['services/workspace-state.ts'];
await writeFile(new URL('workspace-state.js', output), stripTypeScriptTypes(core));
await writeFile(new URL('knot-model.js', output), stripTypeScriptTypes(sources['knot-model.ts']));
function section(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  if (first < 0 || last <= first || source.indexOf(start, first + 1) >= 0) throw new Error('Frozen extraction boundary missing or ambiguous');
  return source.slice(first, last);
}
const projection = section(sources['services/asset-sync.ts'], 'export function assetsToWorkflowJSON(', 'interface DiffResult');
const snapshot = section(sources['services/asset-persistence.ts'], 'const isRecord =', 'export function saveSnapshotLocal');
// The two port constants and FlowGram 1.0.14 line-identity algorithm are the only
// engine adapters needed by these existing pure validation/projection functions.
const adapter = `import {createDefaultWorkspace,validateWorkspace} from './workspace-state.js';\nconst failure=(code,message)=>({ok:false,error:{code,message}});\nconst KNOT_INPUT_PORT={portID:'in'},KNOT_OUTPUT_PORT={portID:'out'};\nconst WorkflowLineEntity={portInfoToLineId:({from,to,fromPort,toPort})=>\`\${from}_\${fromPort||''}-\${to||''}_\${toPort||''}\`};\n`;
await writeFile(new URL('snapshot.js', output), adapter + stripTypeScriptTypes(projection + '\n' + snapshot));
const client = await readFile(new URL('packages/dsh-plugin/src/client.cjs', root), 'utf8');
const css = await readFile(new URL('packages/dsh-plugin/src/style.css', root), 'utf8')
  + '\n' + await readFile(new URL('packages/dsh-plugin/src/run-status-panel.css', root), 'utf8');
const statusView = await readFile(new URL('packages/dsh-plugin/src/run-status-view.mjs', root), 'utf8');
if (!statusView.includes('export function createRunStatusView(') || /\bimport\s/.test(statusView)) throw new Error('Unexpected Run view module shape');
const statusPanel = await readFile(new URL('packages/dsh-plugin/src/run-status-panel.cjs', root), 'utf8');
const statusSource = await readFile(new URL('packages/dsh-plugin/src/run-status-source.cjs', root), 'utf8');
const localModules = `const hostRequire=require; const localCache=Object.create(null); const localModules={
"@kont/run-status-view":(require,exports)=>{${statusView.replace('export function createRunStatusView(', 'function createRunStatusView(')}\nexports.createRunStatusView=createRunStatusView;},
"@kont/run-status-panel":(require,exports)=>{${statusPanel}},
"@kont/run-status-source":(require,exports)=>{${statusSource}}};
require=name=>{if(!Object.hasOwn(localModules,name))return hostRequire(name);if(!Object.hasOwn(localCache,name)){const value={};localCache[name]=value;localModules[name](require,value);}return localCache[name];};`;
await writeFile(new URL('client.js', output), `window.__ModuleLoader__.load({id:"@kont/dsh-plugin",factory:(require)=>{const exports={};const CSS=${JSON.stringify(css)};\n${localModules}\n${client}\nreturn exports;}});\n`);
console.log('Built KONT host core and DSH browser bundle.');
