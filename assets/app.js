"use strict";

const CONFIG={
  officialBase:"https://resultados.tse.jus.br",
  simulatedBase:"https://resultados-sim.tse.jus.br",
  proxyPrefix:"/api/tse?url=",
  stateGeoJSON:"https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/brazil-states.geojson",
  municipalityGeoJSON:ibge=>`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${ibge}-mun.json`,
  pollJitterMs:12000,
  projectionMaxProgress:60,
  projectionIterations:3000,
};

const OFFICE={
  "1":{name:"Presidente",type2026:8,majoritarian:true},
  "3":{name:"Governador",type2026:1,majoritarian:true},
  "5":{name:"Senador",type2026:1,majoritarian:true},
  "6":{name:"Deputado Federal",type2026:1,proportional:true},
  "7":{name:"Deputado Estadual / Distrital",type2026:1,proportional:true},
};
const STATES=[
  ["AC","Acre","12"],["AL","Alagoas","27"],["AP","Amapá","16"],["AM","Amazonas","13"],
  ["BA","Bahia","29"],["CE","Ceará","23"],["DF","Distrito Federal","53"],["ES","Espírito Santo","32"],
  ["GO","Goiás","52"],["MA","Maranhão","21"],["MT","Mato Grosso","51"],["MS","Mato Grosso do Sul","50"],
  ["MG","Minas Gerais","31"],["PA","Pará","15"],["PB","Paraíba","25"],["PR","Paraná","41"],
  ["PE","Pernambuco","26"],["PI","Piauí","22"],["RJ","Rio de Janeiro","33"],["RN","Rio Grande do Norte","24"],
  ["RS","Rio Grande do Sul","43"],["RO","Rondônia","11"],["RR","Roraima","14"],["SC","Santa Catarina","42"],
  ["SP","São Paulo","35"],["SE","Sergipe","28"],["TO","Tocantins","17"]
];
const STATE_BY_UF=Object.fromEntries(STATES.map(([uf,name,ibge])=>[uf,{uf,name,ibge}]));
const UF_BY_NAME=Object.fromEntries(STATES.map(([uf,name])=>[norm(name),uf]));
const PARTY_BY_NUMBER={
  "10":"REPUBLICANOS","11":"PP","12":"PDT","13":"PT","14":"PTB","15":"MDB","16":"PSTU","18":"REDE","19":"PODE","20":"PSC","21":"PCB","22":"PL","23":"CIDADANIA","27":"DC","28":"PRTB","29":"PCO","30":"NOVO","33":"PMN","35":"PMB","36":"AGIR","40":"PSB","43":"PV","44":"UNIÃO","45":"PSDB","50":"PSOL","51":"PATRIOTA","55":"PSD","65":"PCdoB","70":"AVANTE","77":"SOLIDARIEDADE","80":"UP","90":"PROS"
};

const ids=["year","environment","environmentLabel","turn","office","state","layerMode","projectionThreshold","refreshInterval","refreshBtn","backBtn","headerYear","titleYear","railYear","modePill","liveDot","sourceStatus","lastUpdate","statProgress","statValid","statBlank","statBlankPct","statNull","statNullPct","progressRing","scopeBadge","detailsTitle","resultCount","candidateList","seatStrip","projectionPanel","projectionBadge","projectionSummary","projectionList","projectionFootnote","mapTitle","map","legendItems","mapHint","loadingOverlay","loadingText","loadingSubtext","technicalStatus","mapBrazilBtn","mapStateBtn","mapFitBtn","historyShortcut","methodologyBtn","methodologyDialog"];
const el=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));

const app={
  map:null,stateLayer:null,municipalityLayer:null,stateGeo:null,municipalityGeo:null,
  context:null,currentRaw:null,currentNormalized:null,currentScopeType:"br",currentScopeLabel:"Brasil",
  stateResults:new Map(),municipalResults:new Map(),municipalStamps:new Map(),trackerUnits:new Map(),
  municipalityByIBGE:new Map(),municipalityByTSE:new Map(),municipalityConfigKey:"",
  directTseMode:null,requestGeneration:0,pollTimer:null,backgroundToken:0,
};

