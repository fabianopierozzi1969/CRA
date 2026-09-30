const DB_NAME = 'residencial-americas-local';
const STORE = 'state';
let db = null;
let state = null;
let currentEdit = null;

const clone = obj => JSON.parse(JSON.stringify(obj));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const now = () => new Date().toLocaleString('pt-BR');

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function dbGet(key){ return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
function dbPut(key,value){ return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).put(value,key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}); }
async function persist(){await dbPut('state',state);}

function migrateUnits(data){
  const pattern=['T1','T2','11','12','21','22','31','32'];
  const sourceById=new Map((data.units||[]).map(u=>[u.id,u]));
  const fixed=clone(window.INITIAL_DATA);
  fixed.residents=(data.residents||[]); fixed.vehicles=(data.vehicles||[]); fixed.professions=(data.professions||[]);
  fixed.notices=(data.notices||[]); fixed.history=(data.history||[]); fixed.pinHash=data.pinHash||null;
  fixed.units=[]; fixed.blocks.forEach(b=>b.units.forEach(unit=>{const id=`${b.name}|${unit}`; fixed.units.push(sourceById.get(id)||{id,block:b.name,unit,residents:[]});}));
  const oldGarages=(data.garages||[]); const byId=new Map(oldGarages.map(g=>[g.id,g]));
  fixed.garages=clone(window.INITIAL_DATA.garages).map(g=>byId.get(g.id)?{...g,...byId.get(g.id)}:g);
  // Preserve older vehicle records while normalizing parking references.
  fixed.vehicles=fixed.vehicles.map(v=>({...v,garageId:v.garageId||'',garageType:v.garageType||'private'}));
  fixed.version=4;
  return fixed;
}

async function init(){
  db=await openDB();
  state=await dbGet('state');
  if(!state){
    state=migrateUnits(window.INITIAL_DATA);
    state.version=4; state.pinHash=null; state.notices=[]; state.history=[]; state.garages=clone(window.INITIAL_DATA.garages);
    state.residents.forEach(r=>r.photo='');
    await persist();
  } else {
    state=migrateUnits(state);
    state.version=4;
    if(!state.notices) state.notices=[]; if(!state.history) state.history=[];
    await persist();
  }
  if(!state.pinHash) openSetup();
  bind(); renderAll(); registerPWA();
}

async function hashPin(pin){const data=new TextEncoder().encode(pin); const digest=await crypto.subtle.digest('SHA-256',data); return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function setPin(pin){state.pinHash=await hashPin(pin); await persist();}
async function verifyPin(pin){return !!state.pinHash && (await hashPin(pin))===state.pinHash;}

function qs(id){return document.getElementById(id)}
function unitsByBlock(block){return state.units.filter(u=>u.block===block)}
function linkedVehicle(r){return state.vehicles.find(v=>v.residentId===r.id)}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));qs('page-'+page).classList.add('active');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));window.scrollTo({top:0,behavior:'smooth'}); if(page==='home') renderHomeSearch(); if(page==='residents') renderResidents(); if(page==='units') renderUnits(); if(page==='vehicles') renderVehicles(); if(page==='garage') renderGarage(); if(page==='notices') renderNotices();}

