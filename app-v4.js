(()=>{
'use strict';
const $=id=>document.getElementById(id);
const money=v=>Number(v||0);
const currency=v=>money(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
const today=()=>new Date().toISOString().slice(0,10);
const stamp=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const safeKey=s=>String(s||'').replace(/[.#$\[\]/]/g,'_');
const byDate=(a,b,key)=>String(a[key]||'9999').localeCompare(String(b[key]||'9999'));
let auth,db,user=null,userProfile=null,currentView='dashboard',data={properties:{},draws:{},termLoans:{},upcoming:{},notes:{},users:{},accessRequests:{},audit:{}};
let listeners=[];
const TITLES={dashboard:['Executive Dashboard','Live BBCOR portfolio overview'],properties:['Current Properties','Active property loans and availability'],draws:['Draw Ledger','Draw activity across current properties'],termLoans:['Term Loans','Term debt and upcoming maturities'],upcoming:['Upcoming Purchases','Acquisition pipeline and renovation budgets'],reports:['Reports & Data Transfer','Export, import, and portable backups'],admin:['Administration','Users, access requests, and audit history']};

function configValid(){const c=window.BBCOR_FIREBASE_CONFIG||{};return c.apiKey&&!String(c.apiKey).includes('PASTE_')&&c.databaseURL&&!String(c.databaseURL).includes('PASTE_')}
function flash(msg,type='success'){const el=document.createElement('div');el.className='flash '+type;el.textContent=msg;$('flashArea').prepend(el);setTimeout(()=>el.remove(),6000)}
function showOnly(id){['configScreen','loginScreen','pendingScreen','appShell'].forEach(x=>$(x).classList.toggle('hidden',x!==id));$('loading').classList.add('hidden')}
function canWrite(){return userProfile&&userProfile.active!==false&&['Admin','User'].includes(userProfile.role)}
function isAdmin(){return userProfile?.role==='Admin'&&userProfile.active!==false}
function buttonDisabled(){return canWrite()?'':'disabled title="Read-only access"'}
function modal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden');$('modalBody').innerHTML=''}
$('modalClose').onclick=closeModal;$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
function confirmAction(title,text,okLabel='Delete'){return new Promise(resolve=>{$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmOk').textContent=okLabel;$('confirmModal').classList.remove('hidden');const done=v=>{$('confirmModal').classList.add('hidden');$('confirmOk').onclick=null;$('confirmCancel').onclick=null;resolve(v)};$('confirmOk').onclick=()=>done(true);$('confirmCancel').onclick=()=>done(false)})}

async function audit(action,detail=''){if(!user)return;try{await db.ref('audit').push({userUid:user.uid,email:user.email||'',action,detail,createdAt:stamp()})}catch(e){console.warn('Audit failed',e)}}
function recordList(obj){return Object.entries(obj||{}).map(([id,v])=>({id,...v}))}
function propMap(){return Object.fromEntries(recordList(data.properties).map(p=>[p.id,p]))}
function drawsFor(pid){return recordList(data.draws).filter(d=>String(d.propertyId)===String(pid))}
function noteCount(type,id){return recordList(data.notes).filter(n=>n.entityType===type&&String(n.entityId)===String(id)).length}
function propertyRows(){return recordList(data.properties).map(p=>{const balance=drawsFor(p.id).reduce((s,d)=>s+money(d.amount),0);return {...p,balance,availableBalance:money(p.loanAmount)-balance,noteCount:noteCount('property',p.id)}}).sort((a,b)=>byDate(a,b,'maturityDate')||String(a.address||'').localeCompare(String(b.address||'')))}
function termRows(){return recordList(data.termLoans).map(x=>({...x,noteCount:noteCount('term_loan',x.id)})).sort((a,b)=>byDate(a,b,'maturityDate')||String(a.property||'').localeCompare(String(b.property||'')))}
function upcomingRows(){return recordList(data.upcoming).map(x=>({...x,noteCount:noteCount('upcoming',x.id)})).sort((a,b)=>byDate(a,b,'closeDate')||String(a.address||'').localeCompare(String(b.address||'')))}

async function init(){if(!configValid()){showOnly('configScreen');return}try{firebase.initializeApp(window.BBCOR_FIREBASE_CONFIG);auth=firebase.auth();db=firebase.database();firebase.database().ref('.info/connected').on('value',s=>{$('connectionText').innerHTML=s.val()?'<span class="status-dot"></span>Connected to Firebase':'Offline / reconnecting'});auth.onAuthStateChanged(handleAuth)}catch(e){console.error(e);showOnly('configScreen')}}
async function handleAuth(u){
  clearListeners();
  user=u;

  if(!u){
    userProfile=null;
    showOnly('loginScreen');
    return;
  }

  const BOOTSTRAP_ADMIN_EMAIL='rob.morris@bbcor.org';

  const showDiagnostic=(title,body,type='info')=>{
    showOnly('pendingScreen');
    let el=document.getElementById('pendingDiagnostic');
    if(!el){
      el=document.createElement('div');
      el.id='pendingDiagnostic';
      el.style.marginTop='16px';
      el.style.padding='12px';
      el.style.borderRadius='10px';
      el.style.whiteSpace='pre-wrap';
      el.style.fontSize='13px';
      const host=document.querySelector('#pendingScreen .auth-card')||$('pendingScreen');
      host.appendChild(el);
    }
    el.style.background=type==='error'?'#fee2e2':'#e0f2fe';
    el.style.color=type==='error'?'#991b1b':'#075985';
    el.innerHTML='<b>'+title+'</b><br>'+body;
  };

  try{
    await u.getIdToken(true).catch(()=>{});

    const path='users/'+u.uid;
    let snap=await db.ref(path).once('value');
    let p=snap.val();

    // Deterministic bootstrap repair:
    // if the designated BBCOR bootstrap admin logs in and the profile is absent,
    // create the profile at Firebase Authentication's exact UID automatically.
    if(!p && (u.email||'').toLowerCase()===BOOTSTRAP_ADMIN_EMAIL){
      const bootstrapProfile={
        active:true,
        email:BOOTSTRAP_ADMIN_EMAIL,
        name:'Rob Morris',
        role:'Admin'
      };
      await db.ref(path).set(bootstrapProfile);
      snap=await db.ref(path).once('value');
      p=snap.val();
    }

    if(p && p.active!==false){
      userProfile={uid:u.uid,...p};
      await db.ref('accessRequests/'+u.uid).remove().catch(()=>{});
      showOnly('appShell');
      startListeners();
      renderShell();
      audit('login','Successful cloud login');
      return;
    }

    await db.ref('accessRequests/'+u.uid).set({
      email:u.email||'',
      displayName:u.displayName||'',
      requestedAt:firebase.database.ServerValue.TIMESTAMP,
      status:p?.active===false?'disabled':'pending'
    }).catch(()=>{});

    if(p?.active===false){
      showDiagnostic('ACCOUNT DISABLED','Firebase found your BBCOR profile, but active=false.');
    }else{
      showDiagnostic(
        'PROFILE NOT FOUND',
        'Signed-in UID: '+u.uid+
        '<br>Expected path: /users/'+u.uid+
        '<br><br>The bootstrap repair did not complete. Check Realtime Database rules.'
      );
    }
  }catch(e){
    console.error('BBCOR profile bootstrap/read failed',e);
    showDiagnostic(
      'DATABASE WRITE/READ ERROR',
      'Code: '+String(e.code||'unknown')+
      '<br>Message: '+String(e.message||e)+
      '<br><br>UID: '+u.uid,
      'error'
    );
  }
}
function clearListeners(){listeners.forEach(({ref,event,cb})=>ref.off(event,cb));listeners=[]}
function listen(path,key){const ref=db.ref(path),cb=s=>{data[key]=s.val()||{};if(currentView)renderCurrent()};ref.on('value',cb);listeners.push({ref,event:'value',cb})}
function startListeners(){['properties','draws','termLoans','upcomingPurchases','notes'].forEach((p,i)=>listen(p,['properties','draws','termLoans','upcoming','notes'][i]));if(isAdmin()){listen('users','users');listen('accessRequests','accessRequests');listen('audit','audit')}}
function renderShell(){$('userPill').textContent=`${userProfile.name||user.email} · ${userProfile.role}`;document.querySelectorAll('[data-admin-only]').forEach(x=>x.classList.toggle('hidden',!isAdmin()));if(userProfile.role==='Read Only')$('flashArea').innerHTML='<div class="read-only-banner">Read-only access: you can view BBCOR data and export reports, but you cannot make changes.</div>';openView('dashboard')}

$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMessage').classList.add('hidden');try{await auth.signInWithEmailAndPassword($('loginEmail').value.trim(),$('loginPassword').value)}catch(err){$('loginMessage').textContent=authError(err);$('loginMessage').className='notice error'}};
function authError(e){if(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'||e.code==='auth/user-not-found')return'Invalid email or password.';if(e.code==='auth/too-many-requests')return'Too many attempts. Try again later or reset your password.';return e.message||'Unable to sign in.'}
$('resetPasswordBtn').onclick=async()=>{const email=$('loginEmail').value.trim();if(!email)return $('loginEmail').focus();try{await auth.sendPasswordResetEmail(email);$('loginMessage').textContent='Password reset email sent.';$('loginMessage').className='notice success'}catch(e){$('loginMessage').textContent=authError(e);$('loginMessage').className='notice error'}};
$('logoutBtn').onclick=async()=>{audit('logout','User signed out');await auth.signOut()};$('pendingLogout').onclick=()=>auth.signOut();
$('menuBtn').onclick=()=>$('sidebar').classList.toggle('open');
$('nav').onclick=e=>{const b=e.target.closest('button[data-view]');if(!b)return;openView(b.dataset.view);$('sidebar').classList.remove('open')};
function openView(v){if(v==='admin'&&!isAdmin())v='dashboard';currentView=v;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('pageTitle').textContent=TITLES[v][0];$('pageSubtitle').textContent=TITLES[v][1];renderCurrent()}
function renderCurrent(){if(!userProfile)return;({dashboard:renderDashboard,properties:renderProperties,draws:renderDraws,termLoans:renderTermLoans,upcoming:renderUpcoming,reports:renderReports,admin:renderAdmin}[currentView]||renderDashboard)()}

function renderDashboard(){const props=propertyRows(),loans=termRows(),ups=upcomingRows();const totals={propertyCount:props.length,loanAmount:props.reduce((s,r)=>s+money(r.loanAmount),0),balance:props.reduce((s,r)=>s+r.balance,0),available:props.reduce((s,r)=>s+r.availableBalance,0),termTotal:loans.reduce((s,r)=>s+money(r.loanAmount),0),upcomingTotal:ups.reduce((s,r)=>s+money(r.purchasePrice),0),renoTotal:ups.reduce((s,r)=>s+money(r.renoBudget),0)};totals.aggregate=totals.loanAmount+totals.termTotal;const now=new Date(),d90=new Date(now);d90.setDate(now.getDate()+90);const d30=new Date(now);d30.setDate(now.getDate()+30);const maturing=[...props.map(x=>({name:x.address,date:x.maturityDate})),...loans.map(x=>({name:x.property,date:x.maturityDate}))].filter(x=>x.date&&new Date(x.date+'T00:00:00')<=d90&&new Date(x.date+'T00:00:00')>=new Date(today()+'T00:00:00'));const closing=ups.filter(x=>x.closeDate&&new Date(x.closeDate+'T00:00:00')<=d30&&new Date(x.closeDate+'T00:00:00')>=new Date(today()+'T00:00:00'));
$('view').innerHTML=`<section class="hero"><h1>BBCOR Property Command Center</h1><p>Secure, shared portfolio information for authorized BBCOR users.</p></section><section class="grid kpis"><div class="card kpi"><div class="label">Aggregate Loan Amount</div><div class="value">${currency(totals.aggregate)}</div><div class="sub">Current property loans + term loans</div></div><div class="card kpi"><div class="label">Available Balance</div><div class="value">${currency(totals.available)}</div><div class="sub">Loan amount minus draw balance</div></div><div class="card kpi"><div class="label">Current Properties</div><div class="value">${totals.propertyCount}</div><div class="sub">Active property records</div></div><div class="card kpi"><div class="label">Upcoming Purchase Pipeline</div><div class="value">${currency(totals.upcomingTotal)}</div><div class="sub">Purchase price total</div></div></section><section class="section two-col"><div class="card"><div class="section-head"><h3>Property Snapshot</h3><button class="btn secondary" data-go="properties">View All</button></div><ul class="mini-list">${props.slice(0,8).map(p=>`<li><span>${esc(p.address)}</span><b>${currency(p.availableBalance)}</b></li>`).join('')||'<li><span>No properties entered yet.</span><b>—</b></li>'}</ul></div><div class="card"><div class="section-head"><h3>Risk Watch</h3><button class="btn secondary" data-go="reports">Reports</button></div><p class="muted"><b>${maturing.length}</b> loans/properties maturing in the next 90 days.</p><p class="muted"><b>${closing.length}</b> upcoming purchases closing in the next 30 days.</p><hr style="border:0;border-top:1px solid #edf2f7"><p><b>Total Balance:</b> ${currency(totals.balance)}</p><p><b>Term Loan Total:</b> ${currency(totals.termTotal)}</p><p><b>Reno Budget Pipeline:</b> ${currency(totals.renoTotal)}</p></div></section>`;$('view').onclick=e=>{const b=e.target.closest('[data-go]');if(b)openView(b.dataset.go)}}

function searchHeader(title,placeholder,addText,addAction){return `<div class="section-head"><div><h3>${title}</h3></div><div class="toolbar"><input id="searchBox" class="search" placeholder="${placeholder}">${canWrite()?`<button id="addBtn" class="btn">${addText}</button>`:''}</div></div>`}
function rowActions(type,id,hasNotes=true){return `<div class="actions nowrap">${hasNotes?`<button class="btn note-btn small" data-notes="${type}" data-id="${id}">Notes</button>`:''}${canWrite()?`<button class="btn secondary small" data-edit="${id}">Edit</button><button class="btn danger small" data-delete="${id}">Delete</button>`:''}</div>`}
function wireSearch(render){const s=$('searchBox');if(s)s.oninput=()=>render(s.value.trim().toLowerCase())}

function renderProperties(){const rows=propertyRows();$('view').innerHTML=`<section class="section">${searchHeader('Current Properties','Search address, loan number, bank or notes…','+ Add Property')}<div id="rows"></div></section>`;const draw=(q='')=>{const f=rows.filter(r=>!q||[r.address,r.loanNumber,r.bank,r.notes].some(x=>String(x||'').toLowerCase().includes(q)));$('rows').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Address</th><th>Loan #</th><th class="money">Loan Amount</th><th class="money">Balance</th><th class="money">Available</th><th>Maturity</th><th>Bank</th><th>Actions</th></tr></thead><tbody>${f.map(r=>`<tr><td><b>${esc(r.address)}</b>${r.noteCount?`<br><span class="badge">${r.noteCount} notes</span>`:''}</td><td>${esc(r.loanNumber||'—')}</td><td class="money">${currency(r.loanAmount)}</td><td class="money">${currency(r.balance)}</td><td class="money">${currency(r.availableBalance)}</td><td>${esc(r.maturityDate||'—')}</td><td>${esc(r.bank||'—')}</td><td>${rowActions('property',r.id)}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">No properties found.</td></tr>'}</tbody></table></div>`;wireTableActions('property')};draw();wireSearch(draw);if($('addBtn'))$('addBtn').onclick=()=>propertyForm();}
function propertyForm(id=null){const r=id?data.properties[id]||{}:{};modal(id?'Edit Property':'Add Property',`<form id="recordForm"><div class="form-grid"><div class="full"><label>Address</label><input name="address" required value="${esc(r.address||'')}"></div><div><label>Loan Number</label><input name="loanNumber" value="${esc(r.loanNumber||'')}"></div><div><label>Loan Amount</label><input name="loanAmount" type="number" step="0.01" value="${money(r.loanAmount)||''}"></div><div><label>Bank</label><input name="bank" value="${esc(r.bank||'')}"></div><div><label>Date Acquired</label><input name="dateAcquired" type="date" value="${esc(r.dateAcquired||'')}"></div><div><label>List Month</label><input name="listMonth" value="${esc(r.listMonth||'')}"></div><div><label>Maturity Date</label><input name="maturityDate" type="date" value="${esc(r.maturityDate||'')}"></div><div><label>Contract Date</label><input name="contractDate" type="date" value="${esc(r.contractDate||'')}"></div><div><label>Close Date</label><input name="closeDate" type="date" value="${esc(r.closeDate||'')}"></div><div><label>List Amount</label><input name="listAmount" type="number" step="0.01" value="${money(r.listAmount)||''}"></div><div><label>Contract Amount</label><input name="contractAmount" type="number" step="0.01" value="${money(r.contractAmount)||''}"></div><div class="full"><label>Notes</label><textarea name="notes">${esc(r.notes||'')}</textarea></div></div><div class="actions end" style="margin-top:16px"><button type="button" id="cancelForm" class="btn secondary">Cancel</button><button class="btn">Save Property</button></div></form>`);$('cancelForm').onclick=closeModal;$('recordForm').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));['loanAmount','listAmount','contractAmount'].forEach(k=>o[k]=money(o[k]));o.updatedAt=stamp();if(!id)o.createdAt=o.updatedAt;const ref=id?db.ref('properties/'+id):db.ref('properties').push();await ref.set(o);await audit(id?'edit property':'add property',o.address);closeModal();flash('Property saved.');renderProperties()}}

function renderDraws(){const props=propertyRows(),rows=recordList(data.draws).map(d=>({...d,address:data.properties[d.propertyId]?.address||'Unknown',noteCount:noteCount('draw',d.id)})).sort((a,b)=>String(b.drawDate||'').localeCompare(String(a.drawDate||'')));$('view').innerHTML=`<section class="section">${searchHeader('Draw Ledger','Search property or description…','+ Add Draw')}<div id="rows"></div></section>`;const draw=q=>{const f=rows.filter(r=>!q||[r.address,r.description,r.notes].some(x=>String(x||'').toLowerCase().includes(q)));$('rows').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Property</th><th class="money">Amount</th><th>Description</th><th>Created By</th><th>Actions</th></tr></thead><tbody>${f.map(r=>`<tr><td>${esc(r.drawDate||'—')}</td><td><b>${esc(r.address)}</b>${r.noteCount?`<br><span class="badge">${r.noteCount} notes</span>`:''}</td><td class="money">${currency(r.amount)}</td><td>${esc(r.description||'—')}</td><td>${esc(r.createdBy||'—')}</td><td>${rowActions('draw',r.id)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No draws found.</td></tr>'}</tbody></table></div>`;wireTableActions('draw')};draw('');wireSearch(draw);if($('addBtn'))$('addBtn').onclick=()=>drawForm(null,props)}
function drawForm(id=null,props=propertyRows()){const r=id?data.draws[id]||{}:{};modal(id?'Edit Draw':'Add Draw',`<form id="recordForm"><div class="form-grid"><div class="full"><label>Property</label><select name="propertyId" required><option value="">Select property…</option>${props.map(p=>`<option value="${p.id}" ${String(r.propertyId)===String(p.id)?'selected':''}>${esc(p.address)}</option>`).join('')}</select></div><div><label>Draw Date</label><input name="drawDate" type="date" required value="${esc(r.drawDate||today())}"></div><div><label>Amount</label><input name="amount" type="number" step="0.01" required value="${money(r.amount)||''}"></div><div class="full"><label>Description</label><input name="description" value="${esc(r.description||'')}"></div><div class="full"><label>Notes</label><textarea name="notes">${esc(r.notes||'')}</textarea></div></div><div class="actions end" style="margin-top:16px"><button type="button" id="cancelForm" class="btn secondary">Cancel</button><button class="btn">Save Draw</button></div></form>`);$('cancelForm').onclick=closeModal;$('recordForm').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.amount=money(o.amount);o.updatedAt=stamp();if(!id){o.createdAt=o.updatedAt;o.createdBy=user.email||userProfile.name||''}const ref=id?db.ref('draws/'+id):db.ref('draws').push();if(id){const old=data.draws[id]||{};await ref.set({...old,...o})}else await ref.set(o);await audit(id?'edit draw':'add draw',`${o.propertyId}: ${o.amount}`);closeModal();flash('Draw saved.');renderDraws()}}

function renderTermLoans(){const rows=termRows();$('view').innerHTML=`<section class="section">${searchHeader('Term Loans','Search property, loan number, bank or notes…','+ Add Term Loan')}<div id="rows"></div></section>`;const draw=q=>{const f=rows.filter(r=>!q||[r.property,r.loanNumber,r.bank,r.notes].some(x=>String(x||'').toLowerCase().includes(q)));$('rows').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Property</th><th>Maturity</th><th class="money">Loan Amount</th><th>Loan #</th><th>Bank</th><th>Actions</th></tr></thead><tbody>${f.map(r=>`<tr><td><b>${esc(r.property)}</b>${r.noteCount?`<br><span class="badge">${r.noteCount} notes</span>`:''}</td><td>${esc(r.maturityDate||'—')}</td><td class="money">${currency(r.loanAmount)}</td><td>${esc(r.loanNumber||'—')}</td><td>${esc(r.bank||'—')}</td><td>${rowActions('term_loan',r.id)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No term loans found.</td></tr>'}</tbody></table></div>`;wireTableActions('term_loan')};draw('');wireSearch(draw);if($('addBtn'))$('addBtn').onclick=()=>termLoanForm()}
function termLoanForm(id=null){const r=id?data.termLoans[id]||{}:{};modal(id?'Edit Term Loan':'Add Term Loan',`<form id="recordForm"><div class="form-grid"><div class="full"><label>Property</label><input name="property" required value="${esc(r.property||'')}"></div><div><label>Maturity Date</label><input name="maturityDate" type="date" value="${esc(r.maturityDate||'')}"></div><div><label>Loan Amount</label><input name="loanAmount" type="number" step="0.01" value="${money(r.loanAmount)||''}"></div><div><label>Loan Number</label><input name="loanNumber" value="${esc(r.loanNumber||'')}"></div><div><label>Bank</label><input name="bank" value="${esc(r.bank||'')}"></div><div class="full"><label>Notes</label><textarea name="notes">${esc(r.notes||'')}</textarea></div></div><div class="actions end" style="margin-top:16px"><button type="button" id="cancelForm" class="btn secondary">Cancel</button><button class="btn">Save Term Loan</button></div></form>`);$('cancelForm').onclick=closeModal;$('recordForm').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.loanAmount=money(o.loanAmount);o.updatedAt=stamp();if(!id)o.createdAt=o.updatedAt;const ref=id?db.ref('termLoans/'+id):db.ref('termLoans').push();await ref.set(o);await audit(id?'edit term loan':'add term loan',o.property);closeModal();flash('Term loan saved.');renderTermLoans()}}

function renderUpcoming(){const rows=upcomingRows();$('view').innerHTML=`<section class="section">${searchHeader('Upcoming Purchases','Search address or notes…','+ Add Purchase')}<div id="rows"></div></section>`;const draw=q=>{const f=rows.filter(r=>!q||[r.address,r.notes].some(x=>String(x||'').toLowerCase().includes(q)));$('rows').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Address</th><th class="money">Purchase Price</th><th class="money">Reno Budget</th><th>Close Date</th><th>Actions</th></tr></thead><tbody>${f.map(r=>`<tr><td><b>${esc(r.address)}</b>${r.noteCount?`<br><span class="badge">${r.noteCount} notes</span>`:''}</td><td class="money">${currency(r.purchasePrice)}</td><td class="money">${currency(r.renoBudget)}</td><td>${esc(r.closeDate||'—')}</td><td>${rowActions('upcoming',r.id)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No upcoming purchases found.</td></tr>'}</tbody></table></div>`;wireTableActions('upcoming')};draw('');wireSearch(draw);if($('addBtn'))$('addBtn').onclick=()=>upcomingForm()}
function upcomingForm(id=null){const r=id?data.upcoming[id]||{}:{};modal(id?'Edit Upcoming Purchase':'Add Upcoming Purchase',`<form id="recordForm"><div class="form-grid"><div class="full"><label>Address</label><input name="address" required value="${esc(r.address||'')}"></div><div><label>Purchase Price</label><input name="purchasePrice" type="number" step="0.01" value="${money(r.purchasePrice)||''}"></div><div><label>Reno Budget</label><input name="renoBudget" type="number" step="0.01" value="${money(r.renoBudget)||''}"></div><div><label>Close Date</label><input name="closeDate" type="date" value="${esc(r.closeDate||'')}"></div><div class="full"><label>Notes</label><textarea name="notes">${esc(r.notes||'')}</textarea></div></div><div class="actions end" style="margin-top:16px"><button type="button" id="cancelForm" class="btn secondary">Cancel</button><button class="btn">Save Purchase</button></div></form>`);$('cancelForm').onclick=closeModal;$('recordForm').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.purchasePrice=money(o.purchasePrice);o.renoBudget=money(o.renoBudget);o.updatedAt=stamp();if(!id)o.createdAt=o.updatedAt;const ref=id?db.ref('upcomingPurchases/'+id):db.ref('upcomingPurchases').push();await ref.set(o);await audit(id?'edit upcoming purchase':'add upcoming purchase',o.address);closeModal();flash('Upcoming purchase saved.');renderUpcoming()}}

function wireTableActions(type){$('rows').onclick=async e=>{const note=e.target.closest('[data-notes]'),edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(note)return openNotes(note.dataset.notes,note.dataset.id);if(edit){const id=edit.dataset.edit;if(type==='property')propertyForm(id);if(type==='draw')drawForm(id);if(type==='term_loan')termLoanForm(id);if(type==='upcoming')upcomingForm(id);return}if(del){const id=del.dataset.delete,ok=await confirmAction('Delete record','This will permanently delete the record and its associated note history.');if(!ok)return;await deleteRecord(type,id);flash('Record deleted.');renderCurrent()}}}
async function deleteRecord(type,id){if(type==='property'){const updates={['properties/'+id]:null};recordList(data.draws).filter(d=>String(d.propertyId)===String(id)).forEach(d=>{updates['draws/'+d.id]=null;recordList(data.notes).filter(n=>n.entityType==='draw'&&String(n.entityId)===String(d.id)).forEach(n=>updates['notes/'+n.id]=null)});recordList(data.notes).filter(n=>n.entityType==='property'&&String(n.entityId)===String(id)).forEach(n=>updates['notes/'+n.id]=null);await db.ref().update(updates)}else{const path=type==='draw'?'draws':type==='term_loan'?'termLoans':'upcomingPurchases',et=type;const updates={[path+'/'+id]:null};recordList(data.notes).filter(n=>n.entityType===et&&String(n.entityId)===String(id)).forEach(n=>updates['notes/'+n.id]=null);await db.ref().update(updates)}await audit('delete '+type,id)}

function entityInfo(type,id){if(type==='property')return{label:'Current Property',name:data.properties[id]?.address||'Property'};if(type==='draw'){const d=data.draws[id];return{label:'Draw Entry',name:d?(data.properties[d.propertyId]?.address||d.description||'Draw'):'Draw'}};if(type==='term_loan')return{label:'Term Loan',name:data.termLoans[id]?.property||'Term Loan'};return{label:'Upcoming Purchase',name:data.upcoming[id]?.address||'Upcoming Purchase'}}
function openNotes(type,id){const info=entityInfo(type,id),notes=recordList(data.notes).filter(n=>n.entityType===type&&String(n.entityId)===String(id)).sort((a,b)=>String(b.noteDate||'').localeCompare(String(a.noteDate||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));modal(`${info.label} Notes — ${info.name}`,`${canWrite()?`<form id="noteForm" class="card" style="box-shadow:none;margin-bottom:14px"><div class="form-grid"><div><label>Note Date</label><input name="noteDate" type="date" value="${today()}"></div><div class="full"><label>Note</label><textarea name="noteText" required></textarea></div></div><div class="actions end"><button class="btn">Add Note</button></div></form>`:''}<div class="note-timeline">${notes.map(n=>`<div class="note-entry"><div class="note-date">${esc(n.noteDate||'')}</div><div class="note-body"><p>${esc(n.noteText)}</p><small>${esc(n.createdBy||'')} · ${esc((n.updatedAt||n.createdAt||'').replace('T',' ').slice(0,19))}</small>${canWrite()?`<div class="actions" style="margin-top:10px"><button class="btn secondary small" data-edit-note="${n.id}">Edit</button><button class="btn danger small" data-delete-note="${n.id}">Delete</button></div>`:''}</div></div>`).join('')||'<div class="empty">No note history yet.</div>'}</div>`);if($('noteForm'))$('noteForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),o={entityType:type,entityId:id,noteDate:f.noteDate||today(),noteText:f.noteText.trim(),createdBy:user.email||userProfile.name||'',createdAt:stamp(),updatedAt:stamp()};await db.ref('notes').push(o);await audit('add note',`${type} ${id}`);openNotes(type,id)};$('modalBody').onclick=async e=>{const ed=e.target.closest('[data-edit-note]'),dl=e.target.closest('[data-delete-note]');if(ed){const nid=ed.dataset.editNote,n=data.notes[nid];modal('Edit Note',`<form id="editNoteForm"><label>Note Date</label><input name="noteDate" type="date" value="${esc(n.noteDate||today())}"><label style="margin-top:12px">Note</label><textarea name="noteText" required>${esc(n.noteText||'')}</textarea><div class="actions end" style="margin-top:14px"><button class="btn">Save Note</button></div></form>`);$('editNoteForm').onsubmit=async ev=>{ev.preventDefault();const f=Object.fromEntries(new FormData(ev.target));await db.ref('notes/'+nid).update({noteDate:f.noteDate,noteText:f.noteText.trim(),updatedAt:stamp()});await audit('edit note',`${type} ${id}`);closeModal();flash('Note updated.')};}if(dl){const nid=dl.dataset.deleteNote;if(await confirmAction('Delete note','Delete this note permanently?')){await db.ref('notes/'+nid).remove();await audit('delete note',`${type} ${id}`);openNotes(type,id)}}}}

function renderReports(){$('view').innerHTML=`<section class="section"><div class="grid report-grid"><div class="card report-card"><h3>Combined Portfolio Report</h3><p>Current properties, term loans, portfolio totals, and upcoming purchases in one Excel workbook.</p><button class="btn" data-report="combined">Download Excel</button></div><div class="card report-card"><h3>Current Properties Report</h3><p>Property loans, draw balances, available balances, dates, bank information, and notes.</p><button class="btn" data-report="current">Download Excel</button></div><div class="card report-card"><h3>Term Loan Report</h3><p>Term debt, maturity dates, loan numbers, banks, and notes.</p><button class="btn" data-report="term">Download Excel</button></div><div class="card report-card"><h3>Upcoming Purchases Report</h3><p>Acquisition pipeline with purchase price, renovation budget, close date, and notes.</p><button class="btn" data-report="upcoming">Download Excel</button></div></div></section><section class="section two-col"><div class="card"><h3>Portable Data Transfer</h3><p class="muted">Export a complete workbook containing Properties, Draws, Term Loans, Upcoming Purchases, and Note History. This is compatible with the cloud import below.</p><button id="exportTransfer" class="btn green">Export Data Transfer Workbook</button></div><div class="card"><h3>Import Existing BBCOR Data</h3><p class="muted">Use the Data Transfer workbook exported from the desktop BBCOR application. Merge is safest; Replace clears cloud portfolio records before importing.</p>${canWrite()?`<div class="file-drop"><input id="importFile" type="file" accept=".xlsx"><div style="height:8px"></div><select id="importMode"><option value="merge">Merge with cloud data</option>${isAdmin()?'<option value="replace">Replace cloud portfolio data</option>':''}</select><div style="height:10px"></div><button id="importBtn" class="btn">Import Workbook</button></div>`:'<div class="notice info">Read-only users cannot import data.</div>'}</div></section>`;$('view').onclick=e=>{const b=e.target.closest('[data-report]');if(b)downloadReport(b.dataset.report)};$('exportTransfer').onclick=exportTransfer;if($('importBtn'))$('importBtn').onclick=importWorkbook}
function sheetFrom(rows){return XLSX.utils.json_to_sheet(rows)}
function downloadWorkbook(wb,name){XLSX.writeFile(wb,name)}
function downloadReport(kind){const wb=XLSX.utils.book_new(),props=propertyRows(),loans=termRows(),ups=upcomingRows();if(kind==='combined'||kind==='current'){const rows=props.map(r=>({'ADDRESS':r.address,'LOAN NUMBER':r.loanNumber,'LOAN AMOUNT':money(r.loanAmount),'BALANCE':r.balance,'AVAILABLE BALANCE':r.availableBalance,'LIST AMOUNT':money(r.listAmount),'CONTRACT AMOUNT':money(r.contractAmount),'DATE ACQUIRED':r.dateAcquired,'LIST MONTH':r.listMonth,'MATURITY DATE':r.maturityDate,'CONTRACT DATE':r.contractDate,'CLOSE DATE':r.closeDate,'BANK':r.bank,'NOTES':r.notes}));XLSX.utils.book_append_sheet(wb,sheetFrom(rows),'Current Properties')}if(kind==='combined'||kind==='term'){XLSX.utils.book_append_sheet(wb,sheetFrom(loans.map(r=>({'PROPERTY':r.property,'MATURITY DATE':r.maturityDate,'LOAN AMOUNT':money(r.loanAmount),'LOAN NUMBER':r.loanNumber,'BANK':r.bank,'NOTES':r.notes}))),'Term Loans')}if(kind==='combined'||kind==='upcoming'){XLSX.utils.book_append_sheet(wb,sheetFrom(ups.map(r=>({'ADDRESS':r.address,'PURCHASE PRICE':money(r.purchasePrice),'RENO BUDGET':money(r.renoBudget),'CLOSE DATE':r.closeDate,'NOTES':r.notes}))),'Upcoming Purchases')}if(kind==='combined'){const totals=[{'PORTFOLIO TOTAL':'Current Property Loan Amount','AMOUNT':props.reduce((s,r)=>s+money(r.loanAmount),0)},{'PORTFOLIO TOTAL':'Term Loan Amount','AMOUNT':loans.reduce((s,r)=>s+money(r.loanAmount),0)},{'PORTFOLIO TOTAL':'Aggregate Loan Amount','AMOUNT':props.reduce((s,r)=>s+money(r.loanAmount),0)+loans.reduce((s,r)=>s+money(r.loanAmount),0)},{'PORTFOLIO TOTAL':'Total Balance','AMOUNT':props.reduce((s,r)=>s+r.balance,0)},{'PORTFOLIO TOTAL':'Total Available Balance','AMOUNT':props.reduce((s,r)=>s+r.availableBalance,0)}];XLSX.utils.book_append_sheet(wb,sheetFrom(totals),'Portfolio Totals')}downloadWorkbook(wb,`BBCOR_${kind.toUpperCase()}_REPORT_${today()}.xlsx`);audit('export report',kind)}
function exportTransfer(){const wb=XLSX.utils.book_new(),props=recordList(data.properties),draws=recordList(data.draws),terms=recordList(data.termLoans),ups=recordList(data.upcoming),notes=recordList(data.notes),pm=propMap();const p=props.map(r=>({'ID':r.id,'ADDRESS':r.address,'LOAN NUMBER':r.loanNumber,'LOAN AMOUNT':money(r.loanAmount),'DATE ACQUIRED':r.dateAcquired,'LIST MONTH':r.listMonth,'MATURITY DATE':r.maturityDate,'CONTRACT DATE':r.contractDate,'CLOSE DATE':r.closeDate,'BANK':r.bank,'LIST AMOUNT':money(r.listAmount),'CONTRACT AMOUNT':money(r.contractAmount),'NOTES':r.notes,'CREATED AT':r.createdAt,'UPDATED AT':r.updatedAt}));const d=draws.map(r=>({'ID':r.id,'PROPERTY ID':r.propertyId,'PROPERTY ADDRESS':pm[r.propertyId]?.address||'','PROPERTY LOAN NUMBER':pm[r.propertyId]?.loanNumber||'','DRAW DATE':r.drawDate,'AMOUNT':money(r.amount),'DESCRIPTION':r.description,'NOTES':r.notes,'CREATED BY':r.createdBy,'CREATED AT':r.createdAt,'UPDATED AT':r.updatedAt}));const t=terms.map(r=>({'ID':r.id,'PROPERTY':r.property,'MATURITY DATE':r.maturityDate,'LOAN AMOUNT':money(r.loanAmount),'LOAN NUMBER':r.loanNumber,'BANK':r.bank,'NOTES':r.notes,'CREATED AT':r.createdAt,'UPDATED AT':r.updatedAt}));const u=ups.map(r=>({'ID':r.id,'ADDRESS':r.address,'PURCHASE PRICE':money(r.purchasePrice),'RENO BUDGET':money(r.renoBudget),'CLOSE DATE':r.closeDate,'NOTES':r.notes,'CREATED AT':r.createdAt,'UPDATED AT':r.updatedAt}));const n=notes.map(r=>({'ID':r.id,'ENTITY TYPE':r.entityType,'ENTITY ID':r.entityId,'NOTE DATE':r.noteDate,'NOTE TEXT':r.noteText,'CREATED BY':r.createdBy,'CREATED AT':r.createdAt,'UPDATED AT':r.updatedAt}));[['Properties',p],['Draws',d],['Term Loans',t],['Upcoming Purchases',u],['Note History',n]].forEach(([name,rows])=>XLSX.utils.book_append_sheet(wb,sheetFrom(rows),name));const info=XLSX.utils.aoa_to_sheet([['BBCOR_DATA_TRANSFER'],['Complete portable cloud data export'],['Generated',stamp()],[],['Import this workbook from Reports & Data Transfer. Do not rename sheet headers.']]);XLSX.utils.book_append_sheet(wb,info,'Instructions');downloadWorkbook(wb,`BBCOR_DATA_TRANSFER_${today()}.xlsx`);audit('export data transfer','Cloud workbook')}
function val(row,key){return row[key]??row[key.toUpperCase()]??''}
async function importWorkbook(){
  const file=$('importFile').files[0];
  if(!file)return flash('Choose an Excel .xlsx workbook first.','error');
  const mode=$('importMode').value;
  if(mode==='replace'&&!isAdmin())return;
  const ok=await confirmAction('Import BBCOR data',mode==='replace'?'This will replace all cloud portfolio records and note history. User accounts are not affected.':'This will merge workbook records into the cloud database.','Import');
  if(!ok)return;
  try{
    const arr=await file.arrayBuffer();
    const wb=XLSX.read(arr,{type:'array'});
    if(!wb.SheetNames.includes('Properties'))throw new Error('Properties sheet not found. Export a BBCOR Data Transfer workbook first.');
    const get=name=>wb.Sheets[name]?XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:''}):[];
    const ps=get('Properties'),ds=get('Draws'),ts=get('Term Loans'),us=get('Upcoming Purchases'),ns=get('Note History');
    const updates={};
    if(mode==='replace'){
      updates.properties=null;updates.draws=null;updates.termLoans=null;updates.upcomingPurchases=null;updates.notes=null;
    }
    const idMap={property:{},draw:{},term_loan:{},upcoming:{}};
    ps.forEach((r,i)=>{
      const old=String(val(r,'ID')||i+1),id='p_'+safeKey(old);
      const o={
        address:String(val(r,'ADDRESS')).trim(),loanNumber:String(val(r,'LOAN NUMBER')).trim(),loanAmount:money(val(r,'LOAN AMOUNT')),
        dateAcquired:String(val(r,'DATE ACQUIRED')).slice(0,10),listMonth:String(val(r,'LIST MONTH')),maturityDate:String(val(r,'MATURITY DATE')).slice(0,10),
        contractDate:String(val(r,'CONTRACT DATE')).slice(0,10),closeDate:String(val(r,'CLOSE DATE')).slice(0,10),bank:String(val(r,'BANK')).trim(),
        listAmount:money(val(r,'LIST AMOUNT')),contractAmount:money(val(r,'CONTRACT AMOUNT')),notes:String(val(r,'NOTES')),
        createdAt:String(val(r,'CREATED AT')||stamp()),updatedAt:String(val(r,'UPDATED AT')||stamp())
      };
      if(o.address){updates['properties/'+id]=o;idMap.property[old]=id;}
    });
    ds.forEach((r,i)=>{
      const old=String(val(r,'ID')||i+1),oldPid=String(val(r,'PROPERTY ID'));
      const pid=idMap.property[oldPid]||findPropertyByAddress(String(val(r,'PROPERTY ADDRESS'))),id='d_'+safeKey(old);
      if(pid){
        updates['draws/'+id]={propertyId:pid,drawDate:String(val(r,'DRAW DATE')).slice(0,10),amount:money(val(r,'AMOUNT')),description:String(val(r,'DESCRIPTION')),notes:String(val(r,'NOTES')),createdBy:String(val(r,'CREATED BY')),createdAt:String(val(r,'CREATED AT')||stamp()),updatedAt:String(val(r,'UPDATED AT')||stamp())};
        idMap.draw[old]=id;
      }
    });
    ts.forEach((r,i)=>{
      const old=String(val(r,'ID')||i+1),id='t_'+safeKey(old);
      const o={property:String(val(r,'PROPERTY')).trim(),maturityDate:String(val(r,'MATURITY DATE')).slice(0,10),loanAmount:money(val(r,'LOAN AMOUNT')),loanNumber:String(val(r,'LOAN NUMBER')),bank:String(val(r,'BANK')),notes:String(val(r,'NOTES')),createdAt:String(val(r,'CREATED AT')||stamp()),updatedAt:String(val(r,'UPDATED AT')||stamp())};
      if(o.property){updates['termLoans/'+id]=o;idMap.term_loan[old]=id;}
    });
    us.forEach((r,i)=>{
      const old=String(val(r,'ID')||i+1),id='u_'+safeKey(old);
      const o={address:String(val(r,'ADDRESS')).trim(),purchasePrice:money(val(r,'PURCHASE PRICE')),renoBudget:money(val(r,'RENO BUDGET')),closeDate:String(val(r,'CLOSE DATE')).slice(0,10),notes:String(val(r,'NOTES')),createdAt:String(val(r,'CREATED AT')||stamp()),updatedAt:String(val(r,'UPDATED AT')||stamp())};
      if(o.address){updates['upcomingPurchases/'+id]=o;idMap.upcoming[old]=id;}
    });
    ns.forEach((r,i)=>{
      const type=String(val(r,'ENTITY TYPE')),old=String(val(r,'ENTITY ID')),eid=idMap[type]?.[old];
      if(eid){
        updates['notes/n_'+safeKey(String(val(r,'ID')||i+1))]={entityType:type,entityId:eid,noteDate:String(val(r,'NOTE DATE')).slice(0,10)||today(),noteText:String(val(r,'NOTE TEXT')),createdBy:String(val(r,'CREATED BY')),createdAt:String(val(r,'CREATED AT')||stamp()),updatedAt:String(val(r,'UPDATED AT')||stamp())};
      }
    });
    await db.ref().update(updates);
    await audit('import data',`${mode}: ${ps.length} properties, ${ds.length} draws, ${ts.length} term loans, ${us.length} upcoming, ${ns.length} notes`);
    flash('Import complete. BBCOR cloud data has been updated.');
    renderReports();
  }catch(e){
    console.error(e);flash('Import stopped: '+e.message,'error');
  }
}
function findPropertyByAddress(address){const target=address.trim().toLowerCase();const found=recordList(data.properties).find(p=>String(p.address||'').trim().toLowerCase()===target);return found?.id||''}

function renderAdmin(){if(!isAdmin())return openView('dashboard');const users=recordList(data.users).sort((a,b)=>String(a.email||'').localeCompare(String(b.email||''))),requests=recordList(data.accessRequests).filter(r=>r.status!=='disabled'),logs=recordList(data.audit).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100);$('view').innerHTML=`<section class="section"><div class="admin-tabs"><button class="active" data-tab="users">Users</button><button data-tab="requests">Access Requests <span class="badge">${requests.length}</span></button><button data-tab="audit">Audit Log</button></div><div id="adminPanel"></div></section>`;const panels={users:()=>`<div class="card"><div class="section-head"><h3>Authorized Users</h3><span class="muted">Create login accounts in Firebase Authentication; manage BBCOR permissions here.</span></div><div class="table-wrap"><table><thead><tr><th>Name / Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${esc(u.name||u.email||u.id)}</b><br><span class="muted">${esc(u.email||'')}</span></td><td><select data-role="${u.id}"><option ${u.role==='Admin'?'selected':''}>Admin</option><option ${u.role==='User'?'selected':''}>User</option><option ${u.role==='Read Only'?'selected':''}>Read Only</option></select></td><td>${u.active===false?'<span class="badge red">Disabled</span>':'<span class="badge green">Active</span>'}</td><td><button class="btn secondary small" data-toggle-user="${u.id}">${u.active===false?'Enable':'Disable'}</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">No user profiles.</td></tr>'}</tbody></table></div></div>`,requests:()=>`<div class="card"><h3>Pending Access Requests</h3><p class="muted">A user appears here after successfully signing in with a Firebase Authentication account that has not yet been approved.</p><div class="table-wrap"><table><thead><tr><th>Email</th><th>Requested</th><th>Approve As</th></tr></thead><tbody>${requests.map(r=>`<tr><td><b>${esc(r.email||r.id)}</b></td><td>${r.requestedAt?new Date(r.requestedAt).toLocaleString():'—'}</td><td><div class="actions"><select data-request-role="${r.id}"><option>User</option><option>Read Only</option><option>Admin</option></select><button class="btn small" data-approve="${r.id}">Approve</button><button class="btn danger small" data-deny="${r.id}">Deny</button></div></td></tr>`).join('')||'<tr><td colspan="3" class="empty">No pending requests.</td></tr>'}</tbody></table></div></div>`,audit:()=>`<div class="card"><h3>Recent Audit Activity</h3><div class="table-wrap"><table><thead><tr><th>Date/Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody>${logs.map(l=>`<tr><td>${esc((l.createdAt||'').replace('T',' ').slice(0,19))}</td><td>${esc(l.email||l.userUid||'')}</td><td><b>${esc(l.action||'')}</b></td><td>${esc(l.detail||'')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No audit activity yet.</td></tr>'}</tbody></table></div></div>`};const draw=tab=>{$('adminPanel').innerHTML=panels[tab]();document.querySelectorAll('.admin-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));wireAdmin(tab)};document.querySelector('.admin-tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)draw(b.dataset.tab)};draw('users')}
function wireAdmin(tab){
  if(tab==='users'){
    $('adminPanel').onchange=async e=>{
      const s=e.target.closest('[data-role]');
      if(!s)return;
      await db.ref('users/'+s.dataset.role+'/role').set(s.value);
      await audit('change user role',`${s.dataset.role} -> ${s.value}`);
      flash('User role updated.');
    };
    $('adminPanel').onclick=async e=>{
      const b=e.target.closest('[data-toggle-user]');
      if(!b)return;
      const u=data.users[b.dataset.toggleUser];
      if(b.dataset.toggleUser===user.uid&&u.active!==false)return flash('You cannot disable your own active admin session.','error');
      await db.ref('users/'+b.dataset.toggleUser+'/active').set(u.active===false);
      await audit('toggle user active',b.dataset.toggleUser);
    };
  }
  if(tab==='requests'){
    $('adminPanel').onclick=async e=>{
      const a=e.target.closest('[data-approve]'),d=e.target.closest('[data-deny]');
      if(a){
        const uid=a.dataset.approve,r=data.accessRequests[uid],role=document.querySelector(`[data-request-role="${uid}"]`).value;
        await db.ref('users/'+uid).set({email:r.email||'',name:(r.displayName||r.email||'').split('@')[0],role,active:true,createdAt:stamp()});
        await db.ref('accessRequests/'+uid).remove();
        await audit('approve user',`${r.email} as ${role}`);
        flash('Access approved.');
        renderAdmin();
      }
      if(d){
        const uid=d.dataset.deny,r=data.accessRequests[uid];
        await db.ref('accessRequests/'+uid).update({status:'denied',deniedAt:stamp()});
        await audit('deny access',r.email||uid);
        flash('Access request denied.');
        renderAdmin();
      }
    };
  }
}

init();
})();
