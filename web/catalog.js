'use strict';
const MODULES = CATALOG.modules;
const chapterMap = new Map(CHAPTERS.map(c => [c.id, c]));
const memberships = new Map();
for (const module of MODULES) for (const group of module.groups) for (const id of group.chapters) memberships.set(id, {module, group});
const chapterContext = id => memberships.get(id) || {};
const groupChapters = group => group.chapters.map(id => chapterMap.get(id)).filter(Boolean);
const moduleChapters = module => module.groups.flatMap(groupChapters);
const chapterLink = id => chapterMap.has(id) ? `<a href="#chapter/${id}">${esc(chapterMap.get(id).title)} ↗</a>` : '';

function renderNavigation(route, id) {
  const context = route === 'chapter' ? chapterContext(id) : {module: MODULES.find(m => m.id === id)};
  if (['company','companies','jobs','job'].includes(route)) context.module = MODULES.find(m => m.id === 'interviews');
  $('#module-nav').innerHTML = MODULES.map(m => `<a href="#module/${m.id}" data-module="${m.id}" class="${context.module?.id === m.id ? 'active' : ''}"><i>${m.number}</i><span>${esc(m.title)}</span><small>${moduleChapters(m).length}</small></a>`).join('');
  $('#chapter-count').textContent = CHAPTERS.length;
  $('#job-nav-count').textContent = JOBS.length;
  const target = $('#chapter-nav');
  if (context.group) {
    $('#context-label').textContent = context.group.title;
    target.innerHTML = `<a class="context-back" href="#module/${context.module.id}/${context.group.id}">← 返回专题目录</a>` + groupChapters(context.group).map((c, i) => `<a href="#chapter/${c.id}" data-chapter="${c.id}" ${c.id === id ? 'aria-current="page" class="active"' : ''}><i>${String(i+1).padStart(2,'0')}</i><span>${esc(c.title)}</span></a>`).join('');
    const chapter=chapterMap.get(id);
    if(chapter?.readingStages)target.innerHTML+=chapter.readingStages.map((stage,i)=>`<a class="stage-nav-link" data-stage-jump="${stage.id}" href="#chapter/${id}/${stage.id}"><i>${String(i+1).padStart(2,'0')}</i><span>${esc(stage.title)}</span></a>`).join('');
  } else if (context.module) {
    $('#context-label').textContent = '本主题的专题';
    target.innerHTML = context.module.groups.map(g => `<a href="#module/${context.module.id}/${g.id}"><span>${esc(g.title)}</span><small>${groupChapters(g).length}</small></a>`).join('');
  } else {
    $('#context-label').textContent = '按需展开';
    target.innerHTML = '<p class="nav-hint">选一个主题，再进入专题与章节。全站目录支持标题、标签与层级筛选。</p>';
  }
  progress();
}
function moduleCard(m) {
  const list = moduleChapters(m), done = list.filter(c => state.read.includes(c.id)).length;
  return `<a class="module-card" href="#module/${m.id}"><div class="card-top"><b>FIELD ${m.number}</b><span>${list.length} 章 · ${m.groups.length} 专题</span></div><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p><div class="module-topics">${m.groups.map(g=>`<span>${esc(g.title)}</span>`).join('')}</div><div class="card-foot"><span>${done ? `已读 ${done} / ${list.length}` : '进入主题'}</span><span>↗</span></div></a>`;
}
function renderKnowledgeHome() {
  const count = CHAPTERS.reduce((n,c)=>n+c.sections.length,0);
  const last = chapterMap.get(state.last);
  $('#main').innerHTML = `<section class="hero"><div><div class="eyebrow">AN EXPANDING COMPILER KNOWLEDGE BASE</div><h1>从问题出发，<br><em>沿着数据流，<br>走到实现深处。</em></h1><p>算法、编译器、硬件与面试实作，在同一个知识库里逐层展开。围绕 518 / Zeus 与 GLM-5.3-Flash 的真实工作，也准备 Triton、MLIR、LLVM 和公司的现场追问。</p><div class="hero-actions"><a class="primary" href="#catalog">浏览全部目录 <span>↗</span></a><a class="text-link" href="#chapter/start-here">从学习路线开始 →</a></div></div>${heroArt()}</section>
  <div class="stats"><div class="stat"><b>${MODULES.length}</b><span>知识主题<br>专题逐层展开</span></div><div class="stat"><b>${CHAPTERS.length}</b><span>深度章节<br>${count} 个知识切面</span></div><div class="stat"><b>${questions.length}</b><span>面试追问<br>表达 · 推导 · 验证</span></div><div class="stat"><b>${COMPANIES.length}</b><span>公司与公司组<br>面经 · 岗位 · 作业</span></div></div>
  ${jobsHomeHTML()}
  ${last ? `<a class="resume-reading" href="#chapter/${last.id}"><span><small>CONTINUE READING</small><strong>接着读：${esc(last.title)}</strong></span><span>→</span></a>` : ''}
  <div class="section-head"><div><div class="eyebrow">CHOOSE A FIELD</div><h2>先选主题，再沿专题深入</h2></div><p>每个主题有独立目录，章节链接与学习记录持续保留。</p></div><div class="module-grid">${MODULES.map(moduleCard).join('')}</div>
  <div class="section-head"><div><div class="eyebrow">THREE WAYS TO STUDY</div><h2>从项目、机制或面试切入</h2></div></div><div class="study-paths"><a href="#chapter/glm-deployment-overview"><small>01 / PROJECT</small><h3>看懂 GLM-5.3-Flash 整网部署</h3><p>完整网络 → Attention / MoE → mHC 与其余组件 → 验证边界。</p></a><a href="#module/compiler"><small>02 / IMPLEMENTATION</small><h3>真正理解 Pass 怎么工作</h3><p>IR 对象 → 分析与失效 → pattern → lowering → 后端约束。</p></a><a href="#companies"><small>03 / INTERVIEW</small><h3>从公司题目反查知识缺口</h3><p>查看原帖身份和时间，再进入 Coding 与对应知识专题。</p></a></div>`;
}
function renderLearningPath(module) {
  if (!module.learningPath?.length) return '';
  return `<nav class="learning-path" aria-label="推荐阅读顺序"><div class="eyebrow">FROM MODEL TO OPERATORS</div><ol>${module.learningPath.map((step,i)=>`<li><a href="#chapter/${esc(step.chapter)}"><small>STEP ${String(i+1).padStart(2,'0')}</small><strong>${esc(step.title)}</strong><span>${esc(step.description)}</span></a></li>`).join('')}</ol></nav>`;
}
function renderReadingCollection(module, groupId) {
  $('#main').innerHTML = `<div class="eyebrow">FIELD ${module.number} / ${esc(module.collectionLabel || "TWO CONNECTED READINGS")}</div><h1 class="page-title">${esc(module.title)}</h1><p class="page-lead">${esc(module.description)}</p>${module.learningPath?renderLearningPath(module):`<div class="compiler-reading-intro"><span>01 / 搭起组件关系</span><b aria-hidden="true">→</b><span>02 / 沿后端逐层下降</span><p>每篇都是可独立保存的完整 HTML。先连续阅读，也可以从模块目录直接进入一个问题。</p></div>`}<div class="reading-volumes">${module.groups.map((group,i)=>{const c=groupChapters(group)[0], file=c.portableReading.file;return `<section class="reading-volume" id="topic-${group.id}"><div class="volume-heading"><div><span class="eyebrow">VOLUME ${String(i+1).padStart(2,'0')} / ${esc(group.title)}</span><h2><a href="${esc(file)}">${esc(c.title)}</a></h2><p>${esc(c.subtitle)}</p><div class="volume-actions"><a class="volume-open" href="${esc(file)}">打开完整教程 ↗</a><a href="${esc(file)}" download="${esc(c.portableReading.download)}">保存 HTML ↓</a><span>${c.sections.length} 节 · ${c.questions.length} 个追问</span></div></div><span class="volume-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span></div><nav class="volume-outline" aria-label="${esc(c.title)}模块目录">${c.readingStages.map((stage,j)=>`<a href="${esc(file)}#chapter/${c.id}/${stage.id}"><small>${String(j+1).padStart(2,'0')}</small><span><strong>${esc(stage.title)}</strong><span>${esc(stage.summary)}</span></span><b aria-hidden="true">↗</b></a>`).join('')}</nav></section>`;}).join('')}</div>`;
  if(groupId)requestAnimationFrame(()=>document.getElementById('topic-'+groupId)?.scrollIntoView());
}
function renderModule(id, groupId) {
  const module = MODULES.find(m=>m.id===id);
  if (!module) return renderNotFound();
  if (module.interviewCollection) return renderInterviewCollection(module, groupId);
  if (module.readingCollection) return renderReadingCollection(module, groupId);
  const list=moduleChapters(module), done=list.filter(c=>state.read.includes(c.id)).length;
  $('#main').innerHTML=`<div class="eyebrow">FIELD ${module.number} / TOPIC COLLECTION</div><h1 class="page-title">${esc(module.title)}</h1><p class="page-lead">${esc(module.description)}</p><div class="collection-meta"><span>${list.length} 章</span><span>${module.groups.length} 个专题</span><span>已读 ${done} / ${list.length}</span><a href="#catalog">全站目录 ↗</a>${id==='interviews'?'<a href="#companies">打开公司与来源索引 ↗</a><a href="#jobs">岗位要求与收藏 ↗</a>':''}</div>${renderLearningPath(module)}<nav class="group-jumps" aria-label="专题跳转">${module.groups.map(g=>`<a href="#module/${id}/${g.id}">${esc(g.title)} <small>${groupChapters(g).length}</small></a>`).join('')}</nav>${module.groups.map((g,i)=>g.continuousReading?renderContinuousTopic(g,i):`<section class="topic-section" id="topic-${g.id}"><div class="section-head"><div><div class="eyebrow">TOPIC ${String(i+1).padStart(2,'0')}</div><h2>${esc(g.title)}</h2></div><span class="small muted">${groupChapters(g).reduce((n,c)=>n+c.minutes,0)} 分钟参考阅读量</span></div><div class="chapter-grid">${groupChapters(g).map(card).join('')}</div></section>`).join('')}`;
  if(groupId)requestAnimationFrame(()=>document.getElementById('topic-'+groupId)?.scrollIntoView());
}
function renderInterviewCollection(module, groupId) {
  const volumes = module.groups.map((group,i)=>{
    const mock = group.id === 'mocks';
    return `<section class="reading-volume${mock?' interview-mock-volume':''}" id="topic-${esc(group.id)}"><span class="eyebrow">${String(i+1).padStart(2,'0')} / ${esc(group.title)}</span>${groupChapters(group).map(c=>`<h2><a href="${esc(c.portableReading.file)}">${esc(c.title)}</a></h2><p>${esc(c.subtitle)}</p>${mock?`<p class="interview-mock-meta">原创模拟 · ${c.interviewQuestionCount} 个主问题 · 含岗位介绍与参考回答</p>`:''}<div class="volume-actions"><a class="volume-open" href="${esc(c.portableReading.file)}">${mock?'进入本场模拟面试 →':'打开完整页面 ↗'}</a><a href="${esc(c.portableReading.file)}" download="${esc(c.portableReading.download)}">保存 HTML ↓</a></div>${mock?'':`<details class="interview-volume-index"><summary>${group.id==='jobs'?'查看岗位目录':'查看全部场次目录'}</summary><nav aria-label="${esc(c.title)}目录">${c.sections.map(s=>`<a href="${esc(c.portableReading.file)}#chapter/${c.id}/${s.id}">${esc(sectionTitle(s.title))}</a>`).join('')}</nav></details>`}`).join('')}</section>`;
  }).join('');
  $('#main').innerHTML = `<div class="eyebrow">FIELD ${esc(module.number)} / INTERVIEW DESK</div><h1 class="page-title">${esc(module.title)}</h1><p class="page-lead">${esc(module.description)}</p><div class="interview-volumes">${volumes}</div><p class="interview-intro-note">岗位介绍、公司面试题和原创模拟面试各有独立入口；每份材料保留来源与适用范围。</p>`;
  if (groupId) requestAnimationFrame(()=>document.getElementById('topic-'+groupId)?.scrollIntoView());
}
function renderContinuousTopic(group, index) {
  const c=groupChapters(group)[0], file=c.portableReading.file;
  return `<section class="topic-section reading-volume" id="topic-${esc(group.id)}"><div class="volume-heading"><div><span class="eyebrow">CONTINUOUS READING / ${esc(group.title)}</span><h2><a href="${esc(file)}">${esc(c.title)}</a></h2><p>${esc(c.subtitle)}</p><div class="volume-actions"><a class="volume-open" href="${esc(file)}">打开完整长文 ↗</a><a href="${esc(file)}" download="${esc(c.portableReading.download)}">保存 HTML ↓</a><span>${c.sections.length} 节 · ${c.questions.length} 个追问</span></div></div><span class="volume-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span></div><nav class="volume-outline" aria-label="${esc(c.title)}阅读路线">${c.readingStages.map((stage,i)=>`<a href="${esc(file)}#chapter/${c.id}/${stage.id}"><small>${String(i+1).padStart(2,'0')}</small><span><strong>${esc(stage.title)}</strong><span>${esc(stage.summary)}</span></span><b aria-hidden="true">↗</b></a>`).join('')}</nav></section>`;
}
function renderCatalog() {
  $('#main').innerHTML=`<div class="eyebrow">THE COMPLETE INDEX</div><h1 class="page-title">所有知识，都有清楚的位置。</h1><p class="page-lead">主题负责范围，专题组织问题，章节承载推导。搜索标题与标签，或按主题筛选；正文全文检索使用左侧搜索或 Ctrl / ⌘ K。</p><div class="catalog-controls"><input type="search" id="catalog-search" aria-label="搜索目录" placeholder="筛选章节、标签、专题…"><select id="catalog-module" aria-label="筛选知识主题"><option value="all">全部主题</option>${MODULES.map(m=>`<option value="${m.id}">${esc(m.title)}</option>`).join('')}</select><select id="catalog-state" aria-label="筛选阅读状态"><option value="all">全部阅读状态</option><option value="unread">未读</option><option value="read">已读</option></select></div><p id="catalog-count" class="small muted" aria-live="polite"></p><div id="catalog-results"></div>`;
  const update=()=>{const q=$('#catalog-search').value.trim().toLowerCase(), chosen=$('#catalog-module').value, read=$('#catalog-state').value;let total=0;
    $('#catalog-results').innerHTML=MODULES.filter(m=>chosen==='all'||m.id===chosen).map(m=>{const groups=m.groups.map(g=>{const rows=groupChapters(g).filter(c=>(read==='all'||state.read.includes(c.id)===(read==='read'))&&[c.title,c.subtitle,c.tags.join(' '),g.title,m.title].join(' ').toLowerCase().includes(q));total+=rows.length;return rows.length?`<div class="catalog-group"><h3>${esc(g.title)}</h3>${rows.map(c=>`<a class="catalog-row" href="#chapter/${c.id}"><span class="read-dot ${state.read.includes(c.id)?'is-read':''}" aria-label="${state.read.includes(c.id)?'已读':'未读'}"></span><span><strong>${esc(c.title)}</strong><small>${esc(c.subtitle)}</small></span><span class="catalog-duration">${c.minutes} min ↗</span></a>`).join('')}</div>`:'';}).join('');return groups?`<section class="catalog-module"><h2><a href="#module/${m.id}">${m.number} / ${esc(m.title)} →</a></h2>${groups}</section>`:'';}).join('')||'<div class="empty">没有匹配的章节。可以尝试正文搜索。</div>';$('#catalog-count').textContent=`显示 ${total} / ${CHAPTERS.length} 章`;};
  $('#catalog-search').oninput=update;$('#catalog-module').onchange=update;$('#catalog-state').onchange=update;update();
}
function reportCard(r) {
  return `<article class="report-card"><div class="report-meta"><span class="tag">${esc(r.kind)}</span><span>${esc(r.date)}</span><span>${esc(r.experience)}</span></div><h3><a href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(r.title)} ↗</a></h3><p><strong>${esc(r.company)}</strong> · ${esc(r.topics)}</p><p class="report-note">${esc(r.note)}</p><small>来源 ${r.id} · 整理核验 ${esc(r.checked)}</small>${jobSourceLink(r.id)}</article>`;
}
function renderCompanies(id) {
  const company=COMPANIES.find(c=>c.id===id);
  if(id&&!company)return renderNotFound();
  const list=company?REPORTS.filter(r=>company.reports.includes(r.id)):REPORTS;
  $('#main').innerHTML=`<div class="eyebrow">FIELD REPORTS / SOURCE-AWARE PREPARATION</div><h1 class="page-title">${company?esc(company.title):'先确认问过什么，再决定练什么。'}</h1><p class="page-lead">${company?esc(company.description):'把公司、岗位类型、时间和来源放在一起看。本人叙述是一次经历；官方 JD 是能力要求；公开作业是特定版本任务。它们都不代表固定题库或录用标准。'}</p><div class="collection-meta"><a href="#jobs">岗位收藏 · 直接查看任职要求 ↗</a><a href="#module/interviews">面经专题目录 ↗</a>${company?'<a href="#companies">← 所有公司</a>':'<a href="#module/coding">Coding 参考实现 ↗</a>'}</div>${company?`<div class="related-reading">${company.chapters.map(chapterLink).join('')}</div>`:`<div class="company-grid">${COMPANIES.map(c=>`<a class="company-card" href="#company/${c.id}"><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><small>${c.reports.length} 条来源 ↗</small></a>`).join('')}</div>`}<div class="section-head"><h2>${company?'相关来源记录':'按证据类型检索'}</h2><span class="small muted">不按帖子数量推断出题概率</span></div><div class="source-filter"><input type="search" id="report-search" aria-label="筛选面经来源" placeholder="搜索公司、题目、时间、原帖…"><select id="report-category" aria-label="面经证据类型"><option value="all">全部来源</option><option value="report">本人面经 / 自述</option><option value="job">官方岗位</option><option value="takehome">官方作业</option><option value="reading">第三方备考资料</option></select></div><p id="report-count" class="small muted" aria-live="polite"></p><div id="report-list"></div>`;
  const update=()=>{const q=$('#report-search').value.toLowerCase(), cat=$('#report-category').value;const rows=list.filter(r=>(cat==='all'||r.category===cat)&&[r.title,r.company,r.date,r.experience,r.topics,r.note].join(' ').toLowerCase().includes(q));$('#report-count').textContent=rows.length+' 条来源记录';$('#report-list').innerHTML=rows.map(reportCard).join('')||'<div class="empty">没有匹配的来源。</div>';};$('#report-search').oninput=update;$('#report-category').onchange=update;update();
}
function updateDiagramZoom() {
  const stage=$('#diagram-stage'), svg=$('svg',stage);
  if(!svg||!$('#diagram-dialog').open)return;
  const style=getComputedStyle(stage), width=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const baseline=Math.max(width,window.matchMedia('(max-width:700px)').matches?650:700);
  const scale=Number($('#diagram-scale').value)/100;
  stage.style.setProperty('--zoom',String(scale*100)+'%');
  svg.style.width=String(baseline*scale)+'px';
}
function openFigureDialog(svg, caption, namespace = 'figure') {
  const clone=svg.cloneNode(true), renames=new Map();
  [clone,...clone.querySelectorAll('[id]')].forEach(el=>{if(el.id){renames.set(el.id,'zoom-'+namespace+'-'+el.id);el.id=renames.get(el.id);}});
  [clone,...clone.querySelectorAll('*')].forEach(el=>{for(const attr of [...el.attributes]){let value=attr.value;for(const [oldId,newId] of renames){value=value.replaceAll('url(#'+oldId+')','url(#'+newId+')');if(['href','xlink:href'].includes(attr.name)&&value==='#'+oldId)value='#'+newId;if(['aria-labelledby','aria-describedby'].includes(attr.name))value=value.split(' ').map(v=>v===oldId?newId:v).join(' ');}if(value!==attr.value)el.setAttribute(attr.name,value);}});
  $('#diagram-stage').replaceChildren(clone);$('#diagram-caption').textContent=caption||svg.getAttribute('aria-label')||'';$('#diagram-scale').value='100';$('#diagram-dialog').showModal();updateDiagramZoom();
}
function enableFigureZoom() {
  $$('.article svg').forEach(svg=>{
    if(svg.closest('svg')!==svg || svg.closest('.pe-explorer, .performance-explorer, .attention-lab, .sync-explorer, .ds-lab'))return;
    let fig=svg.closest('figure');
    if(!fig){fig=document.createElement('figure');svg.before(fig);fig.append(svg);}
    fig.classList.add('diagram');
  });
  $$('.article .diagram').forEach((fig,i)=>{
    const svg=$('svg',fig);if(!svg)return;
    const button=document.createElement('button');button.className='figure-open';button.textContent='放大图示 ↗';button.setAttribute('aria-label','放大图示 '+(svg.getAttribute('aria-label')||i+1));
    button.onclick=()=>openFigureDialog(svg,$('figcaption',fig)?.textContent,i);fig.append(button);
  });
}