function bind(){
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.nav)));
  qs('globalSearch').addEventListener('input',renderHomeSearch); qs('clearSearch').addEventListener('click',()=>{qs('globalSearch').value='';renderHomeSearch();});
  qs('residentSearch').addEventListener('input',renderResidents); qs('residentBlockFilter').addEventListener('change',renderResidents);
  qs('unitSearch').addEventListener('input',renderUnits); qs('unitBlockFilter').addEventListener('change',renderUnits);
  qs('vehicleSearch').addEventListener('input',renderVehicles);
  qs('garageSearch').addEventListener('input',renderGarage); qs('newGarageRentalBtn').addEventListener('click',openGarageRental); qs('closeGarageRental').addEventListener('click',closeGarageRental); qs('cancelGarageRental').addEventListener('click',closeGarageRental); qs('garageRentalForm').addEventListener('submit',queueGarageRental); document.querySelectorAll('[data-garage-tab]').forEach(t=>t.addEventListener('click',()=>switchGarageTab(t.dataset.garageTab))); qs('garageRentalBlock').addEventListener('change',fillGarageUnits);
  qs('newResidentBtn').addEventListener('click',()=>openResident()); qs('closeDialog').addEventListener('click',closeResident); qs('cancelDialog').addEventListener('click',closeResident);
  qs('formBlock').addEventListener('change',fillUnits); qs('formPhoto').addEventListener('change',previewPhoto); qs('removePhotoBtn').addEventListener('click',()=>qs('residentPhotoPreview').removeAttribute('src'));
  qs('residentForm').addEventListener('submit',queueResidentChange);
  qs('pinForm').addEventListener('submit',pinSubmit); qs('cancelPin').addEventListener('click',()=>qs('pinDialog').close());
  qs('setupForm').addEventListener('submit',setupSubmit); qs('changePinBtn').addEventListener('click',()=>requestPinChange());
  qs('newChangeBtn').addEventListener('click',()=>qs('changeDialog').showModal()); qs('cancelChange').addEventListener('click',()=>qs('changeDialog').close()); qs('closeChange').addEventListener('click',()=>qs('changeDialog').close());
  qs('changeForm').addEventListener('submit',createNotice);
  qs('notificationsBtn').addEventListener('click',()=>go('notices'));
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>switchNoticeTab(t.dataset.tab)));
  qs('exportBtn').addEventListener('click',exportBackup);
}

