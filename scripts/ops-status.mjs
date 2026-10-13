import {Firestore} from '@google-cloud/firestore';
const project=process.env.GOOGLE_CLOUD_PROJECT;
if(!project)throw new Error('GOOGLE_CLOUD_PROJECT required');
const origin=process.env.APP_ORIGIN||'https://merchreflex-927668522599.asia-southeast1.run.app';
const db=new Firestore({projectId:project});
const d=await db.collection('system').doc('model-budget').get();
const response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(15000)});
console.log(JSON.stringify({at:new Date().toISOString(),origin,healthStatus:response.status,health:await response.json(),applicationModelLedger:d.data(),billing:'Application estimate and conservative failure reserves, not a cloud billing statement.'},null,2));