function norm(s=""){return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function pad(v,n){return String(v).padStart(n,"0")}
function num(v,d=0){const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:d}
function fmtInt(v){return Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString("pt-BR"):"—"}
function fmtPct(v,digits=1){return Number.isFinite(Number(v))?`${Number(v).toLocaleString("pt-BR",{minimumFractionDigits:digits,maximumFractionDigits:2})}%`:"—"}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function initials(s){return String(s||"?").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"?"}
function selectedOffice(){return String(el.office.value)}
function selectedYear(){return Number(el.year.value)}
function officeName(){return OFFICE[selectedOffice()]?.name||"Resultado"}
function stateName(uf){return STATE_BY_UF[uf]?.name||uf}
function effectiveCargo(uf=""){return selectedOffice()==="7"&&uf==="DF"?"8":selectedOffice()}
function isMajoritarian(){return !!OFFICE[selectedOffice()]?.majoritarian}
function isProportional(){return !!OFFICE[selectedOffice()]?.proportional}
function candidateColor(key){const str=String(key??"x");let h=0;for(let i=0;i<str.length;i++)h=(h*31+str.charCodeAt(i))%360;return `hsl(${h} 76% 58%)`}
function progressColor(p){const v=Math.max(0,Math.min(100,num(p)));return `hsl(207 78% ${28+(v/100)*30}%)`}
function setLoading(show,title="Carregando dados…",sub=""){el.loadingOverlay.classList.toggle("hidden",!show);el.loadingText.textContent=title;el.loadingSubtext.textContent=sub}
function setStatus(kind,title,detail=""){el.sourceStatus.textContent=title;el.lastUpdate.textContent=detail||"—";el.liveDot.className="live-dot"+(kind==="live"?" live":kind==="warn"?" warn":"")}
function setModeHeader(){const year=selectedYear();el.headerYear.textContent=year;el.titleYear.textContent=year;el.railYear.textContent=year;const historical=year===2022;el.modePill.textContent=historical?"HISTÓRICO":"AO VIVO";el.modePill.className="pill "+(historical?"history":"");el.environment.disabled=historical;el.environmentLabel.style.opacity=historical?".55":"1"}
function resetData(){app.currentRaw=null;app.currentNormalized=null;app.currentScopeType="br";app.currentScopeLabel="Brasil";app.stateResults.clear();app.municipalResults.clear();app.municipalStamps.clear();app.trackerUnits.clear();app.backgroundToken++;renderSummary(null);renderCandidates(null);renderProjection();renderLegend([])}

async function fetchJSON(url,{allow404=false}={}){
  if(app.directTseMode!==false&&/^https:\/\/resultados(?:-sim)?\.tse\.jus\.br/.test(url)){
    try{const r=await fetch(url,{cache:"no-store"});if(allow404&&r.status===404){app.directTseMode=true;return null}if(r.ok){app.directTseMode=true;return r.json()}}catch(_e){app.directTseMode=false}
  }
  const proxy=CONFIG.proxyPrefix+encodeURIComponent(url);const r=await fetch(proxy,{cache:"no-store"});if(allow404&&r.status===404)return null;if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();
}
async function fetchPublicJSON(url){const r=await fetch(url,{cache:"force-cache"});if(!r.ok)throw new Error(`Falha ao carregar mapa (${r.status})`);return r.json()}

async function resolveContext(){
  const year=selectedYear(),turn=Number(el.turn.value),office=selectedOffice();
  if(year===2022){
    let election;if(office==="1")election=turn===2?545:544;else election=turn===2?547:546;
    return {year,turn,office,election,cycle:"ele2022",base:CONFIG.officialBase,env:"oficial",format:"legacy",label:"Histórico oficial 2022"};
  }
  const simulated=el.environment.value==="simulated";const base=simulated?CONFIG.simulatedBase:CONFIG.officialBase,env=simulated?"simulado":"oficial";
  const cfg=await fetchJSON(`${base}/${env}/comum/config/ele-c.json`,{allow404:true});
  if(!cfg)return null;
  const desiredType=OFFICE[office]?.type2026??1;const candidates=[];
  for(const pleito of (cfg.pl||[])){
    const yr=Number(String(pleito.dt||"").split("/").pop());
    for(const e of (pleito.e||[]))if(yr===2026&&Number(e.t)===turn&&Number(e.tp)===desiredType)candidates.push({...e,pleito:pleito.cd});
  }
  const e=candidates[0];if(!e)return {unavailable:true,year,turn,office,base,env,cycle:cfg.c||"",label:simulated?"Simulado 2026":"Oficial 2026",config:cfg};
  return {year,turn,office,election:Number(e.cd),cycle:cfg.c||"ele2026",base,env,format:"unified",label:simulated?"Simulado 2026":"Oficial 2026",config:cfg};
}

function buildUrl(type,{uf="",mun="",cargo=""}={}){
  const c=app.context;if(!c||c.unavailable)throw new Error("Eleição indisponível");const e6=pad(c.election,6),scope=String(uf||"br").toLowerCase(),cg=pad(cargo||effectiveCargo(String(uf).toUpperCase()),4);
  if(type==="municipalConfig")return `${c.base}/${c.env}/${c.cycle}/${c.election}/config/mun-e${e6}-cm.json`;
  if(type==="trackerUF")return `${c.base}/${c.env}/${c.cycle}/${c.election}/dados/${scope}/${scope}-e${e6}-ab.json`;
  if(type==="result"){
    if(c.format==="legacy")return `${c.base}/${c.env}/${c.cycle}/${c.election}/dados-simplificados/${scope}/${scope}-c${cg}-e${e6}-r.json`;
    return `${c.base}/${c.env}/${c.cycle}/${c.election}/dados/${scope}/${scope}-c${cg}-e${e6}-u.json`;
  }
  if(type==="municipality"){
    if(c.format==="legacy")return `${c.base}/${c.env}/${c.cycle}/${c.election}/dados/${scope}/${scope}${mun}-c${cg}-e${e6}-v.json`;
    return `${c.base}/${c.env}/${c.cycle}/${c.election}/dados/${scope}/${scope}${mun}-c${cg}-e${e6}-u.json`;
  }
  throw new Error("Tipo de URL desconhecido");
}

function partyFromNumber(number){const s=String(number||"").replace(/\D/g,"");if(!s)return "";return PARTY_BY_NUMBER[s.length<=2?s:s.slice(0,2)]||""}
function legacyParty(c){return partyFromNumber(c.n)||String(c.sg||c.p||"").trim()||"—"}
function normalizeLegacy(raw){
  if(!raw)return null;let src=raw;
  if(Array.isArray(raw.abr)&&!Array.isArray(raw.cand)){src=raw.abr.find(x=>String(x.tpabr||"").toLowerCase().startsWith("mu"))||raw.abr[0]||raw;src={...raw,...src}}
  const candidates=(src.cand||[]).map(c=>({key:String(c.sqcand||c.n||c.nm),number:String(c.n||""),name:c.nm||c.nmu||"Candidato",party:legacyParty(c),coalition:c.cc||"",votes:num(c.vap),pct:num(c.pvap),elected:c.e==="s",status:c.st||"",sqcand:String(c.sqcand||"")})).sort((a,b)=>b.votes-a.votes);
  return {progress:num(src.pstn??src.pst),valid:num(src.vv),blank:num(src.vb),null:num(src.tvn??src.vn),totalVotes:num(src.tv),electorateTotal:num(src.e),electorateCounted:num(src.ea),electorateRemaining:num(src.ena),sectionsTotal:num(src.s),sectionsCounted:num(src.st),updated:[src.dt,src.ht].filter(Boolean).join(" "),candidates,seatGroups:[],md:src.md||"",final:src.tf==="s"||num(src.pst)>=100,raw};
}
function normalizeUnified(raw){
  if(!raw)return null;const candidates=[],seatGroups=[];
  for(const carg of (raw.carg||[]))for(const agr of (carg.agr||[])){
    const parties=(agr.par||[]).map(p=>p.sg).filter(Boolean);const vagas=num(agr.vag);
    if(vagas>0)seatGroups.push({name:agr.nm||agr.sg||parties.join("/")||"Grupo",seats:vagas});
    for(const par of (agr.par||[]))for(const c of (par.cand||[]))candidates.push({key:String(c.sqcand||c.n||c.nm),number:String(c.n||""),name:c.nmu||c.nm||"Candidato",party:par.sg||"—",coalition:agr.nm||"",votes:num(c.vap),pct:num(c.pvapn??c.pvap),elected:c.e==="s",status:c.st||c.dvt||"",sqcand:String(c.sqcand||"")});
  }
  candidates.sort((a,b)=>b.votes-a.votes||String(a.name).localeCompare(String(b.name)));
  return {progress:num(raw?.s?.pstn??raw?.s?.pst),valid:num(raw?.v?.vv),blank:num(raw?.v?.vb),null:num(raw?.v?.tvn??raw?.v?.vn),totalVotes:num(raw?.v?.tv),electorateTotal:num(raw?.e?.te),electorateCounted:num(raw?.e?.est),electorateRemaining:num(raw?.e?.esnt),sectionsTotal:num(raw?.s?.ts),sectionsCounted:num(raw?.s?.st),updated:[raw.dt,raw.ht].filter(Boolean).join(" "),candidates,seatGroups,md:raw.md||"",final:raw.tf==="s"||raw.and==="f",raw};
}
function normalizeResult(raw){return raw?.carg?normalizeUnified(raw):normalizeLegacy(raw)}
function leaderOf(raw){return normalizeResult(raw)?.candidates?.[0]||null}

function photoScope(uf=""){return selectedOffice()==="1"?"br":String(uf||el.state.value||"br").toLowerCase()}
function photoUrl(c,uf=""){if(!c?.sqcand||!app.context||app.context.unavailable)return "";return `${app.context.base}/${app.context.env}/${app.context.cycle}/${app.context.election}/fotos/${photoScope(uf)}/${c.sqcand}.jpeg`}
function avatarHTML(c,uf,size=""){const url=photoUrl(c,uf),color=candidateColor(c.number||c.key);return `<span class="avatar ${size}" style="--candidate:${color}"><span>${escapeHtml(initials(c.name))}</span>${url?`<img src="${escapeHtml(url)}" alt="Foto de ${escapeHtml(c.name)}" loading="lazy">`:""}</span>`}
function bindImageFallbacks(root=document){for(const img of root.querySelectorAll(".avatar img"))img.addEventListener("error",()=>{img.style.display="none"},{once:true})}

function renderSummary(raw){
  const s=normalizeResult(raw);if(!s){el.statProgress.textContent=el.statValid.textContent=el.statBlank.textContent=el.statNull.textContent="—";el.statBlankPct.textContent=el.statNullPct.textContent="";el.progressRing.style.setProperty("--pct",0);return}
  el.statProgress.textContent=fmtPct(s.progress);el.statValid.textContent=fmtInt(s.valid);el.statBlank.textContent=fmtInt(s.blank);el.statNull.textContent=fmtInt(s.null);const denom=s.totalVotes||s.valid+s.blank+s.null;el.statBlankPct.textContent=denom?fmtPct(100*s.blank/denom):"";el.statNullPct.textContent=denom?fmtPct(100*s.null/denom):"";el.progressRing.style.setProperty("--pct",Math.max(0,Math.min(100,s.progress)));
}
function renderCandidates(raw,title=officeName(),scope=app.currentScopeLabel){
  const s=normalizeResult(raw);el.detailsTitle.textContent=`Resultados — ${title}`;el.scopeBadge.textContent=scope||"Brasil";el.seatStrip.classList.add("hidden");el.seatStrip.innerHTML="";
  if(!s?.candidates?.length){el.resultCount.textContent="—";el.candidateList.innerHTML=`<div class="empty">${selectedOffice()==="1"||el.state.value?"Ainda não há votação disponível para esta abrangência.":"Selecione um estado para ver os candidatos deste cargo."}</div>`;return}
  el.resultCount.textContent=`${s.candidates.length} candidatos`;
  if(isProportional()&&s.seatGroups?.length){el.seatStrip.classList.remove("hidden");el.seatStrip.innerHTML=s.seatGroups.slice(0,18).map(g=>`<span class="seat-chip">${escapeHtml(g.name)} <strong>${fmtInt(g.seats)} vaga${g.seats===1?"":"s"}</strong></span>`).join("")}
  const uf=el.state.value;const limit=isProportional()?40:18;
  el.candidateList.innerHTML=s.candidates.slice(0,limit).map((c,i)=>{const color=candidateColor(c.number||c.key),w=Math.max(1,Math.min(100,c.pct));return `<div class="candidate-row" style="--candidate:${color}"><span class="rank">${i+1}</span><div class="candidate-id">${avatarHTML(c,uf)}<div><div class="candidate-name">${escapeHtml(c.name)}</div><div class="candidate-sub">${escapeHtml(c.number)}${c.elected?` <span class="elected-chip">ELEITO</span>`:""}</div></div></div><div class="party-cell" title="${escapeHtml(c.coalition||c.party)}">${escapeHtml(c.party||"—")}</div><div class="pct-cell"><strong>${fmtPct(c.pct)}</strong><div class="mini-bar"><i style="width:${w}%"></i></div></div><div class="votes-cell">${fmtInt(c.votes)}</div></div>`}).join("");bindImageFallbacks(el.candidateList);
}

function projectionUnits(){
  if(app.currentScopeType==="municipality")return [];
  if(app.currentScopeType==="br")return [...app.stateResults.values()].map(normalizeResult).filter(Boolean);
  const units=new Map();for(const [k,v] of app.trackerUnits)units.set(k,v);for(const [k,v] of app.municipalResults){const n=normalizeResult(v);if(n)units.set(k,n)}return [...units.values()];
}
function renderProjection(){
  el.projectionList.innerHTML="";const aggregate=app.currentNormalized;
  if(!aggregate){el.projectionBadge.textContent="MODELO";el.projectionBadge.className="pill model";el.projectionSummary.innerHTML=`<div class="empty">Aguardando dados da apuração.</div>`;return}
  if(app.currentScopeType==="municipality"){el.projectionBadge.textContent="UF/BR";el.projectionSummary.innerHTML=`<div class="projection-alert">A projeção de vitória é calculada para Brasil ou UF. O município continua disponível para consulta dos votos locais.</div>`;return}
  const p=window.ElectionProjection.compute({aggregate,units:projectionUnits(),office:effectiveCargo(el.state.value),turn:Number(el.turn.value),year:selectedYear(),threshold:num(el.projectionThreshold.value,10),maxProgress:CONFIG.projectionMaxProgress,iterations:CONFIG.projectionIterations,senateSeats:selectedOffice()==="5"?(selectedYear()===2026?2:1):1});
  if(!p.available){el.projectionBadge.textContent=p.closed?"ENCERRADA":p.proportional?"PROPORCIONAL":"AGUARDANDO";el.projectionBadge.className="pill "+(p.closed?"history":"model");el.projectionSummary.innerHTML=`<div class="projection-alert ${p.closed?"official":""}">${escapeHtml(p.reason||"Projeção indisponível.")}</div>`;el.projectionFootnote.textContent=p.proportional?"Para deputados, acompanhe votos, situação e vagas atribuídas pelo TSE.":"Estimativa independente. A projeção é exibida somente até 60% da apuração e não representa declaração oficial do TSE.";return}
  el.projectionBadge.textContent=`${p.confidence.toUpperCase()} • ${p.iterations.toLocaleString("pt-BR")} SIM.`;el.projectionBadge.className="pill model";
  const scope=app.currentScopeLabel;let summary=`<div class="projection-kpi"><span>Apuração usada</span><strong>${fmtPct(p.progress)}</strong></div><div class="projection-kpi"><span>Unidades no modelo</span><strong>${fmtInt(p.unitsUsed)}</strong></div>`;
  if(p.runoffProbability!==null)summary+=`<div class="projection-kpi wide"><span>Chance de haver 2º turno • ${escapeHtml(scope)}</span><strong>${fmtPct(p.runoffProbability)}</strong></div>`;
  if(selectedOffice()==="5")summary+=`<div class="projection-kpi wide"><span>Vagas ao Senado consideradas</span><strong>${p.senateSeats}</strong></div>`;
  el.projectionSummary.innerHTML=summary;
  el.projectionList.innerHTML=p.results.slice(0,6).map(c=>{let value,label,extra;if(selectedOffice()==="5"){value=c.qualificationProbability;label="chance de eleição";extra=`Faixa projetada: ${fmtPct(c.low90)}–${fmtPct(c.high90)}`}else if(Number(el.turn.value)===1){value=c.firstRoundWinProbability;label="vitória no 1º turno";extra=`Classificação ao 2º: ${fmtPct(c.qualificationProbability)}`}else{value=c.leadProbability;label="chance de vitória";extra=`Faixa projetada: ${fmtPct(c.low90)}–${fmtPct(c.high90)}`}const color=candidateColor(c.number||c.key);return `<div class="proj-card" style="--candidate:${color}"><div class="proj-person">${avatarHTML(c,el.state.value)}<div><strong>${escapeHtml(c.name)}</strong><span class="proj-label">${escapeHtml(label)}</span></div><span class="proj-value">${fmtPct(value,0)}</span></div><div class="proj-track"><i style="width:${Math.max(0,Math.min(100,value))}%"></i></div><span class="proj-label">${escapeHtml(extra)} • esperado ${fmtPct(c.expectedShare)}</span></div>`}).join("");bindImageFallbacks(el.projectionList);el.projectionFootnote.textContent=`Modelo independente até 60% da apuração. Escopo: ${scope}. Não é uma declaração oficial do TSE.`;
}

function stateStyle(feature){const name=feature?.properties?.name||feature?.properties?.Nome||"",uf=UF_BY_NAME[norm(name)],raw=uf?app.stateResults.get(uf):null,s=normalizeResult(raw),lead=s?.candidates?.[0];const fill=el.layerMode.value==="progress"?progressColor(s?.progress||0):(lead?candidateColor(lead.number||lead.key):"#18304a");return {color:"#274d71",weight:1,fillColor:fill,fillOpacity:(raw && (raw.carg || (raw.cand && raw.cand.length))) ? .8 : .6}}
function municipalityStyle(feature){const ibge=String(feature?.properties?.id||""),raw=app.municipalResults.get(ibge),s=normalizeResult(raw),lead=s?.candidates?.[0],track=app.trackerUnits.get(ibge);const fill=el.layerMode.value==="progress"?progressColor(s?.progress??track?.progress??0):(lead?candidateColor(lead.number||lead.key):"#142c44");return {color:"#285070",weight:.55,fillColor:fill,fillOpacity:.82}}
function renderLegend(raws){
  if(el.layerMode.value==="progress"){el.legendItems.innerHTML=[0,25,50,75,100].map(v=>`<div class="legend-item"><span class="swatch" style="background:${progressColor(v)}"></span>${v}% totalizado</div>`).join("");return}
  const leaders=new Map();for(const raw of raws){const c=leaderOf(raw);if(c)leaders.set(`${c.number}|${c.name}`,c)}const list=[...leaders.values()].slice(0,7);el.legendItems.innerHTML=list.length?list.map(c=>`<div class="legend-item"><span class="swatch" style="background:${candidateColor(c.number||c.key)}"></span>${escapeHtml(c.name)} (${escapeHtml(c.party)})</div>`).join(""):`<div class="empty">Sem resultados nesta camada.</div>`;
}
function popupHTML(label,raw){const s=normalizeResult(raw),c=s?.candidates?.[0];if(!s)return `<div class="popup-title">${escapeHtml(label)}</div><div class="popup-row">Sem resultado carregado.</div>`;return `<div class="popup-title">${escapeHtml(label)}</div>${c?`<div class="popup-row">Mais votado: <strong>${escapeHtml(c.name)} (${escapeHtml(c.party)})</strong></div><div class="popup-row">Votos: <strong>${fmtPct(c.pct)}</strong></div>`:""}<div class="popup-row">Seções totalizadas: <strong>${fmtPct(s.progress)}</strong></div><div class="popup-row">Votos válidos: <strong>${fmtInt(s.valid)}</strong></div>`}

function initMap(){app.map=L.map("map",{zoomControl:true,minZoom:3,maxZoom:12,attributionControl:false,preferCanvas:true}).setView([-14.5,-52.5],4)}
async function loadStateGeometry(){if(!app.stateGeo)app.stateGeo=await fetchPublicJSON(CONFIG.stateGeoJSON);if(app.municipalityLayer){app.map.removeLayer(app.municipalityLayer);app.municipalityLayer=null}if(app.stateLayer)app.map.removeLayer(app.stateLayer);app.stateLayer=L.geoJSON(app.stateGeo,{style:stateStyle,onEachFeature:(feature,layer)=>{const name=feature?.properties?.name||"",uf=UF_BY_NAME[norm(name)];if(uf){layer.bindTooltip(uf,{permanent:true,direction:"center",className:"state-label"});layer.on("click",()=>{const raw=app.stateResults.get(uf);layer.bindPopup(popupHTML(`${name} (${uf})`,raw)).openPopup();setTimeout(()=>{el.state.value=uf;onStateChanged()},180)})}layer.on("mouseover",e=>e.target.setStyle({weight:2,color:"#87c8ff"}));layer.on("mouseout",e=>app.stateLayer?.resetStyle(e.target))}}).addTo(app.map);app.map.fitBounds(app.stateLayer.getBounds(),{padding:[18,18]})}
async function loadMunicipalityGeometry(uf){const st=STATE_BY_UF[uf];if(!st)return;if(app.stateLayer){app.map.removeLayer(app.stateLayer);app.stateLayer=null}setLoading(true,`Carregando mapa de ${st.name}…`,`Malha municipal • IBGE ${st.ibge}`);try{app.municipalityGeo=await fetchPublicJSON(CONFIG.municipalityGeoJSON(st.ibge));if(app.municipalityLayer)app.map.removeLayer(app.municipalityLayer);app.municipalityLayer=L.geoJSON(app.municipalityGeo,{style:municipalityStyle,onEachFeature:(feature,layer)=>{const ibge=String(feature?.properties?.id||""),name=feature?.properties?.name||"Município";layer.bindTooltip(name,{sticky:true});layer.on("click",async()=>{await selectMunicipality(ibge,name,layer)});layer.on("mouseover",e=>e.target.setStyle({weight:1.6,color:"#8fd0ff"}));layer.on("mouseout",e=>app.municipalityLayer?.resetStyle(e.target))}}).addTo(app.map);app.map.fitBounds(app.municipalityLayer.getBounds(),{padding:[18,18]})}finally{setLoading(false)}}
function restyleMap(){app.stateLayer?.setStyle(stateStyle);app.municipalityLayer?.setStyle(municipalityStyle);renderLegend(el.state.value?[...app.municipalResults.values()]:[...app.stateResults.values()]);updateMapTitle()}
function updateMapTitle(){const mode=el.layerMode.value==="leader"?"candidato mais votado":"percentual totalizado";if(el.state.value){el.mapTitle.innerHTML=`Mapa de ${escapeHtml(stateName(el.state.value))} <em>— ${mode} por município</em>`;el.mapStateBtn.textContent=el.state.value;el.mapStateBtn.disabled=false;el.mapStateBtn.classList.add("active");el.mapBrazilBtn.classList.remove("active");el.mapHint.textContent="Clique em um município para abrir o resultado local."}else{el.mapTitle.innerHTML=`Mapa do Brasil <em>— ${mode} por estado</em>`;el.mapStateBtn.textContent="Estado";el.mapStateBtn.disabled=true;el.mapStateBtn.classList.remove("active");el.mapBrazilBtn.classList.add("active");el.mapHint.textContent="Clique em um estado para detalhar por município."}}

async function loadMunicipalityConfig(){
  if(!app.context||app.context.unavailable)return;const key=`${app.context.cycle}-${app.context.election}`;if(app.municipalityConfigKey===key&&app.municipalityByIBGE.size)return;
  const data=await fetchJSON(buildUrl("municipalConfig"),{allow404:true}).catch(()=>null);app.municipalityByIBGE.clear();app.municipalityByTSE.clear();
  for(const abr of (data?.abr||[])){const uf=String(abr.cd||abr.sg||"").toUpperCase();for(const m of (abr.mu||[])){const item={uf,tse:pad(m.cd,5),ibge:String(m.cdi||m.cdmi||""),name:m.nm||""};if(item.ibge)app.municipalityByIBGE.set(item.ibge,item);app.municipalityByTSE.set(`${uf}:${item.tse}`,item)}}
  app.municipalityConfigKey=key;
}

async function fetchScopeResult(scopeUf="br"){
  const uf=String(scopeUf).toUpperCase(),cargo=effectiveCargo(uf);return fetchJSON(buildUrl("result",{uf:scopeUf,cargo}),{allow404:true}).catch(()=>null)
}
async function refreshBrazil(initial=false){
  const gen=app.requestGeneration;if(initial)setLoading(true,"Atualizando Brasil…","Consultando resultados por estado");app.currentScopeType="br";app.currentScopeLabel="Brasil";el.scopeBadge.textContent="Brasil";
  if(selectedOffice()==="1"){
    const raw=await fetchScopeResult("br");if(gen!==app.requestGeneration)return;app.currentRaw=raw;app.currentNormalized=normalizeResult(raw);renderSummary(raw);renderCandidates(raw,officeName(),"Brasil");if(app.currentNormalized?.updated)el.lastUpdate.textContent=app.currentNormalized.updated;
  }else{app.currentRaw=null;app.currentNormalized=null;renderSummary(null);renderCandidates(null,officeName(),"Brasil")}
  app.stateResults.clear();let done=0;
  await pool(STATES.map(s=>s[0]),5,async uf=>{if(gen!==app.requestGeneration)return;const raw=await fetchScopeResult(uf);if(raw)app.stateResults.set(uf,raw);done++;if(initial)el.loadingSubtext.textContent=`${done}/${STATES.length} estados`;app.stateLayer?.setStyle(stateStyle)});
  renderLegend([...app.stateResults.values()]);renderProjection();if(initial)setLoading(false);
}
async function refreshState(uf,initial=false){
  const gen=app.requestGeneration;const st=STATE_BY_UF[uf];app.currentScopeType="uf";app.currentScopeLabel=`${st.name}/${uf}`;el.scopeBadge.textContent=uf;if(initial)setLoading(true,`Atualizando ${st.name}…`,officeName());
  const raw=await fetchScopeResult(uf);if(gen!==app.requestGeneration)return;app.currentRaw=raw;app.currentNormalized=normalizeResult(raw);renderSummary(raw);renderCandidates(raw,officeName(),uf);if(app.currentNormalized?.updated)el.lastUpdate.textContent=app.currentNormalized.updated;renderProjection();if(initial)setLoading(false);
  if(isMajoritarian())backgroundLoadMunicipalResults(uf,gen).catch(console.error);else{el.mapHint.textContent="Clique em um município para consultar os votos. O mapa proporcional é carregado sob demanda."}
}

function trackerToUnit(a){const e=a?.e||{},s=a?.s||{};return {progress:num(s.pstn??s.pst),valid:0,blank:0,null:0,electorateTotal:num(e.te),electorateCounted:num(e.est),electorateRemaining:num(e.esnt),candidates:[]}}
async function backgroundLoadMunicipalResults(uf,gen){
  const token=++app.backgroundToken;await loadMunicipalityConfig();if(gen!==app.requestGeneration||token!==app.backgroundToken)return;let targets=[];
  if(app.context.format==="unified"){
    const tracker=await fetchJSON(buildUrl("trackerUF",{uf:uf.toLowerCase()}),{allow404:true}).catch(()=>null);app.trackerUnits.clear();
    for(const a of (tracker?.abr||[])){if(String(a.tpabr||"").toLowerCase()!=="mun")continue;const tse=pad(a.cd,5),m=app.municipalityByTSE.get(`${uf}:${tse}`);if(!m)continue;const stamp=`${a.dt||""}-${a.ht||""}`;app.trackerUnits.set(m.ibge,trackerToUnit(a));if(app.municipalStamps.get(m.ibge)!==stamp||!app.municipalResults.has(m.ibge)){app.municipalStamps.set(m.ibge,stamp);targets.push(m)}}
  }else if(!app.municipalResults.size){targets=[...app.municipalityByIBGE.values()].filter(m=>m.uf===uf)}
  if(!targets.length){renderProjection();restyleMap();return}
  let done=0;el.mapHint.textContent=`Carregando mapa municipal em segundo plano: 0/${targets.length}`;
  await pool(targets,6,async m=>{if(gen!==app.requestGeneration||token!==app.backgroundToken)return;const cargo=effectiveCargo(uf);const raw=await fetchJSON(buildUrl("municipality",{uf:uf.toLowerCase(),mun:m.tse,cargo}),{allow404:true}).catch(()=>null);if(raw)app.municipalResults.set(m.ibge,raw);done++;if(done%5===0||done===targets.length){el.mapHint.textContent=`Mapa municipal: ${done}/${targets.length} resultados carregados`;app.municipalityLayer?.setStyle(municipalityStyle);renderProjection()}});
  if(gen===app.requestGeneration&&token===app.backgroundToken){el.mapHint.textContent="Clique em um município para abrir o resultado local.";renderLegend([...app.municipalResults.values()]);renderProjection()}
}
async function selectMunicipality(ibge,name,layer){
  const uf=el.state.value;await loadMunicipalityConfig();let raw=app.municipalResults.get(String(ibge));const m=app.municipalityByIBGE.get(String(ibge));
  if(!raw&&m){setLoading(true,`Abrindo ${name}…`,`${uf} • ${officeName()}`);try{raw=await fetchJSON(buildUrl("municipality",{uf:uf.toLowerCase(),mun:m.tse,cargo:effectiveCargo(uf)}),{allow404:true});if(raw)app.municipalResults.set(String(ibge),raw)}finally{setLoading(false)}}
  app.currentRaw=raw;app.currentNormalized=normalizeResult(raw);app.currentScopeType="municipality";app.currentScopeLabel=`${name}/${uf}`;renderSummary(raw);renderCandidates(raw,officeName(),`${name}/${uf}`);renderProjection();if(layer){layer.bindPopup(popupHTML(`${name}/${uf}`,raw)).openPopup()}app.municipalityLayer?.setStyle(municipalityStyle);
}

async function pool(items,limit,fn){const q=[...items];const workers=Array.from({length:Math.min(limit,Math.max(1,q.length))},async()=>{while(q.length){const x=q.shift();await fn(x)}});await Promise.all(workers)}
function schedulePoll(){clearTimeout(app.pollTimer);if(selectedYear()!==2026||!app.context||app.context.unavailable)return;const base=num(el.refreshInterval.value,90000),delay=Math.max(30000,base+(Math.random()-.5)*CONFIG.pollJitterMs);app.pollTimer=setTimeout(async()=>{try{await refreshScope(false)}finally{schedulePoll()}},delay)}
async function refreshScope(initial=false){if(!app.context||app.context.unavailable)return;if(el.state.value)await refreshState(el.state.value,initial);else await refreshBrazil(initial)}

async function resetToBrazilGeometry(){app.backgroundToken++;app.municipalResults.clear();app.trackerUnits.clear();app.municipalStamps.clear();await loadStateGeometry();updateMapTitle()}
async function onStateChanged(){app.requestGeneration++;const uf=el.state.value;app.municipalResults.clear();app.trackerUnits.clear();app.municipalStamps.clear();app.backgroundToken++;if(!uf){el.backBtn.disabled=true;await resetToBrazilGeometry();await refreshBrazil(true)}else{el.backBtn.disabled=false;await loadMunicipalityGeometry(uf);await refreshState(uf,true)}schedulePoll()}
function syncTurnAvailability(){const option2=el.turn.querySelector('option[value="2"]');const restricted=["5","6","7"].includes(selectedOffice());option2.disabled=restricted;if(restricted&&el.turn.value==="2")el.turn.value="1"}
async function configure(){
  clearTimeout(app.pollTimer);app.requestGeneration++;const gen=app.requestGeneration;syncTurnAvailability();setModeHeader();resetData();setLoading(true,"Preparando eleição…",`${selectedYear()} • ${officeName()}`);setStatus("warn","Consultando TSE",selectedYear()===2022?"Carregando histórico":"Descobrindo eleição 2026");
  try{app.context=await resolveContext();if(gen!==app.requestGeneration)return;if(!app.context||app.context.unavailable){setStatus("warn","Fonte 2026 ainda indisponível",app.context?.config?`Configuração publicada: ${app.context.config.c||"—"}`:"O TSE ainda não publicou este ambiente/turno");el.technicalStatus.textContent="A interface está pronta e detectará a eleição quando a configuração for publicada.";await resetToBrazilGeometry();renderCandidates(null);return}
    app.municipalityConfigKey="";app.municipalityByIBGE.clear();app.municipalityByTSE.clear();setStatus(selectedYear()===2022?"warn":"live",app.context.label,`Eleição ${app.context.election} • ${app.context.cycle}`);el.technicalStatus.textContent=`${app.context.cycle} • eleição ${app.context.election} • cargo ${effectiveCargo()}`;await resetToBrazilGeometry();await refreshBrazil(true);schedulePoll();
  }catch(err){console.error(err);setStatus("warn","Falha ao consultar a fonte",err.message);el.technicalStatus.textContent=err.message}finally{setLoading(false)}
}

function focusPanel(target){document.querySelectorAll(".rail-item").forEach(x=>x.classList.remove("active"));const btn=document.querySelector(`.rail-item[data-target="${target}"]`);btn?.classList.add("active");const node=document.getElementById(target);if(target==="mapPanel"){node?.animate([{outline:"2px solid #36a7ff"},{outline:"0 solid transparent"}],{duration:700})}else node?.scrollIntoView({behavior:"smooth",block:"start"})}
function fitCurrentMap(){if(el.state.value&&app.municipalityLayer)app.map.fitBounds(app.municipalityLayer.getBounds(),{padding:[18,18]});else if(app.stateLayer)app.map.fitBounds(app.stateLayer.getBounds(),{padding:[18,18]})}

for(const [uf,name] of STATES){const o=document.createElement("option");o.value=uf;o.textContent=`${uf} — ${name}`;el.state.appendChild(o)}
initMap();

document.querySelectorAll(".rail-item[data-target]").forEach(btn=>btn.addEventListener("click",()=>focusPanel(btn.dataset.target)));
el.historyShortcut.addEventListener("click",()=>{el.year.value="2022";configure()});
el.methodologyBtn.addEventListener("click",()=>el.methodologyDialog.showModal());
el.refreshBtn.addEventListener("click",()=>refreshScope(true).catch(console.error));
el.backBtn.addEventListener("click",()=>{el.state.value="";onStateChanged().catch(console.error)});
el.mapBrazilBtn.addEventListener("click",()=>{el.state.value="";onStateChanged().catch(console.error)});
el.mapStateBtn.addEventListener("click",fitCurrentMap);el.mapFitBtn.addEventListener("click",fitCurrentMap);
el.state.addEventListener("change",()=>onStateChanged().catch(console.error));
el.layerMode.addEventListener("change",restyleMap);el.projectionThreshold.addEventListener("change",renderProjection);el.refreshInterval.addEventListener("change",schedulePoll);
el.year.addEventListener("change",configure);el.environment.addEventListener("change",configure);el.turn.addEventListener("change",configure);el.office.addEventListener("change",configure);

configure();
