import {fastLearnedCpu} from './fast-learned-cpu.js';
self.onmessage=({data})=>{try{self.postMessage(fastLearnedCpu(data,{budget:45,maxRounds:6})??undefined)}catch{self.postMessage(undefined)}};