function refreshStats(){qs('statResidents').textContent=state.residents.length;qs('statUnits').textContent=state.units.length;qs('statVehicles').textContent=state.vehicles.length;qs('statGarages').textContent=state.garages.length;const pending=state.notices.filter(n=>n.status==='pending').length;qs('statNotices').textContent=pending;qs('noticeBadge').textContent=pending;qs('noticeBadge').hidden=!pending;}
function fillFilters(){const opts=state.blocks.map(b=>`<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');qs('residentBlockFilter').innerHTML='<option value="">Todos os blocos</option>'+opts;qs('unitBlockFilter').innerHTML='<option value="">Todos os blocos</option>'+opts;qs('formBlock').innerHTML=opts;fillUnits();}
function fillUnits(){const b=qs('formBlock').value;qs('formUnit').innerHTML=unitsByBlock(b).map(u=>`<option value="${esc(u.unit)}">${esc(u.unit)}</option>`).join('');}

function renderHomeSearch(){const q=normalize(qs('globalSearch').value);const box=qs('searchResults');if(!q){box.className='result-list empty';box.textContent='Digite algo para pesquisar.';return;}const out=[];
  state.residents.forEach(r=>{if(normalize([r.name,r.profession,r.phone,r.block,r.unit,r.pet].join(' ')).includes(q))out.push({kind:'Morador',title:r.name,sub:`${r.block} • apto ${r.unit}`,extra:r.profession||'Profissão não informada',go:'residents'});});
  state.vehicles.forEach(v=>{if(normalize([v.plate,v.garage,v.block,v.unit,v.residentName].join(' ')).includes(q))out.push({kind:'Veículo',title:v.plate||'Sem placa',sub:`${v.block} • apto ${v.unit}`,extra:`Vaga ${v.garage||'não informada'}`,go:'vehicles'});});
  state.units.forEach(u=>{if(normalize([u.block,u.unit].join(' ')).includes(q))out.push({kind:'Apartamento',title:u.unit,sub:u.block,extra:'Abrir apartamentos',go:'units'});});
  state.garages.forEach(g=>{if(normalize([g.label,g.id,g.block,g.unit,g.rentedToBlock,g.rentedToUnit].join(' ')).includes(q))out.push({kind:'Vaga',title:g.label,sub:g.type==='private'?`${g.block} • apto ${g.unit}`:(g.status==='rented'?`${g.rentedToBlock} • apto ${g.rentedToUnit}`:'Disponível'),extra:g.type==='extra'?'Vaga extra do condomínio':'Vaga privativa',go:'garage'});});
  if(!out.length){box.className='result-list empty';box.textContent='Nenhum resultado encontrado.';return;}
  box.className='result-list';box.innerHTML=out.slice(0,30).map(x=>`<button class="result-item" data-go="${x.go}"><div>${x.kind==='Morador'&&false?'':''}<div class="main-line">${esc(x.title)}</div><div class="sub-line">${esc(x.sub)}</div></div><div><span class="badge">${esc(x.kind)}</span><div class="sub-line">${esc(x.extra)}</div></div></button>`).join('');box.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
}

function renderResidents(){const q=normalize(qs('residentSearch').value),block=qs('residentBlockFilter').value;let list=state.residents.filter(r=>!block||r.block===block);if(q)list=list.filter(r=>normalize([r.name,r.profession,r.phone,r.pet,r.block,r.unit].join(' ')).includes(q));const box=qs('residentList');if(!list.length){box.innerHTML='<div class="result-list empty">Nenhum morador cadastrado com esse filtro.</div>';return;}box.innerHTML=list.map(r=>{const v=linkedVehicle(r);return `<article class="list-card"><div class="resident-row"><div class="avatar">${r.photo?`<img src="${r.photo}" alt="">`:'👤'}</div><div><div class="main-line">${esc(r.name)}</div><div class="sub-line">${esc(r.block)} • apto ${esc(r.unit)} ${r.profession?'• '+esc(r.profession):''}</div><div>${r.phone?`<span class="badge">☎ ${esc(r.phone)}</span>`:''}${r.pet?`<span class="badge">🐾 ${esc(r.pet)}</span>`:''}${v?`<span class="badge">🚗 ${esc(v.plate)} • vaga ${esc(v.garage)}</span>`:''}</div></div></div><div class="card-actions"><button class="link-btn" data-edit="${r.id}">Editar</button><button class="link-danger" data-delete="${r.id}">Excluir</button></div></article>`}).join('');box.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openResident(b.dataset.edit)));box.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>queueDeleteResident(b.dataset.delete)));}

function renderUnits(){const q=normalize(qs('unitSearch').value),block=qs('unitBlockFilter').value;let list=state.units.filter(u=>!block||u.block===block);if(q)list=list.filter(u=>normalize([u.block,u.unit].join(' ')).includes(q));qs('unitList').innerHTML=list.map(u=>{const rs=state.residents.filter(r=>r.block===u.block&&r.unit===u.unit),vs=state.vehicles.filter(v=>v.block===u.block&&v.unit===u.unit);return `<article class="unit-card"><strong>${esc(u.unit)}</strong><small>${esc(u.block)}</small><div>${rs.length?`<span class="badge">${rs.length} morador(es)</span>`:'<span class="badge">Sem morador cadastrado</span>'}${vs.length?`<span class="badge">${vs.length} veículo(s)</span>`:''}</div></article>`}).join('');}

let garageTab='private';
function garageForUnit(block,unit){return state.garages.find(g=>g.type==='private'&&g.block===block&&g.unit===unit)}
function extraGarages(){return state.garages.filter(g=>g.type==='extra')}
function rentedExtrasForUnit(block,unit){return extraGarages().filter(g=>g.status==='rented'&&g.rentedToBlock===block&&g.rentedToUnit===unit)}
function fillGarageUnits(){const b=qs('garageRentalBlock').value;qs('garageRentalUnit').innerHTML=unitsByBlock(b).map(u=>`<option value="${esc(u.unit)}">${esc(u.unit)}</option>`).join('');}
function renderGarage(){
  const q=normalize(qs('garageSearch').value); const list=state.garages.filter(g=>g.type===garageTab);
  const filtered=!q?list:list.filter(g=>normalize([g.label,g.block,g.unit,g.rentedToBlock,g.rentedToUnit,g.id,g.status].join(' ')).includes(q));
  const rented=extraGarages().filter(g=>g.status==='rented').length; const available=extraGarages().filter(g=>g.status==='available').length;
  qs('garagePrivateCount').textContent=state.garages.filter(g=>g.type==='private').length; qs('garageExtraCount').textContent=extraGarages().length; qs('garageRentedCount').textContent=rented; qs('garageAvailableCount').textContent=available;
  qs('garageList').innerHTML=filtered.length?filtered.map(g=>{
    const privateV=g.type==='private'; const title=privateV?`${g.block} • apto ${g.unit}`:g.label;
    const detail=privateV?`Vaga privativa ${g.id.replace('PRIV-','')}`:(g.status==='rented'?`Alugada para ${g.rentedToBlock} • apto ${g.rentedToUnit}`:'Disponível para locação');
    const badge=privateV?`<span class="status-badge status-ok">Privativa da unidade</span>`:(g.status==='rented'?`<span class="status-badge status-warn">Alugada</span>`:`<span class="status-badge status-free">Disponível</span>`);
    const action=!privateV&&g.status==='rented'?`<button class="link-danger" data-release-extra="${g.id}">Encerrar locação</button>`:'';
    return `<article class="garage-card"><div><div class="main-line">${esc(title)}</div><div class="sub-line">${esc(detail)}</div>${badge}${g.notes?`<div class="sub-line">${esc(g.notes)}</div>`:''}</div><div class="garage-actions">${action}</div></article>`;
  }).join(''):'<div class="result-list empty">Nenhuma vaga encontrada.</div>';
  qs('garageList').querySelectorAll('[data-release-extra]').forEach(b=>b.addEventListener('click',()=>releaseExtraGarage(b.dataset.releaseExtra)));
}
function switchGarageTab(tab){garageTab=tab;document.querySelectorAll('[data-garage-tab]').forEach(t=>t.classList.toggle('active',t.dataset.garageTab===tab));qs('garageSearch').value='';renderGarage();}
function openGarageRental(){
  const available=extraGarages().filter(g=>g.status==='available'); if(!available.length){alert('Não há vagas extras disponíveis para locação.');return;}
  qs('garageRentalSpace').innerHTML=available.map(g=>`<option value="${g.id}">${esc(g.label)}</option>`).join('');
  qs('garageRentalBlock').innerHTML=state.blocks.map(b=>`<option value="${esc(b.name)}">${esc(b.name)}</option>`).join(''); fillGarageUnits(); qs('garageRentalStart').value=new Date().toISOString().slice(0,10); qs('garageRentalDialog').showModal();
}
function closeGarageRental(){qs('garageRentalDialog').close();}
function queueGarageRental(e){e.preventDefault();const id=qs('garageRentalSpace').value;const p={type:'garageRental',id,block:qs('garageRentalBlock').value,unit:qs('garageRentalUnit').value,startDate:qs('garageRentalStart').value,endDate:qs('garageRentalEnd').value,notes:qs('garageRentalNotes').value.trim()};requestAdminConfirmation('Confirmar locação de vaga extra',p,applyGarageRental);}
async function applyGarageRental(p){const g=state.garages.find(x=>x.id===p.id);if(!g||g.status!=='available'){alert('A vaga extra já não está disponível.');return;}g.status='rented';g.rentedToBlock=p.block;g.rentedToUnit=p.unit;g.startDate=p.startDate;g.endDate=p.endDate;g.notes=p.notes;state.history.push({id:uid(),action:'Locação de vaga extra',result:'Confirmada',at:now(),detail:`${g.label} → ${p.block} / apto ${p.unit}`});await persist();closeGarageRental();renderAll();go('garage');}
function releaseExtraGarage(id){const g=state.garages.find(x=>x.id===id);if(!g)return;requestAdminConfirmation('Confirmar encerramento da locação',{type:'releaseGarage',id,detail:`Encerrar locação de ${g.label} (${g.rentedToBlock} / apto ${g.rentedToUnit})?`},applyReleaseExtra);}
async function applyReleaseExtra(p){const g=state.garages.find(x=>x.id===p.id);if(!g)return;const detail=`${g.label} — ${g.rentedToBlock} / apto ${g.rentedToUnit}`;g.status='available';g.rentedToBlock='';g.rentedToUnit='';g.startDate='';g.endDate='';g.notes='';state.history.push({id:uid(),action:'Encerramento de locação',result:'Confirmada',at:now(),detail});await persist();renderAll();go('garage');}

function renderVehicles(){const q=normalize(qs('vehicleSearch').value);let list=state.vehicles;if(q)list=list.filter(v=>normalize([v.plate,v.garage,v.block,v.unit,v.residentName].join(' ')).includes(q));const box=qs('vehicleList');if(!list.length){box.innerHTML='<div class="result-list empty">Nenhum veículo cadastrado com esse filtro.</div>';return;}box.innerHTML=list.map(v=>`<article class="list-card"><div><div class="main-line">${esc(v.plate||'Sem placa')}</div><div class="sub-line">${esc(v.block)} • apto ${esc(v.unit)} • ${esc(v.residentName||'Morador não informado')}</div></div><span class="badge">Vaga ${esc(v.garage||'não informada')}</span></article>`).join('');}

function renderNotices(){const p=state.notices.filter(n=>n.status==='pending'),h=state.history.slice().reverse();qs('pendingList').innerHTML=p.length?p.map(n=>`<article class="list-card notice-item"><div><div class="main-line">${esc(n.subject||'Alteração')}</div><div class="sub-line">${esc(n.source||'Origem não informada')} • ${esc(n.createdAt)}</div><p>${esc(n.description||'')}</p></div><div class="card-actions"><button class="primary-btn small" data-approve="${n.id}">Confirmar</button><button class="link-danger" data-reject="${n.id}">Recusar</button></div></article>`).join(''):'<div class="result-list empty">Nenhuma pendência.</div>';qs('pendingList').querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click',()=>approveNotice(b.dataset.approve)));qs('pendingList').querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>rejectNotice(b.dataset.reject)));qs('historyList').innerHTML=h.length?h.map(x=>`<article class="list-card"><div><div class="main-line">${esc(x.action)}</div><div class="sub-line">${esc(x.at)} • ${esc(x.result)}</div><p>${esc(x.detail||'')}</p></div></article>`).join(''):'<div class="result-list empty">Nenhuma alteração registrada.</div>';refreshStats();}
function switchNoticeTab(tab){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));qs('pendingList').hidden=tab!=='pending';qs('historyList').hidden=tab!=='history';}

function openResident(id){currentEdit=id||null;qs('residentDialogTitle').textContent=id?'Editar morador':'Novo morador';const r=id?state.residents.find(x=>x.id===id):null;fillFilters();if(r){qs('formBlock').value=r.block;fillUnits();qs('formUnit').value=r.unit;qs('formName').value=r.name;qs('formProfession').value=r.profession||'';qs('formPhone').value=r.phone||'';qs('formPet').value=r.pet||'';qs('formVehiclePlate').value=(linkedVehicle(r)?.plate||'');qs('formGarage').value=(linkedVehicle(r)?.garage||'');qs('residentPhotoPreview').src=r.photo||'';}else{qs('residentForm').reset();qs('formBlock').dispatchEvent(new Event('change'));qs('residentPhotoPreview').removeAttribute('src');}qs('residentDialog').showModal();}
function closeResident(){qs('residentDialog').close();currentEdit=null;}

async function resizePhoto(file){if(!file)return '';const img=new Image();const url=URL.createObjectURL(file);try{await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});const max=720,scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.78);}finally{URL.revokeObjectURL(url)}}
async function previewPhoto(){const d=await resizePhoto(qs('formPhoto').files[0]);if(d)qs('residentPhotoPreview').src=d;}

function queueResidentChange(e){e.preventDefault();const proposal={type:'resident',id:currentEdit||uid(),block:qs('formBlock').value,unit:qs('formUnit').value,name:qs('formName').value.trim(),profession:qs('formProfession').value.trim(),phone:qs('formPhone').value.trim(),pet:qs('formPet').value.trim(),photo:qs('residentPhotoPreview').getAttribute('src')||'',plate:qs('formVehiclePlate').value.trim().toUpperCase(),garage:qs('formGarage').value.trim()};requestAdminConfirmation('Confirmar alteração de morador',proposal,applyResidentProposal);}
function queueDeleteResident(id){const r=state.residents.find(x=>x.id===id);if(!r)return;requestAdminConfirmation('Confirmar exclusão', {type:'deleteResident',id,detail:`Excluir ${r.name} (${r.block} / apto ${r.unit})?`},applyDeleteProposal);}

let pendingAction=null;
function requestAdminConfirmation(title,payload,action){pendingAction={payload,action};qs('pinTitle').textContent=title;qs('pinText').textContent='A alteração só será efetivada após a confirmação do administrador.';qs('pinInput').value='';qs('pinDialog').showModal();setTimeout(()=>qs('pinInput').focus(),80);}
async function pinSubmit(e){e.preventDefault();const ok=await verifyPin(qs('pinInput').value);if(!ok){qs('pinText').textContent='PIN incorreto. Tente novamente.';qs('pinInput').value='';return;}const job=pendingAction;pendingAction=null;qs('pinDialog').close();await job.action(job.payload);}
async function setupSubmit(e){e.preventDefault();const a=qs('setupPin').value,b=qs('setupPin2').value;if(a.length<4||a!==b){alert('Use pelo menos 4 dígitos e confirme o mesmo PIN.');return;}await setPin(a);qs('setupDialog').close();renderAll();}
function openSetup(){qs('setupDialog').showModal();}
async function requestPinChange(){requestAdminConfirmation('Alterar PIN',{type:'changePin'},async()=>{const p=prompt('Digite o novo PIN (mínimo 4 dígitos):');if(!p||p.length<4)return;const p2=prompt('Repita o novo PIN:');if(p!==p2){alert('Os PINs não conferem.');return;}await setPin(p);alert('PIN alterado.');});}

async function applyResidentProposal(p){let action='Cadastro de morador';let existing=state.residents.find(r=>r.id===p.id);if(existing){Object.assign(existing,{block:p.block,unit:p.unit,name:p.name,profession:p.profession,phone:p.phone,pet:p.pet,photo:p.photo});action='Edição de morador';}else{state.residents.push({id:p.id,block:p.block,unit:p.unit,name:p.name,profession:p.profession,phone:p.phone,pet:p.pet,photo:p.photo});}
  state.vehicles=state.vehicles.filter(v=>v.residentId!==p.id);if(p.plate||p.garage)state.vehicles.push({id:uid(),residentId:p.id,residentName:p.name,block:p.block,unit:p.unit,plate:p.plate,garage:p.garage});
  state.history.push({id:uid(),action,result:'Confirmada',at:now(),detail:`${action}: ${p.name} • ${p.block} / apto ${p.unit}`});await persist();closeResident();renderAll();}
async function applyDeleteProposal(p){const r=state.residents.find(x=>x.id===p.id);state.residents=state.residents.filter(x=>x.id!==p.id);state.vehicles=state.vehicles.filter(v=>v.residentId!==p.id);state.history.push({id:uid(),action:'Exclusão de morador',result:'Confirmada',at:now(),detail:r?`${r.name} • ${r.block} / apto ${r.unit}`:p.id});await persist();renderAll();}

async function createNotice(e){e.preventDefault();const n={id:uid(),type:'manual',source:qs('changeSource').value.trim(),subject:qs('changeSubject').value.trim(),description:qs('changeDescription').value.trim(),createdAt:now(),status:'pending'};state.notices.push(n);await persist();qs('changeForm').reset();qs('changeDialog').close();renderAll();go('notices');}
async function approveNotice(id){const n=state.notices.find(x=>x.id===id);if(!n)return;requestAdminConfirmation('Confirmar correção',n,async()=>{n.status='approved';n.resolvedAt=now();state.history.push({id:uid(),action:'Correção confirmada',result:'Confirmada',at:now(),detail:`${n.subject}: ${n.description}`});await persist();renderNotices();});}
async function rejectNotice(id){const n=state.notices.find(x=>x.id===id);if(!n)return;requestAdminConfirmation('Recusar correção',n,async()=>{n.status='rejected';n.resolvedAt=now();state.history.push({id:uid(),action:'Correção recusada',result:'Recusada',at:now(),detail:`${n.subject}: ${n.description}`});await persist();renderNotices();});}

function renderAll(){fillFilters();refreshStats();renderHomeSearch();renderResidents();renderUnits();renderVehicles();renderGarage();renderNotices();}
async function exportBackup(){const safe=clone(state);safe.exportedAt=now();const blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='residencial-americas-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}

function registerPWA(){if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}

init().catch(err=>{console.error(err);alert('Não foi possível iniciar a base local deste aparelho.');});
