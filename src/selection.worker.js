import {chooseOptimalTeam,recommendTeam,preloadSelection} from './team-selection.js';
void preloadSelection();
self.onmessage=async({data})=>{try{const {own,opponent,kind}=data;self.postMessage(await (kind==='choose'?chooseOptimalTeam(own,opponent):recommendTeam(own,opponent)))}catch{self.postMessage(null)}};
