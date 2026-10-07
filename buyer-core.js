/* Public research feed + private review records. No contact or messaging API. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BBCORBuyerCore=api;})(typeof window!=='undefined'?window:globalThis,()=>{
'use strict';
const hold='Hold — confirm sale list and authorize outreach';
const nameKey=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'');
const idFor=s=>{let h=2166136261;for(const c of String(s).toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619);return 'buyer_'+String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60)+'_'+(h>>>0).toString(36)};
const domains=r=>String(r.sourceUrl||'').split(/\s*\|\s*/).map(s=>{try{return new URL(s).hostname.replace(/^www\./,'')}catch{return''}}).filter(Boolean);
function matches(a,b){const names=[b.company,...(b.aliases||[])].map(nameKey);return names.includes(nameKey(a.company))||(b.canonicalDomain&&domains(a).includes(b.canonicalDomain));}
function match(rows,p){const hits=rows.filter(r=>matches(r,p));return hits.length===1?hits[0]:null;}
const researchFields=['company','buyerType','whyFits','caveat','sourceUrl','compiled','contactRoute'];
function research(p){return Object.fromEntries(researchFields.map(k=>[k,String(p[k]||'')]).concat([['sourceVersion',p.sourceVersion||''],['sourceKey',p.sourceKey||''],['sourceVerification',p.sourceVerification||{}]]));}
function merged(notes,feed){const saved=Object.entries(notes||{}).filter(([,r])=>r&&r.entityType==='buyer_prospect').map(([id,r])=>({...r,id}));const out=saved.map(r=>({...r}));for(const p of feed?.prospects||[]){const hits=out.filter(r=>matches(r,p));if(hits.length>1)continue;const prior=hits[0];if(prior){prior.sourceProposal=p;prior.sourceNeedsReview=prior.sourceVersion!==p.sourceVersion||!prior.sourceReviewedAt;}else out.push({...research(p),id:idFor(p.company),priority:'Research',propertyMatch:'Unconfirmed — review acquisition criteria',entityType:'buyer_prospect',stage:'Research only',outreachStatus:hold,feedOnly:true,sourceNeedsReview:true,sourceProposal:p});}return out;}
function reviewed(current,p,uid,now){if(current&&current.entityType!=='buyer_prospect')throw Error('Record identity conflict');return {...(current||{}),...research(p),entityType:'buyer_prospect',priority:current?.priority||'Research',propertyMatch:current?.propertyMatch||'Unconfirmed — review acquisition criteria',stage:current?.stage||'Research only',internalNotes:current?.internalNotes||'',outreachStatus:current?.outreachStatus||hold,createdAt:current?.createdAt||now,updatedAt:now,sourceReviewedAt:now,sourceReviewedBy:uid};}
return {hold,nameKey,idFor,matches,match,merged,research,reviewed};
});
