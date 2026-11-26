import { roster, types, effectiveness, struggle } from '../src/data.js';
import { makeTeam } from '../src/battle.js';
import { writeFileSync } from 'node:fs';
const keys = Object.keys(types);
const chars = makeTeam(roster.map(c=>c.id)).map(c=>({id:c.id,stats:c.stats,types:c.types.map(t=>keys.indexOf(t)),item:c.item??'',moves:c.moves.map(m=>({...m,type:keys.indexOf(m.type)}))}));
writeFileSync(new URL('../rust/data.json',import.meta.url),JSON.stringify({chars,chart:keys.map(a=>keys.map(b=>effectiveness(a,[b])*2)),struggle:{...struggle,type:0,pp:0}},null,0)+'\n');
