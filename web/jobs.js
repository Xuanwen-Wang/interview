'use strict';

const JOB_FAVORITES_KEY = 'interview-job-favorites-v1';
const JOB_STATUS = {listed:'官方可见', closed:'已下线', unverified:'待复核'};
const jobFilters = {query:'', company:'all', direction:'all', status:'all', favorites:false};
let jobFavorites = readJobFavorites();

function readJobFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(JOB_FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.filter(id => JOBS.some(job => job.id === id)) : []);
  } catch { return new Set(); }
}
function jobHref(job) { return '#job/' + encodeURIComponent(job.id); }
function jobOfficialURL(job) {
  try { const url = new URL(job.url); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}
function jobOfficialLink(job, label='查看岗位来源 ↗', className='') {
  const url = jobOfficialURL(job);
  return url ? `<a class="${esc(className)}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
}
function jobSearchText(job) {
  return [job.id,job.jobCode,job.title,job.company,...job.locations,job.employment,job.experience,job.direction,job.summary,...job.responsibilities,...job.requirements,...job.preferred,...job.keywords,job.relevance.summary,...job.relevance.evidence,...job.relevance.prepare].join(' ');
}
function jobSearchEntries() {
  return JOBS.map(job => ({title:job.title, subtitle:'岗位要求 · '+job.company+' · '+JOB_STATUS[job.status], body:jobSearchText(job), link:jobHref(job)}));
}
function jobStatusHTML(job) {
  const status = Object.hasOwn(JOB_STATUS,job.status) ? job.status : 'unverified';
  return `<span class="job-status job-status-${status}">${esc(JOB_STATUS[status])}</span>`;
}
function jobFavoriteButton(job) {
  const selected = jobFavorites.has(job.id);
  return `<button class="job-favorite" data-job-favorite="${esc(job.id)}" aria-pressed="${selected}" aria-label="${esc((selected?'取消关注：':'关注岗位：')+job.title)}">${selected?'★ 已关注':'☆ 关注'}</button>`;
}
function jobListHTML(items, empty='来源未单列此项。') {
  return items.length ? `<ul>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>` : `<p class="muted">${esc(empty)}</p>`;
}
function jobChapterLinks(job) {
  return job.chapters.map(id => {
    const chapter = CHAPTERS.find(chapter=>chapter.id===id);
    return chapter ? `<a href="#chapter/${esc(encodeURIComponent(id))}">${esc(chapter.title)} →</a>` : '';
  }).join('');
}
function jobsHomeHTML() {
  return `<a class="jobs-home-link" href="#jobs"><span><small>CAREER COLLECTION / ${JOBS.length} ROLES</small><strong>把感兴趣的岗位，放进同一张清单。</strong><span>编译器、算子性能、硬件与软硬协同：直接查要求，再跳转官网。</span></span><span class="jobs-home-arrow" aria-hidden="true">↗</span></a>`;
}
function jobSourceLink(sourceId) {
  const job = JOBS.find(job=>job.sourceId===sourceId);
  return job ? `<a class="job-source-link" href="${esc(jobHref(job))}">直接查看岗位要求与准备方向 →</a>` : '';
}
function jobCard(job) {
  return `<article class="job-card${job.origin==='user'?' job-card-user':''}">
    <div class="job-card-top"><div class="job-badges">${job.origin==='user'?'<span class="job-origin">你提供的岗位</span>':''}${jobStatusHTML(job)}<span class="job-company">${esc(job.company)}</span></div>${jobFavoriteButton(job)}</div>
    <h2><a href="${esc(jobHref(job))}">${esc(job.title)}</a></h2>
    <p class="job-meta">${esc([...job.locations,job.employment,job.experience].filter(Boolean).join(' · '))}</p>
    <p class="job-summary">${esc(job.summary)}</p>
    <div class="job-card-content"><section class="job-requirements"><h3>任职要求速览</h3>${jobListHTML(job.requirements.slice(0,3),'尚未取得可核验的详细要求，请查看来源说明。')}${job.requirements.length>3?`<a class="job-more" href="${esc(jobHref(job))}">查看全部 ${job.requirements.length} 条要求 →</a>`:''}</section><section class="job-relevance"><h3>为什么收录 <span>站内解读</span></h3><p>${esc(job.relevance.summary)}</p><div class="job-keywords">${job.keywords.map(keyword=>`<span>${esc(keyword)}</span>`).join('')}</div></section></div>
    <div class="job-card-bottom"><span>${esc(job.direction)} · 核验 ${esc(job.checked)}</span><div><a class="job-detail-link" href="${esc(jobHref(job))}">完整要求与准备方向 →</a>${jobOfficialLink(job)}</div></div>
  </article>`;
}
function matchingJobs() {
  const words = jobFilters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return JOBS.filter(job => (jobFilters.company==='all'||job.company===jobFilters.company)
    && (jobFilters.direction==='all'||job.direction===jobFilters.direction)
    && (jobFilters.status==='all'||job.status===jobFilters.status)
    && (!jobFilters.favorites||jobFavorites.has(job.id))
    && words.every(word=>jobSearchText(job).toLowerCase().includes(word)))
    .sort((a,b)=>Number(b.origin==='user')-Number(a.origin==='user'));
}
function updateJobResults() {
  const rows = matchingJobs();
  $('#job-count').textContent = `显示 ${rows.length} / ${JOBS.length} 个岗位 · 你提供的岗位优先`;
  $('#job-list').innerHTML = rows.map(jobCard).join('') || `<div class="empty job-empty"><h2>${jobFilters.favorites?'还没有符合条件的关注岗位':'没有符合条件的岗位'}</h2><p>${jobFilters.favorites?'用岗位右上角的“☆ 关注”建立自己的清单，或取消“只看关注”。':'试试更短的技术词，或放宽公司、方向和状态筛选。'}</p><button data-job-reset>重置筛选</button></div>`;
  bindJobFavoriteButtons();
  $$('[data-job-reset]').forEach(button=>button.onclick=resetJobFilters);
}
function resetJobFilters() {
  Object.assign(jobFilters,{query:'',company:'all',direction:'all',status:'all',favorites:false});
  renderJobs();
  $('#job-search').focus();
}
function bindJobFavoriteButtons() {
  $$('[data-job-favorite]').forEach(button=>button.onclick=()=>{
    const id = button.dataset.jobFavorite;
    const selected = !jobFavorites.has(id);
    try {
      const latest = readJobFavorites();
      if(selected)latest.add(id);else latest.delete(id);
      localStorage.setItem(JOB_FAVORITES_KEY,JSON.stringify([...latest]));
      jobFavorites = latest;
    } catch {
      if(selected)jobFavorites.add(id);else jobFavorites.delete(id);
      toast('浏览器未允许保存关注；本次页面打开期间仍可使用。');
    }
    if(currentRoute()[0]==='jobs') {
      updateJobResults();
      const replacement = $$('[data-job-favorite]').find(item=>item.dataset.jobFavorite===id);
      (replacement || $('#job-favorites')).focus({preventScroll:true});
    } else {
      button.outerHTML = jobFavoriteButton(JOBS.find(job=>job.id===id));
      bindJobFavoriteButtons();
      $$('[data-job-favorite]').find(item=>item.dataset.jobFavorite===id)?.focus({preventScroll:true});
    }
  });
}
function renderJobs() {
  const companies = [...new Set(JOBS.map(job=>job.company))];
  const directions = [...new Set(JOBS.map(job=>job.direction))];
  const options = (items,selected)=>items.map(item=>`<option value="${esc(item)}"${item===selected?' selected':''}>${esc(item)}</option>`).join('');
  $('#main').innerHTML = `<div class="jobs-page"><div class="eyebrow">CAREER COLLECTION / COMPILER & BEYOND</div><h1 class="page-title">值得进一步了解的岗位。</h1><p class="page-lead">一起看编译器、算子优化与软硬协同。岗位名只是入口，实际职责和要求更重要；从这份清单直接查要求、对照准备方向，再去官网了解详情。</p>
    <div class="job-collection-note"><span>岗位来源整理</span><p>状态以各条记录的核验日期为准。“官方可见”表示核验时官方发布状态为在线；用户提供的岗位转录单独说明，未据此确认在招。申请资格与招聘进度以官网为准。编译关联和准备建议单独标为站内解读。</p></div>
    <form class="job-filters" id="job-filter-form" role="search" aria-label="筛选岗位"><label class="job-search-label">搜索岗位与要求<input id="job-search" type="search" value="${esc(jobFilters.query)}" placeholder="试试：Triton、性能分析、MLIR…"></label><label>公司<select id="job-company"><option value="all">全部公司</option>${options(companies,jobFilters.company)}</select></label><label>方向<select id="job-direction"><option value="all">全部方向</option>${options(directions,jobFilters.direction)}</select></label><label>状态<select id="job-status"><option value="all">全部状态</option>${Object.entries(JOB_STATUS).map(([value,label])=>`<option value="${value}"${jobFilters.status===value?' selected':''}>${esc(label)}</option>`).join('')}</select></label><div class="job-filter-actions"><label class="job-favorites-label"><input type="checkbox" id="job-favorites"${jobFilters.favorites?' checked':''}>只看关注</label><button type="button" data-job-reset>重置筛选</button><span>关注仅保存在当前浏览器</span></div></form>
    <div class="job-results-heading"><p id="job-count" role="status" aria-live="polite"></p><a href="#companies">公司与面经来源 ↗</a></div><div id="job-list" class="job-list"></div></div>`;
  $('#job-filter-form').onsubmit=event=>event.preventDefault();
  $('#job-search').oninput=event=>{jobFilters.query=event.target.value;updateJobResults();};
  for(const name of ['company','direction','status'])$('#job-'+name).onchange=event=>{jobFilters[name]=event.target.value;updateJobResults();};
  $('#job-favorites').onchange=event=>{jobFilters.favorites=event.target.checked;updateJobResults();};
  updateJobResults();
}
function renderJob(id) {
  const job = JOBS.find(job=>job.id===id);
  if(!job)return renderNotFound();
  $('#main').innerHTML = `<article class="jobs-page job-detail"><a class="job-back" href="#jobs">← 返回岗位清单</a><div class="eyebrow">ROLE BRIEF / ${esc(job.sourceId)}</div><div class="job-detail-heading"><div class="job-badges">${job.origin==='user'?'<span class="job-origin">你提供的岗位</span>':''}${jobStatusHTML(job)}<span class="job-company">${esc(job.company)}</span></div>${jobFavoriteButton(job)}</div><h1 class="page-title">${esc(job.title)}</h1><p class="page-lead">${esc(job.summary)}</p><dl class="job-facts"><div><dt>地点</dt><dd>${esc(job.locations.join(' / ')||'未注明')}</dd></div><div><dt>招聘类型</dt><dd>${esc(job.employment||'未注明')}</dd></div><div><dt>经验要求</dt><dd>${esc(job.experience||'未注明')}</dd></div><div><dt>方向</dt><dd>${esc(job.direction)}</dd></div></dl><div class="job-detail-actions">${jobOfficialLink(job,'查看岗位来源 ↗','primary')}<a href="#job/${esc(encodeURIComponent(job.id))}/requirements">跳到任职要求 ↓</a><a href="#job/${esc(encodeURIComponent(job.id))}/preparation">查看准备方向 ↓</a></div>
    <div class="job-detail-layout"><div class="job-official-content"><p class="job-content-label">职责与要求 · 来源要点整理</p><section id="requirements" class="job-section"><h2>任职要求</h2>${jobListHTML(job.requirements,'尚未取得可核验的详细要求，请查看来源说明。')}</section><section class="job-section"><h2>加分项</h2>${jobListHTML(job.preferred)}</section><section class="job-section"><h2>工作职责</h2>${jobListHTML(job.responsibilities,'尚未取得可核验的职责详情，请查看来源说明。')}</section></div><aside class="job-interpretation" id="preparation"><div class="eyebrow">EDITORIAL NOTES</div><h2>与编译工作的连接</h2><p class="job-editorial-label">站内解读 · 并非招聘方的匹配评价</p><p>${esc(job.relevance.summary)}</p>${jobListHTML(job.relevance.evidence,'')}<h3>准备时可以讲清楚</h3>${jobListHTML(job.relevance.prepare,'')}<h3>关联学习章节</h3><nav class="job-chapter-links" aria-label="岗位关联学习章节">${jobChapterLinks(job)||'<p class="muted">暂无关联章节。</p>'}</nav></aside></div>
    <section class="job-provenance"><h2>来源与核验</h2><dl><div><dt>岗位来源</dt><dd>${jobOfficialLink(job,job.title+' ↗')}</dd></div><div><dt>来源编号</dt><dd>${esc(job.sourceId)}</dd></div><div><dt>核验日期</dt><dd>${esc(job.checked)}</dd></div><div><dt>发布日期</dt><dd>${esc(job.published||'未可靠取得')}</dd></div><div><dt>核验说明</dt><dd>${esc(job.verification)}</dd></div></dl><p>职责与要求为来源要点整理，措辞、申请条件和招聘进度以官方页面为准。已下线或待复核的记录保留供比较和准备。</p><p class="job-print-url">${esc(job.url)}</p></section></article>`;
  bindJobFavoriteButtons();
  const anchor = currentRoute()[2];
  if(['requirements','preparation'].includes(anchor))requestAnimationFrame(()=>document.getElementById(anchor)?.scrollIntoView());
}
window.addEventListener('storage',event=>{
  if(event.key!==JOB_FAVORITES_KEY&&event.key!==null)return;
  jobFavorites=readJobFavorites();
  const [route,id]=currentRoute();
  if(route==='jobs')updateJobResults();
  if(route==='job'){
    const job=JOBS.find(job=>job.id===id),button=$('[data-job-favorite]');
    if(job&&button){button.outerHTML=jobFavoriteButton(job);bindJobFavoriteButtons();}
  }
});
