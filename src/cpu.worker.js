import {liveCpuAction} from './ai.js';
self.onmessage=({data})=>{try{self.postMessage(liveCpuAction(data,{budget:2600})??undefined)}catch{self.postMessage(undefined)}};
