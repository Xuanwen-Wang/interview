'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; };
const sectionTitle = title => title.replace(/^\d+(?:\.\s*|\s*\/\s*)/, '');
const STORE_KEY = 'interview-field-notes-v1';
const emptyState = () => ({readingVersion:2,read:[],legacyRead:[],notes:{},practice:{},last:null});
function normalizeState(raw) {
 const value=raw && typeof raw==='object'?raw:{};
 const known=new Set(CHAPTERS.map(c=>c.id));
 const merged=CHAPTERS.filter(c=>c.legacyChapters);
 const legacyIds=new Set(merged.flatMap(c=>Object.keys(c.legacyChapters)));
 const noteKeys=new Set([...known,...merged.flatMap(c=>Object.entries(c.legacyChapters).map(([id,old])=>old.noteKey||id))]);
 const dict=(v,valid)=>Object.fromEntries(Object.entries(v&&typeof v==='object'&&!Array.isArray(v)?v:{}).filter(([k,x])=>valid(k,x)));
 const oldRead=Array.isArray(value.read)?value.read:[];
 let read=oldRead.filter(id=>known.has(id));
 const notes=dict(value.notes,(k,v)=>(noteKeys.has(k)||legacyIds.has(k))&&typeof v==='string');
 let legacyRead=(Array.isArray(value.legacyRead)?value.legacyRead:[]).filter(id=>legacyIds.has(id));
 if (value.readingVersion!==2) {
   legacyRead=[...new Set([...legacyRead,...oldRead.filter(id=>legacyIds.has(id))])];
   read=read.filter(id=>!legacyIds.has(id));
   for(const c of merged)for(const [id,old] of Object.entries(c.legacyChapters))if(old.noteKey&&old.noteKey!==id&&notes[id]!==undefined){notes[old.noteKey]=notes[id];delete notes[id];}
 }
 const practice=dict(value.practice,(k,v)=>['good','weak'].includes(v));
 for(const c of CHAPTERS)for(const q of c.questions){const key=c.id+':'+(q.id||q.q);if(practice[key]===undefined){const prior=(q.legacyKeys||[]).map(k=>practice[k]);if(prior.includes('weak'))practice[key]='weak';else if(prior.includes('good'))practice[key]='good';}}
 const last=chapterAliases.get(value.last)?.chapter||value.last;
 return {readingVersion:2,read:[...new Set(read)],legacyRead,notes,practice,last:known.has(last)?last:null};
}
function readStorage(){
 try {
  const raw=localStorage.getItem(STORE_KEY)||'{}',value=JSON.parse(raw);
  if(value.readingVersion!==2&&CHAPTERS.some(c=>c.legacyChapters&&Object.keys(c.legacyChapters).some(id=>value.notes?.[id]||(Array.isArray(value.read)&&value.read.includes(id))))){
   try{if(!localStorage.getItem(STORE_KEY+'-before-pe-merge'))localStorage.setItem(STORE_KEY+'-before-pe-merge',raw);}catch{}
  }
  return normalizeState(value);
 }catch{return emptyState();}
}
let state=readStorage(), stateBase=JSON.parse(JSON.stringify(state));
let toastTimer, sectionObserver, practiceTimer, elapsed = 0, renderedChapterId = null;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2200); }
function mergePending(merged) {
  for(const id of CHAPTERS.map(c=>c.id))if(state.read.includes(id)!==stateBase.read.includes(id))merged.read=state.read.includes(id)?[...new Set([...merged.read,id])]:merged.read.filter(x=>x!==id);
  for(const field of ['notes','practice'])for(const key of new Set([...Object.keys(state[field]),...Object.keys(stateBase[field])]))if(state[field][key]!==stateBase[field][key]){if(state[field][key]===undefined)delete merged[field][key];else merged[field][key]=state[field][key];}
  if(state.last!==stateBase.last)merged.last=state.last;
  merged.legacyRead=[...new Set([...merged.legacyRead,...state.legacyRead])];
  return merged;
}
function save() {
 try {
  const merged=mergePending(readStorage());
  localStorage.setItem(STORE_KEY,JSON.stringify(merged));state=merged;stateBase=JSON.parse(JSON.stringify(state));
 }catch{toast('浏览器未允许保存，请导出笔记备份。');}
}
const questions = CHAPTERS.flatMap(c => c.questions.map(q => ({...q, chapter: c.id, title: c.title, part: c.part, key: c.id + ':' + (q.id || q.q)})));
const sources = CHAPTERS.flatMap(c => c.sources.map(s => ({...s, chapter: c.id, chapterTitle: c.title})));
const searchIndex = CHAPTERS.flatMap(c => [{chapter: c.id, title: c.title, subtitle: c.part, body: c.lead + ' ' + c.tags.join(' '), link: '#chapter/' + c.id}, ...c.sections.map(s => ({chapter:c.id,title:s.title,subtitle:c.title,body:plain(s.html),link:'#chapter/'+c.id+'/'+s.id})), ...c.questions.map(q => ({chapter:c.id,title:q.q,subtitle:'面试追问 · '+c.title,body:q.a+' '+q.followup,link:'#chapter/'+c.id+'/questions'}))]).concat(jobSearchEntries());
function progress() {
 const n = CHAPTERS.filter(c => state.read.includes(c.id)).length;
 $('#progress-value').textContent = Math.round(n / CHAPTERS.length * 100) + '%';
 $('#progress-bar').style.width = (n / CHAPTERS.length * 100) + '%';
 $$('#chapter-nav a').forEach(a => a.classList.toggle('read', state.read.includes(a.dataset.chapter)));
}
function nav(){const [route,id]=currentRoute();renderNavigation(route,id);}
function heroArt() { return `<div class="hero-art"><svg viewBox="0 0 490 346" role="img" aria-label="从模型语义经编译IR、资源调度到芯片执行的四层映射图">
<defs><marker id="hero-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#7d9772"/></marker></defs>
<g fill="none" stroke="#ccd6c4"><path d="M42 55H445M42 126H445M42 197H445M42 268H445" stroke-dasharray="3 5"/></g>
<g font-family="monospace" font-size="8" fill="#799073"><text x="23" y="44">01 / SEMANTICS</text><text x="23" y="115">02 / LOWERING</text><text x="23" y="186">03 / SCHEDULING</text><text x="23" y="257">04 / EXECUTION</text></g>
<g stroke="#829b75" stroke-width="1.1" fill="none" marker-end="url(#hero-arrow)"><path d="M245 76V130"/><path d="M245 152V201"/><path d="M245 221V270"/><path d="M151 218L117 269"/><path d="M337 218L371 269"/></g>
<g transform="translate(112 48)"><rect width="264" height="43" rx="4" fill="#fafaf2" stroke="#acbba2"/><text x="132" y="27" text-anchor="middle" font-size="13" fill="#354d31">Attention  ×  MoE  ×  State</text><circle cx="246" cy="10" r="3" fill="#b88b59"/></g>
<g transform="translate(127 123)"><rect width="235" height="37" rx="4" fill="#dae4d0" stroke="#9fb18e"/><text x="117" y="24" text-anchor="middle" font-size="12" fill="#3f5935">Triton → IR → Zeus</text></g>
<g transform="translate(95 196)"><rect width="300" height="38" rx="4" fill="#c3d3b4" stroke="#7d9868"/><text x="150" y="25" text-anchor="middle" font-size="12" fill="#324e2a">依赖 · 调度 · 地址 · 同步</text></g>
<g transform="translate(67 271)"><rect width="356" height="48" rx="4" fill="#244a38"/><g fill="#d2dfbe" font-family="monospace" font-size="11"><text x="51" y="29">PE</text><text x="132" y="29">VP</text><text x="219" y="29">DT</text><text x="303" y="29">CT</text></g><g stroke="#577b56"><path d="M91 9V39M177 9V39M265 9V39"/></g></g>
<path d="M410 65h24v224h-10" fill="none" stroke="#c27c4d" stroke-dasharray="4 4"/><text x="454" y="190" font-family="monospace" font-size="8" fill="#b07951" transform="rotate(90 454 190)">EVIDENCE / FEEDBACK</text></svg><div class="art-caption">FIG. 01 — ONE WORKLOAD, FOUR LEVELS OF REASONING</div></div>`; }
function card(c) { const context=chapterContext(c.id); const i=(context.module?moduleChapters(context.module):CHAPTERS).indexOf(c); return `<a class="chapter-card" href="#chapter/${c.id}"><div class="card-top"><b>${String(i+1).padStart(2,'0')} / ${esc(c.level)}</b><span>${c.minutes} MIN</span></div><h3>${esc(c.title)}</h3><p>${esc(c.subtitle)}</p><div class="card-foot"><span>${esc(c.tags.slice(0,2).join(' · '))}</span><span>${state.read.includes(c.id)?'已读 ✓':'开始阅读 ↗'}</span></div></a>`; }
function renderHome(){renderKnowledgeHome();}
function sourceUrl(s) { if (/^https?:\/\//.test(s.url)) return s.url; if (!s.url || s.url.startsWith('#')) return 'https://github.com/Xuanwen-Wang/interview/blob/main/'+(s.url?.slice(1)||'evidence/README.md'); return 'https://github.com/Xuanwen-Wang/interview/blob/main/'+s.url.replace(/^\.\//,''); }
function sourceHTML(s) { return `<a href="${esc(sourceUrl(s))}" target="_blank" rel="noreferrer">${esc(s.label)} ↗</a><small>${esc(s.kind)} · ${esc(s.note || '')}</small>`; }
function renderChapter(id, section) {
 const c = CHAPTERS.find(c=>c.id===id);
 if (!c) { renderNotFound(); return; }
 renderedChapterId=id;state.last = id; save(); const context=chapterContext(id);const sequence=context.module?moduleChapters(context.module):CHAPTERS;const index=sequence.indexOf(c);
 $('#main').innerHTML=`<div class="eyebrow">${esc(context.module?.title||c.part)} / ${esc(context.group?.title||'CHAPTER')}</div><h1 class="page-title">${esc(c.title)}</h1><p class="page-lead">${esc(c.lead)}</p><div class="chapter-meta"><span>${c.minutes} 分钟 · ${esc(c.level)}</span><span>${c.sections.length} 节 · ${c.questions.length} 个追问</span></div><div>${c.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${readingPathHTML(c)}<div class="chapter-layout ${c.readingStages?'longform-chapter':''}"><article class="article">${chapterSectionsHTML(c)}<section id="takeaways"><div class="takeaways"><h3>读完这一章，应该能讲清楚</h3><ul>${c.takeaways.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div></section><section id="questions"><h2>面试官继续追问</h2>${c.questions.map(q=>`<details class="qa"><summary>${esc(q.q)}</summary><div>${esc(q.a).replace(/\n/g,'<br>')}<div class="followup"><strong>再追一层：</strong>${esc(q.followup)}</div></div></details>`).join('')}</section><section id="references"><h2>来源与证据范围</h2><p class="small muted">来源状态以采集时刻为准；原始仓库的访问权限独立于本指南。教学推导与历史实测在正文中分别标注。</p><ul class="source-list">${c.sources.map(s=>`<li>${sourceHTML(s)}</li>`).join('')}</ul></section><section id="notes"><h2>用自己的话再讲一遍</h2><textarea class="note-textarea" id="chapter-note" aria-label="本章个人笔记" placeholder="尝试写下：这个问题的核心约束是什么？我的方案为什么成立？如果条件改变呢？">${esc(state.notes[id]||'')}</textarea><p class="note-hint">自动保存到当前浏览器，不上传服务器。可在“个人笔记与备份”导出。</p>${legacyNotesHTML(c)}<button id="read-main">${state.read.includes(id)?'已完成本章 ✓ · 取消标记':'标记本章已读 ✓'}</button></section><div class="chapter-bottom">${index>0?`<a href="#chapter/${sequence[index-1].id}"><small>PREVIOUS</small>← ${esc(sequence[index-1].title)}</a>`:'<a href="#home">← 知识地图</a>'}${index<sequence.length-1?`<a href="#chapter/${sequence[index+1].id}"><small>NEXT</small>${esc(sequence[index+1].title)} →</a>`:'<a href="#practice">进入面试练习 →</a>'}</div></article><aside class="toc"><div class="toc-title">IN THIS CHAPTER</div>${chapterTocHTML(c,section)}<a href="#chapter/${id}/questions">面试追问</a><a href="#chapter/${id}/references">来源与证据</a><a href="#chapter/${id}/notes">我的笔记</a><button class="read-toggle" id="read-toggle">${state.read.includes(id)?'已完成 ✓':'标记已读'}</button></aside></div>`;
 $$('.article table').forEach(t=>{const w=document.createElement('div');w.className='table-wrap';t.before(w);w.append(t);});
 $$('.article a').forEach(a=>{ const href=a.getAttribute('href')||''; if(href && !/^(https?:|#)/.test(href)) a.href=sourceUrl({url:href}); if (/^https?:/.test(a.getAttribute('href'))) { a.target='_blank'; a.rel='noreferrer'; } });
 $('#chapter-note').oninput=e=>{state.notes[id]=e.target.value;save();};
 $$('[data-note]').forEach(el=>el.oninput=()=>{state.notes[el.dataset.note]=el.value;save();});
 function toggleRead(){state.read=state.read.includes(id)?state.read.filter(x=>x!==id):[...state.read,id];save();progress();$('#read-toggle').textContent=state.read.includes(id)?'已完成 ✓':'标记已读';$('#read-main').textContent=state.read.includes(id)?'已完成本章 ✓ · 取消标记':'标记本章已读 ✓';}
 $('#read-toggle').onclick=toggleRead;$('#read-main').onclick=toggleRead;
 if('IntersectionObserver' in window){sectionObserver=new IntersectionObserver(entries=>{entries.filter(e=>e.isIntersecting).forEach(e=>{highlightReadingSection(e.target.id);});},{rootMargin:'-90px 0px -65% 0px'});$$('section[data-section]').forEach(s=>sectionObserver.observe(s));}
 initPeExplorers();
 enableFigureZoom();
 if(section)scrollChapterAnchor(section);
}
function renderNotFound(){ $('#main').innerHTML='<div class="eyebrow">404 / KNOWLEDGE MAP</div><h1 class="page-title">这一页没有找到</h1><p>章节可能已调整。回到知识地图，或搜索你想找的概念。</p><a class="primary" href="#home">回到知识地图 →</a>'; }
function lineChart(series, label, xLabel='并发 / Batch'){
 const W=650,H=310,L=58,R=20,T=25,B=43; const xmax=Math.max(...series.flatMap(s=>s.points.map(p=>p[0]))), rawMax=Math.max(...series.flatMap(s=>s.points.map(p=>p[1]))), ymax=Math.max(rawMax*1.12,.01);
 const x=v=>L+v/xmax*(W-L-R),y=v=>H-B-v/ymax*(H-T-B);
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}（教学建模，不是实测）">${[0,.25,.5,.75,1].map(t=>`<line x1="${L}" y1="${y(ymax*t)}" x2="${W-R}" y2="${y(ymax*t)}" stroke="#dde2d5"/><text x="${L-9}" y="${y(ymax*t)+4}" text-anchor="end" fill="#798876" font-size="10">${(ymax*t).toFixed(ymax<10?2:0)}</text>`).join('')}${[0,.25,.5,.75,1].map(t=>`<text x="${x(xmax*t)}" y="${H-B+22}" text-anchor="middle" font-size="10" fill="#798876">${Math.round(xmax*t)}</text>`).join('')}${series.map(s=>`<polyline points="${s.points.map(p=>x(p[0])+','+y(p[1])).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.4"/>`).join('')}<text x="${L}" y="13" font-size="10" fill="#687c64">${esc(label)}</text><text x="${W-R}" y="${H-2}" font-size="10" text-anchor="end" fill="#687c64">${esc(xLabel)}</text></svg>`;
}
function renderLab(){
 $('#main').innerHTML=`<div class="eyebrow">INTERACTIVE ARCHITECTURE LAB</div><h1 class="page-title">把硬件直觉，变成可解释的曲线。</h1><p class="page-lead">改变参数，观察瓶颈如何移动。所有曲线都是可复算的教学模型，参数不代表 518 或 NVIDIA 的真实规格，也不用于宣称产品优劣。</p><div class="route-tabs" id="lab-tabs"><button data-lab="roofline" class="active">01 / 并发与性能</button><button data-lab="kv">02 / KV 容量墙</button><button data-lab="topology">03 / TP × EP</button></div><div id="lab-body"></div>`;
 $$('#lab-tabs button').forEach(b=>b.onclick=()=>{$$('#lab-tabs button').forEach(x=>x.classList.toggle('active',x===b));renderExperiment(b.dataset.lab);});renderExperiment('roofline');
}
function slider(id,label,min,max,value,step=1,unit=''){return `<label class="control"><span>${label}<output id="${id}-out">${value}${unit}</output></span><input type="range" id="${id}" min="${min}" max="${max}" value="${value}" step="${step}" data-unit="${unit}"></label>`;}
function bindRanges(fn){$$('#lab-body input[type=range]').forEach(el=>el.oninput=()=>{$('#'+el.id+'-out').textContent=el.value+el.dataset.unit;fn();});fn();}
function renderExperiment(kind){
 const body=$('#lab-body');
 if(kind==='roofline'){
 body.innerHTML=`<div class="lab-layout"><div class="lab-controls">${slider('weight','每次迭代共享权重流量',16,512,128,8,' MB')}${slider('ops','每个 token 计算量',.5,12,2,.5,' GFLOPs')}${slider('bandwidth','有效外存带宽',.2,4,1.6,.1,' TB/s')}${slider('compute','有效峰值计算吞吐',10,400,80,10,' TFLOP/s')}${slider('saturation','达到计算平台的并发参数',1,64,8,1)}${slider('overhead','固定开销',0,100,12,2,' μs')}<p class="small muted">隔离权重复用与计算利用率的玩具模型。未含 KV、通信、专家不均衡、排队与功率限制。</p></div><div class="lab-output"><div class="chart" id="roofline-chart"></div><div class="lab-stats" id="roofline-stats"></div><div class="chart" id="throughput-chart"></div><p class="lab-explanation">当计算量随 batch 增加，而权重只读取一次，单 token 成本可能下降。但如果进入计算上限，总吞吐逐渐趋于平台。实际 GPU 也会同时获得权重复用与并行度收益；518 也受利用率影响，不能把两种收益独占地分配给两类硬件。</p><div class="lab-formula">u(B) = min(1, 0.25 + 0.75 × B / B_sat)<br>t_compute = B × FLOPs_token / (P × u(B))<br>t_memory = weight_bytes / BW<br>t_step = t_fixed + max(t_compute, t_memory)<br>throughput = B / t_step</div></div></div>`;
 bindRanges(()=>{const w=+$('#weight').value,f=+$('#ops').value,bw=+$('#bandwidth').value,p=+$('#compute').value,sat=+$('#saturation').value,o=+$('#overhead').value;const pts=Array.from({length:64},(_,i)=>{const b=i+1,compute=b*f/(p*Math.min(1,.25+.75*b/sat)),memory=w/bw/1000,total=o/1000+Math.max(compute,memory);return {b,compute,memory,total,tps:b/total*1000};});$('#roofline-chart').innerHTML=lineChart([{color:'#315c4c',points:pts.map(x=>[x.b,x.total])},{color:'#c45c37',points:pts.map(x=>[x.b,x.compute])},{color:'#b79b70',points:pts.map(x=>[x.b,x.memory])}],'迭代延时 / ms')+'<div class="chart-legend"><span>迭代延时</span><span>计算时间下界</span><span>权重访存时间下界</span></div>';$('#throughput-chart').innerHTML=lineChart([{color:'#315c4c',points:pts.map(x=>[x.b,x.tps])}],'吞吐 / token/s');const crossover=pts.find(x=>x.compute>=x.memory);$('#roofline-stats').innerHTML=`<div class="lab-stat"><strong>${pts[0].total.toFixed(3)}</strong><span>B=1 延时 / ms</span></div><div class="lab-stat"><strong>${crossover?crossover.b:'>64'}</strong><span>计算下界首次 ≥ 访存下界</span></div><div class="lab-stat"><strong>${Math.round(pts[63].tps).toLocaleString()}</strong><span>B=64 token/s · 建模</span></div>`;});
 }else if(kind==='kv'){
 body.innerHTML=`<div class="lab-layout"><div class="lab-controls">${slider('kv-layers','Attention 层数',1,100,32)}${slider('kv-heads','每层 KV heads',1,64,8)}${slider('kv-dim','每个 KV head 维度',32,256,128,32)}${slider('kv-length','上下文长度',1024,131072,32768,1024)}${slider('kv-bytes','每个元素字节数',1,4,2)}${slider('kv-memory','可供 KV 使用的显存',1,128,40,1,' GiB')}<p class="small muted">假设 K/V 的 D 相同；逻辑总缓存口径，无 TP 分片。已从显存预算中扣除权重和运行时空间；未计算碎片、分页元数据、前缀共享。</p></div><div class="lab-output"><div class="chart" id="kv-chart"></div><div class="lab-stats" id="kv-stats"></div><div class="callout">这里计算的是标准 MHA/GQA/MQA 的 K+V 缓存，不能直接套到 MLA 压缩 latent 或 KDA 的递归状态。混合模型必须按层类型分别求和。</div><div class="lab-formula">KV_bytes/request = 2 × L × H_kv × D × S × bytes<br>capacity_B = floor(available_bytes / KV_bytes/request)</div><p class="lab-explanation">GQA 降低 KV head 数，减小每条请求的缓存与逻辑读流量。PagedAttention 解决的是分配与碎片，通常不改变每个有效 token 的逻辑 KV 元素数。稀疏 Attention 减少每步读取的子集，也不自动意味着所有历史 KV 都可以丢弃。</p></div></div>`;
 bindRanges(()=>{const L=+$('#kv-layers').value,h=+$('#kv-heads').value,d=+$('#kv-dim').value,s=+$('#kv-length').value,b=+$('#kv-bytes').value,m=+$('#kv-memory').value;const per=2*L*h*d*s*b/2**30,cap=Math.floor(m/per),axis=Math.max(16,Math.min(512,Math.ceil(cap*1.25)));$('#kv-chart').innerHTML=lineChart([{color:'#315c4c',points:Array.from({length:65},(_,i)=>[i*axis/64,i*axis/64*per])},{color:'#c45c37',points:[[0,m],[axis,m]]}],'KV 容量 / GiB')+'<div class="chart-legend"><span>KV 占用</span><span>可用容量</span></div>';$('#kv-stats').innerHTML=`<div class="lab-stat"><strong>${per<.01?per.toPrecision(2):per.toFixed(2)}</strong><span>每条请求 / GiB</span></div><div class="lab-stat"><strong>${cap}</strong><span>容量允许的最大并发</span></div><div class="lab-stat"><strong>${(per*1024).toFixed(0)}</strong><span>完整逻辑 KV 扫描 / MiB</span></div>`;});
 }else{
 body.innerHTML=`<div class="lab-layout"><div class="lab-controls"><label class="control"><span>选择 rank</span><select id="rank-select">${Array.from({length:16},(_,i)=>`<option value="${i}">rank ${i}</option>`).join('')}</select></label><p class="small muted">来自内部 GLM5Next 300B 开发配置：TP4 × EP4、world_size=16。这是逻辑 rank 分组，不能仅由此推断物理封装。</p></div><div class="lab-output"><div class="rank-grid" id="rank-grid"></div><div id="rank-detail"></div><div class="flow"><div>Router<br>全局 expert IDs</div><b>→</b><div>每 EP 72 experts<br>各 expert 再 TP4</div><b>→</b><div>rank-local partial</div><b>→</b><div>TP / EP collectives</div></div><p class="lab-explanation">Shared 的真实权重 ownership 与 kernel 是否执行是两件事：当前开发路径可在非 EP0 上运行零权重占位。最终合成仍须沿实际通信代码追踪；仅计四类本地算子不是完整 MoE 延时。<a class="text-link" href="#chapter/moe-topology">核对拓扑与来源 →</a></p></div></div>`;
 const update=()=>{const rank=+$('#rank-select').value,tp=rank%4,ep=Math.floor(rank/4);$('#rank-grid').innerHTML=Array.from({length:16},(_,i)=>`<button class="rank ${i===rank?'selected':''}" data-rank="${i}">rank ${i}<br>EP${Math.floor(i/4)} · TP${i%4}</button>`).join('');$('#rank-detail').innerHTML=`<div class="lab-stats"><div class="lab-stat"><strong>EP ${ep}</strong><span>experts ${ep*72}–${ep*72+71}</span></div><div class="lab-stat"><strong>TP ${tp}</strong><span>I_local = 2048 / 4 = 512</span></div><div class="lab-stat"><strong>${tp}, ${tp+4}, ${tp+8}, ${tp+12}</strong><span>跨 EP 同一 TP lane</span></div></div><p class="small muted">所在 TP group：${[0,1,2,3].map(x=>ep*4+x).join(', ')}。Shared 真实权重：${ep===0?'本 EP 持有该 TP shard':'本 EP 不持有（开发路径可有零权重占位）'}。</p>`;$$('[data-rank]').forEach(b=>b.onclick=()=>{$('#rank-select').value=b.dataset.rank;update();});};$('#rank-select').onchange=update;update();
 }
}
let activeQuestion=null, questionPool=questions, refreshQuestionPool=()=>{};
function renderPractice(){
 $('#main').innerHTML=`<div class="eyebrow">REHEARSE THE REASONING</div><h1 class="page-title">先说出来，再看答案。</h1><p class="page-lead">用两分钟组织第一层回答：问题是什么、关键约束是什么、为什么这样做。展开答案后，再尝试回答“再追一层”。这里的答案是表达骨架，不替代你自己的项目证据。</p><div class="practice-tools"><select id="question-part" aria-label="筛选面试问题领域"><option value="all">全部领域 · ${questions.length} 题</option>${MODULES.map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join('')}</select><button id="draw-question" class="primary">抽一道题 ↻</button><button id="weak-only">只练待巩固</button><span class="timer" id="timer">00:00</span><button id="timer-toggle">开始计时</button></div><div id="practice-body"></div>`;
 let weak=false;
 refreshQuestionPool=()=>{questionPool=questions.filter(q=>($('#question-part').value==='all'||chapterContext(q.chapter).module?.id===$('#question-part').value)&&(!weak||state.practice[q.key]==='weak'));};
 const filter=()=>{refreshQuestionPool();draw();};
 $('#question-part').onchange=filter;$('#draw-question').onclick=draw;$('#weak-only').onclick=()=>{weak=!weak;$('#weak-only').textContent=weak?'正在练待巩固 ✓':'只练待巩固';filter();};
 $('#timer-toggle').onclick=()=>{if(practiceTimer){clearInterval(practiceTimer);practiceTimer=null;$('#timer-toggle').textContent='继续计时';}else{practiceTimer=setInterval(()=>{elapsed++;$('#timer').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');},1000);$('#timer-toggle').textContent='暂停';}};filter();
}
function draw(){
 refreshQuestionPool();
 clearInterval(practiceTimer);practiceTimer=null;elapsed=0;$('#timer').textContent='00:00';$('#timer-toggle').textContent='开始计时';
 if(!questionPool.length){$('#practice-body').innerHTML='<div class="empty">这个筛选下没有问题。可以在答案下方标记“需要巩固”，再回来练习。</div>';activeQuestion=null;return;}
 let pool=questionPool.length>1?questionPool.filter(q=>q.key!==activeQuestion?.key):questionPool;activeQuestion=pool[Math.floor(Math.random()*pool.length)];const q=activeQuestion;
 $('#practice-body').innerHTML=`<div class="practice-card"><span class="tag">${esc(q.part)}</span><div class="eyebrow">${esc(q.title)}</div><h2>${esc(q.q)}</h2><p class="small muted">试着画图、写公式，或者说出一个真实的反例。</p><button id="reveal-answer">展开参考答案 ↓</button><div class="practice-answer" id="practice-answer" hidden>${esc(q.a).replace(/\n/g,'<br>')}<div class="callout"><strong>再追一层：</strong>${esc(q.followup)}</div><div class="note-actions"><button id="mark-good">我能讲清楚 ✓</button><button id="mark-weak">需要巩固</button><a href="#chapter/${q.chapter}/questions" class="text-link">回到原章 ↗</a></div></div></div>`;
 $('#reveal-answer').onclick=()=>{$('#practice-answer').hidden=false;$('#reveal-answer').hidden=true;};$('#mark-good').onclick=()=>{state.practice[q.key]='good';save();toast('已记录：能讲清楚');};$('#mark-weak').onclick=()=>{state.practice[q.key]='weak';save();toast('已加入待巩固问题');};
}
function renderSources(){
 $('#main').innerHTML=`<div class="eyebrow">TRACE EVERY CLAIM</div><h1 class="page-title">证据，比漂亮的数字更重要。</h1><p class="page-lead">论文解释算法，源码说明实现，实验记录描述观测。三者相互支持，但不能相互替代。下列来源按章节保留上下文；同一原始来源可能在多个章节出现。</p><div class="callout"><strong>五种证据层级：</strong>算法推导 → 当前源码 → 功能回放 → CycleSim / VCS → 硅上端到端。上一层通过，不自动证明下一层通过。历史性能记录也不等于本次重新测试。</div><div class="source-filter"><input id="source-search" type="search" aria-label="搜索来源" placeholder="搜索论文、PR、源码路径、版本…"><select id="source-kind" aria-label="来源类型"><option value="all">全部证据类型</option>${[...new Set(sources.map(s=>s.kind))].map(k=>`<option>${esc(k)}</option>`).join('')}</select></div><p id="source-count" class="small muted"></p><div id="source-items"></div>`;
 const update=()=>{const term=$('#source-search').value.toLowerCase(),kind=$('#source-kind').value;const list=sources.filter(s=>(kind==='all'||s.kind===kind)&&[s.label,s.note,s.url,s.chapterTitle].join(' ').toLowerCase().includes(term));$('#source-count').textContent=list.length+' 条带章节语境的来源';$('#source-items').innerHTML=list.map(s=>`<div class="source-card"><span class="tag">${esc(s.kind)}</span> ${sourceHTML(s)}<p>${esc(s.url)}</p><a href="#chapter/${s.chapter}/references" style="font-size:11px">返回章节：${esc(s.chapterTitle)} →</a></div>`).join('')||'<div class="empty">没有匹配来源。</div>';};$('#source-search').oninput=update;$('#source-kind').onchange=update;update();
}
const GLOSSARY=[
['ABI','Application Binary Interface。调用参数、地址空间、布局、描述符、状态格式与符号约定组成跨层契约；张量数值相同不代表 ABI 相同。'],['Arithmetic intensity','算术强度：运算次数除以指定层级的传输字节数。必须说明是 DRAM、L2 还是片上 SRAM。'],['Alias','别名：不同 SSA 值或指针可能指向同一物理存储；依赖分析必须考虑重叠区间和读写方式。'],['AllGather','把各 rank 的分片收集为每个参与 rank 上的完整结果。'],['AllReduce','在参与 rank 之间归约，并把归约结果分发给所有 rank。'],['AllToAll','每个 rank 向其他 rank 发送各自不同的数据分片。MoE dispatch/combine 常用，但具体实现必须查模型路径。'],['Autotuning','在合法性与精度约束下搜索 tile、并行度、布局和流水参数，防止仅针对少量 shape 过拟合。'],['BF16','8 位指数、7 位显式尾数的浮点格式。指数范围接近 FP32，但表示间隔更大；舍入边界对参考验证很重要。'],['BReg','Zeus 描述符相关寄存器资源。逻辑描述符、物理寄存器与配置指令不可混为同一层对象。'],['CFG','Control Flow Graph。基本块及可能控制转移构成的图；循环、分支对同步和生命周期提出额外约束。'],['Critical path','依赖图中约束总完成时间的最长链；降低非关键路径的成本不一定降低总延时。'],['CT','控制执行单元。具体能力和排序语义以本项目 IR、ISA 与硬件实现为准。'],['Decode','已有历史状态下逐步生成新 token 的阶段。标准自回归一般每条活跃序列每次产生一个 token。'],['DMA','直接内存访问。显式搬运需要给出地址、大小、步长、对齐与完成/可见性约定。'],['DP / TP / EP','数据并行／张量并行／专家并行。分组可以复用同一 world 中的不同维度，不能机械地将配置数字全部相乘。'],['DSA','DeepSeek Sparse Attention。通过索引选择相关历史位置，减少重 Attention 的工作集；索引与缓存维护仍有成本。'],['DT','数据传输相关执行单元。吞吐、在途数、队列与同步共同影响流水性能。'],['FlashAttention','以分块和在线 softmax 减少中间矩阵的存储读写；它不等于稀疏 Attention。'],['FP8','8 位浮点格式家族。需要同时说明 E4M3/E5M2、scale 粒度、累加格式、饱和及布局。'],['Fusion','算子融合。可能减少中间数据与启动开销，也可能提高 SRAM/寄存器压力并降低并发。'],['GQA','Grouped-Query Attention。多个 Q heads 共享一组 K/V heads，在 MHA 与 MQA 之间折中。'],['Graph replay','回放已捕获的执行图。需要验证指针、动态输入、状态写回和缓存失效，而非只验证一次 eager。'],['HBM','高带宽内存。理论带宽、有效带宽与容量是不同约束。'],['IR','Intermediate Representation。不同层级逐步表达算法、存储布局、资源映射和指令约束。'],['ISA','Instruction Set Architecture。软件与硬件之间对指令行为、异常、排序和可见性的契约。'],['KDA','Kimi Delta Attention。带细粒度门控的递归状态更新路线；内部模型使用的版本和 ABI 需独立核验。'],['KV cache','缓存历史 key/value 或模型特定压缩表示以避免重新投影。缓存并不意味着不用再读历史状态。'],['Launch overhead','启动内核所需的固定开销。小算子、低 batch 时可能显著，需区分 host 与设备侧计时。'],['Liveness','活跃性：值在某点之后还会被使用。异步硬件必须再考虑未完成的实际访问。'],['MLA','Multi-head Latent Attention。缓存压缩 latent，并通过相应变换恢复或吸收部分计算；不是简单减少 KV heads。'],['MLIR','多层 IR 基础设施，提供 dialect、operation、type、region、rewrite、pass 等组织机制，不自动解决目标硬件映射。'],['MoE','Mixture of Experts。输入经 router 选择专家，稀疏激活降低每个 token 的算术量，同时引入路由、不规则负载和通信。'],['Occupancy','GPU 上活跃 warps 与硬件可支持最大活跃 warps 的比值。它不等同于 SM 覆盖率、ALU 利用率或性能。'],['PagedAttention','将逻辑 KV block 映射到物理存储 block，提高内存管理效率；与数学上的稀疏 Attention 不同。'],['PE','518 的矩阵/张量计算相关执行资源。不要仅凭名称把它等同于 GPU SM。'],['Prefill','处理输入序列并建立各层缓存或状态的阶段，常具有更大的 token 维和不同并行策略。'],['RAW / WAR / WAW','写后读／读后写／写后写依赖。物理地址复用可能在无 SSA 数据边时新增 WAR/WAW。'],['Reduce-scatter','先进行跨 rank 归约，再把结果的不同片段分发到不同 rank。'],['Register allocation','把虚拟寄存器映射到有限物理寄存器；spill、配置重放和真实硬件依赖需保持一致。'],['Roofline','把计算吞吐上限与带宽 × 算术强度联系起来的性能上界模型，不是完整延时预测器。'],['SIMD / SIMT','单指令多数据／单指令多线程。SIMT 提供线程抽象，底层仍按硬件执行组与调度规则执行。'],['SSA','Static Single Assignment。每个值定义一次，简化数据流分析；内存副作用仍需额外建模。'],['SRAM allocation','片上缓冲区分配，受容量、布局、bank、对齐、生命周期与在途访问约束。'],['SwiGLU','SiLU(gate projection) 与 up projection 逐元素相乘，再经 down projection。'],['Tiling','把大计算划成适合片上资源的块。tile 影响复用、边界、并行度与流水深度。'],['TPOT / TTFT','每个输出 token 的时间／首 token 时间。要分别说明排队、prefill、decode 与网络是否计入。'],['VCS / CycleSim','RTL 仿真与周期模拟证据。它们各自依赖输入、版本与建模范围，不等同于实际硅上端到端测试。'],['VP','向量计算相关执行资源。归一化、激活、索引和规约等可能成为矩阵单元之外的瓶颈。']
];
function renderGlossary(){ $('#main').innerHTML=`<div class="eyebrow">A SHARED VOCABULARY</div><h1 class="page-title">先把术语，用在同一层上。</h1><p class="page-lead">${GLOSSARY.length} 个常用概念。理解术语时，顺便问一句：它属于算法、编程模型、编译 IR、物理执行，还是验证证据？</p><div class="source-filter"><input id="glossary-search" aria-label="搜索术语" placeholder="搜索中英文术语…"></div><dl class="glossary-grid" id="glossary-list"></dl>`;const update=()=>{const q=$('#glossary-search').value.toLowerCase();$('#glossary-list').innerHTML=GLOSSARY.filter(x=>x.join(' ').toLowerCase().includes(q)).map(x=>`<div class="glossary-item"><dt>${esc(x[0])}</dt><dd>${esc(x[1])}</dd></div>`).join('');};$('#glossary-search').oninput=update;update();}
function renderNotebook(){
 const entries=notebookEntries();
 $('#main').innerHTML=`<div class="eyebrow">MAKE IT YOUR OWN</div><h1 class="page-title">写下你自己的解释。</h1><p class="page-lead">笔记、阅读进度和练习状态只保存在当前浏览器。不同设备和域名之间不会自动同步；请导出 JSON 备份，或导出 Markdown 用自己的工具编辑。</p><div class="note-actions"><button id="export-json" class="primary">导出完整备份</button><button id="export-md">导出 Markdown 笔记</button><button id="import-json">导入备份</button><input id="import-file" type="file" accept="application/json,.json" hidden></div><div class="source-filter"><input id="note-search" type="search" aria-label="搜索笔记" placeholder="搜索章节标题或笔记内容…"><select id="note-module" aria-label="筛选笔记主题"><option value="all">全部主题</option>${MODULES.map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join('')}</select></div><div id="notebook-list">${entries.map(c=>`<div class="notebook-item" data-note-chapter="${c.id}"><h3><a href="#chapter/${c.parent||c.id}/${c.parent?'note-'+c.id:'notes'}">${esc(c.title)} ↗</a></h3><textarea class="note-textarea" data-note="${c.id}" aria-label="${esc(c.title)}笔记" placeholder="写下这一章你还不熟悉的地方，以及你自己的项目例子。">${esc(state.notes[c.id]||'')}</textarea></div>`).join('')}</div>`;
 const filterNotes=()=>{const term=$('#note-search').value.toLowerCase(),mod=$('#note-module').value;$$('[data-note-chapter]').forEach(el=>{const c=entries.find(c=>c.id===el.dataset.noteChapter);el.hidden=!(mod==='all'||chapterContext(c.parent||c.id).module?.id===mod)||!(c.title+' '+(state.notes[c.id]||'')).toLowerCase().includes(term);});};
 $('#note-search').oninput=filterNotes;$('#note-module').onchange=filterNotes;
 $$('[data-note]').forEach(el=>el.oninput=()=>{state.notes[el.dataset.note]=el.value;save();});
 const download=(content,type,name)=>{const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('#export-json').onclick=()=>download(JSON.stringify({version:1,exported:new Date().toISOString(),...state},null,2),'application/json','interview-notes.json');
 $('#export-md').onclick=()=>download('# AI Compiler 面试笔记\n\n'+entries.filter(c=>state.notes[c.id]).map(c=>'## '+c.title+'\n\n'+state.notes[c.id]).join('\n\n'),'text/markdown','interview-notes.md');
 $('#import-json').onclick=()=>$('#import-file').click();
 $('#import-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>5e6)throw Error('文件过大');const data=JSON.parse(await f.text());if(data.version!==1||!Array.isArray(data.read)||!data.notes||typeof data.notes!=='object')throw Error('格式不匹配');const imported=normalizeState(data);state={...state,read:[...new Set([...state.read,...imported.read])],legacyRead:[...new Set([...state.legacyRead,...imported.legacyRead])],notes:{...state.notes,...imported.notes},practice:{...state.practice,...imported.practice}};save();progress();renderNotebook();toast('备份已合并导入');}catch(err){toast('无法导入：'+err.message);}};
}
function setMenu(open){
 document.body.classList.toggle('menu-open',open);$('#menu-toggle').setAttribute('aria-expanded',String(open));
 $('#sidebar').inert=window.matchMedia('(max-width:700px)').matches&&!open;
}
function render(){
 const [route,id,section]=currentRoute();
 if(chapterAliases.has(location.hash.slice(1).split('/')[1]))history.replaceState(null,'','#chapter/'+id+(section?'/'+section:''));
 if(route==='chapter'&&renderedChapterId===id){setMenu(false);scrollChapterAnchor(section);return;}
 renderedChapterId=null;clearInterval(practiceTimer);practiceTimer=null;sectionObserver?.disconnect();
 setMenu(false);
 renderNavigation(route,id);
 $$('.main-nav a').forEach(a=>a.classList.toggle('active',a.dataset.nav===(route==='job'?'jobs':route)));
 const labels={home:'知识地图',catalog:'全站目录',jobs:'岗位收藏',companies:'公司与来源索引',lab:'架构实验室',practice:'面试练习',sources:'证据与来源',glossary:'术语速查',notebook:'个人笔记'};
 const context=chapterContext(id), module=MODULES.find(m=>m.id===id), company=COMPANIES.find(c=>c.id===id);
 let title=labels[route]||'页面';
 let trail='<a href="#home">FIELD NOTES</a>';
 if(route==='chapter'&&chapterMap.has(id)){title=chapterMap.get(id).title;if(context.module)trail+=`<span>/</span><a href="#module/${context.module.id}">${esc(context.module.title)}</a>`;}
 if(route==='module')title=module?.title||'主题';
 if(route==='company')title=company?.title||'公司';
 if(route==='job'){title=JOBS.find(job=>job.id===id)?.title||'岗位';trail+='<span>/</span><a href="#jobs">岗位收藏</a>';}
 $('#breadcrumb').innerHTML=trail+'<span>/</span>'+esc(title);
 document.title=title+' · AI Compiler Field Notes';
 if(route==='chapter')renderChapter(id,section);
 else if(route==='module')renderModule(id,section);
 else if(route==='company')renderCompanies(id);
 else if(route==='job')renderJob(id);
 else({home:renderHome,catalog:renderCatalog,jobs:renderJobs,companies:()=>renderCompanies(),lab:renderLab,practice:renderPractice,sources:renderSources,glossary:renderGlossary,notebook:renderNotebook}[route]||renderNotFound)();
 if(!section)window.scrollTo({top:0,behavior:'instant'});
 $('#main').focus({preventScroll:true});
}
function search(){
 const q=$('#search-input').value.trim().toLowerCase();
 if(!q){$('#search-results').innerHTML='<div class="empty">搜索章节、正文、面试问答和岗位要求。支持多个关键词，例如“MLIR 编译器”。</div>';return;}
 const words=q.split(/\s+/);const results=searchIndex.map(x=>({...x,score:words.reduce((n,w)=>n+(x.title.toLowerCase().includes(w)?5:0)+(x.body.toLowerCase().includes(w)?1:0),0)})).filter(x=>words.every(w=>(x.title+' '+x.subtitle+' '+x.body).toLowerCase().includes(w))).sort((a,b)=>b.score-a.score).slice(0,30);
 $('#search-results').innerHTML=results.map(r=>{const at=r.body.toLowerCase().indexOf(words[0]);const excerpt=r.body.slice(Math.max(0,at-35),Math.max(0,at-35)+155);return `<a class="search-result" href="${esc(r.link)}"><small>${esc(r.subtitle)}</small><strong>${esc(r.title)}</strong><p>${esc(excerpt)}…</p></a>`;}).join('')||'<div class="empty">没有匹配内容。试试更短的术语，或它的英文名。</div>';
 $$('.search-result').forEach(a=>a.onclick=()=>$('#search-dialog').close());
}
function openSearch(){$('#search-dialog').showModal();search();$('#search-input').focus();}
$('#search-open').onclick=openSearch;$('#search-close').onclick=()=>$('#search-dialog').close();$('#search-input').oninput=search;
$('#search-dialog').onclick=e=>{if(e.target===$('#search-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}if(e.key==='Escape'){const wasOpen=document.body.classList.contains('menu-open');setMenu(false);if(wasOpen)$('#menu-toggle').focus();}});
$('#menu-backdrop').onclick=()=>{setMenu(false);$('#menu-toggle').focus();};
$('#sidebar').addEventListener('click',e=>{if(e.target.closest('a[href^="#"]'))setMenu(false);});
window.matchMedia('(max-width:700px)').addEventListener('change',()=>setMenu(false));
$('#diagram-close').onclick=()=>$('#diagram-dialog').close();
$('#diagram-scale').onchange=updateDiagramZoom;
window.addEventListener('resize',updateDiagramZoom);
$('#menu-toggle').onclick=()=>setMenu(!document.body.classList.contains('menu-open'));
$('#focus-toggle').onclick=()=>{document.body.classList.toggle('focus');$('#focus-toggle').textContent=document.body.classList.contains('focus')?'目录':'专注';};
$('#print').onclick=()=>window.print();
$('.skip').onclick=e=>{e.preventDefault();$('#main').focus({preventScroll:true});$('#main').scrollIntoView();};
window.addEventListener('hashchange',render);
window.addEventListener('storage',e=>{if(e.key!==STORE_KEY)return;const latest=readStorage();const base=JSON.parse(JSON.stringify(latest));state=mergePending(latest);stateBase=base;progress();const id=currentRoute()[1];if($('#read-toggle'))$('#read-toggle').textContent=state.read.includes(id)?'已完成 ✓':'标记已读';if($('#read-main'))$('#read-main').textContent=state.read.includes(id)?'已完成本章 ✓ · 取消标记':'标记本章已读 ✓';$$('[data-note]').forEach(el=>{if(el!==document.activeElement)el.value=state.notes[el.dataset.note]||'';});const note=$('#chapter-note');if(note&&note!==document.activeElement)note.value=state.notes[currentRoute()[1]]||'';});
window.addEventListener('beforeprint',()=>{$$('.article details:not(.legacy-notes)').forEach(q=>{q.dataset.wasOpen=String(q.open);q.open=true;});});
window.addEventListener('afterprint',()=>{$$('.article details:not(.legacy-notes)').forEach(q=>q.open=q.dataset.wasOpen==='true');});
nav();render();
