'use strict';

// Published chapter identifiers remain valid when a narrative is consolidated.
const chapterAliases = new Map();
const chapterSectionAliases = new Map();
for (const chapter of CHAPTERS) {
  for (const [id, legacy] of Object.entries(chapter.legacyChapters || {})) {
    if (id !== chapter.id) chapterAliases.set(id, {...legacy, chapter:chapter.id});
  }
  for (const [id, anchors] of Object.entries(chapter.legacySections || {})) {
    for (const anchor of anchors) chapterSectionAliases.set(id + '/' + anchor, chapter.id);
  }
}
function currentRoute() {
  const [route, requested, section] = (location.hash.slice(1) || document.body.dataset.defaultRoute || 'home').split('/');
  if (route === 'module') {
    const module = CATALOG.modules.find(m => m.id === requested);
    return [route, requested, module?.legacyGroups?.[section] || section];
  }
  const alias = route === 'chapter' && chapterAliases.get(requested);
  const moved = route === 'chapter' && chapterSectionAliases.get(requested + '/' + section);
  if (moved) return [route, moved, section];
  if (!alias) return [route, requested, section];
  const noteKey = alias.noteKey || requested;
  const target = section === 'notes' && state.notes[noteKey] ? 'note-' + noteKey : alias.anchorMap?.[section] || section || alias.section;
  return [route, alias.chapter, target];
}
function readingPathHTML(c) {
  if (!c.readingStages) return '';
  const portable = c.portableReading;
  const download = portable ? `<a class="portable-reading" href="${esc(portable.file)}" download="${esc(portable.download)}">${esc(portable.label)}</a>` : '';
  return `<nav class="reading-path" aria-label="本文阅读路径"><p>${esc(c.readingLabel || '从外到内，沿一条数据路径读完')}</p><ol>${c.readingStages.map((stage,i)=>`<li><a href="#chapter/${c.id}/${stage.id}"><small>${String(i+1).padStart(2,'0')}</small><span>${esc(stage.title)}</span></a></li>`).join('')}</ol>${download}</nav>`;
}
function chapterSectionsHTML(c) {
  const sectionHTML = (s,i,tag) => `<section id="${s.id}" data-section="${s.id}"><${tag}><span class="sec-no">${String(i+1).padStart(2,'0')}</span>${esc(sectionTitle(s.title))}</${tag}>${tag==='h3'?s.html.replace(/<(\/?)h3\b/g,'<$1h4'):s.html}</section>`;
  if (!c.readingStages) return c.sections.map((s,i)=>sectionHTML(s,i,'h2')).join('');
  return c.readingStages.map((stage,i)=>`<section class="chapter-stage" id="${stage.id}" data-reading-stage="${stage.id}"><header class="reading-stage-heading"><span>${esc(c.readingStageLabel || '放大层次')} ${String(i+1).padStart(2,'0')} / ${String(c.readingStages.length).padStart(2,'0')}</span><h2>${esc(stage.title)}</h2><p>${esc(stage.summary)}</p></header>${stage.sections.map(id=>{const index=c.sections.findIndex(s=>s.id===id);return sectionHTML(c.sections[index],index,'h3');}).join('')}</section>`).join('');
}
function chapterTocHTML(c, selected) {
  const link = (s,i) => `<a href="#chapter/${c.id}/${s.id}" data-toc="${s.id}">${String(i+1).padStart(2,'0')} ${esc(sectionTitle(s.title))}</a>`;
  if (!c.readingStages) return c.sections.map(link).join('');
  return c.readingStages.map((stage,i)=>`<details class="toc-stage" data-toc-stage="${stage.id}" ${i===0||stage.id===selected||stage.sections.includes(selected)?'open':''}><summary>${String(i+1).padStart(2,'0')} ${esc(stage.title)}</summary>${stage.sections.map(id=>{const index=c.sections.findIndex(s=>s.id===id);return link(c.sections[index],index);}).join('')}</details>`).join('');
}
function highlightReadingSection(id) {
  // Keep an explicit stage jump selected while its heading is visible; the
  // preceding section's tail may still intersect the reading viewport.
  const requested = document.getElementById(currentRoute()[2]);
  if (requested?.matches('[data-reading-stage]')) {
    const top = requested.getBoundingClientRect().top;
    if (top >= 0 && top < innerHeight / 2) id = requested.querySelector('[data-section]')?.id || id;
  }
  $$('[data-toc]').forEach(a=>a.classList.toggle('current',a.dataset.toc===id));
  const stage = document.getElementById(id)?.closest('[data-reading-stage]')?.dataset.readingStage;
  $$('[data-stage-jump]').forEach(a=>a.classList.toggle('current',a.dataset.stageJump===stage));
  const current = $(`[data-toc-stage="${stage}"]`);
  if (current && !current.classList.contains('current-stage')) {
    $$('[data-toc-stage]').forEach(d=>{d.open=d===current;d.classList.toggle('current-stage',d===current);});
  }
}
function scrollChapterAnchor(anchor) {
  if (!anchor) { window.scrollTo({top:0,behavior:'instant'}); return; }
  const target = document.getElementById(anchor);
  if (!target) return;
  if (target.tagName === 'DETAILS') target.open = true;
  const reference = target.querySelector(':scope > details.cycle-reference');
  if (reference) reference.open = true;
  for (let parent=target.parentElement;parent;parent=parent.parentElement) if (parent.tagName==='DETAILS') parent.open=true;
  highlightReadingSection(target.closest('[data-section]')?.id || target.querySelector('[data-section]')?.id || anchor);
  requestAnimationFrame(()=>target.scrollIntoView({behavior:'instant',block:'start'}));
}

function sectionSearchEntries(c, s) {
  const fragment = document.createElement('div');
  fragment.innerHTML = s.html;
  const items = [...fragment.querySelectorAll('[data-interview-question]')];
  if (!items.length) return [{chapter:c.id,title:s.title,subtitle:c.title,body:fragment.textContent || '',link:'#chapter/'+c.id+'/'+s.id}];
  return [{chapter:c.id,title:s.title,subtitle:c.title,body:s.title,link:'#chapter/'+c.id+'/'+s.id}, ...items.map(item=>({chapter:c.id,title:item.querySelector('summary')?.textContent || s.title,subtitle:s.title,body:item.querySelector('.interview-answer-body')?.textContent || '',link:'#chapter/'+c.id+'/'+item.id}))];
}

function initInterviewQuestions() {
  document.querySelectorAll('[data-interview-session]').forEach(session=>{
    const controls = session.querySelector('.interview-session-actions');
    if (!controls) return;
    for (const [label, open] of [['展开本场答案',true],['收起本场答案',false]]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click',()=>session.querySelectorAll('[data-interview-question]').forEach(item=>{item.open=open;}));
      controls.append(button);
    }
  });
  document.querySelectorAll('[data-interview-question] a[href^="#chapter/"]').forEach(link=>{
    link.addEventListener('click',()=>{
      const question = link.closest('[data-interview-question]');
      if (question && !link.classList.contains('interview-permalink')) history.replaceState(null,'','#chapter/'+currentRoute()[1]+'/'+question.id);
    });
  });
}
function legacyNotesHTML(c) {
  const entries=Object.entries(c.legacyChapters||{}).map(([id,old])=>[old.noteKey||id,old]).filter(([id])=>id!==c.id && state.notes[id]);
  const read=Object.keys(c.legacyChapters||{}).filter(id=>state.legacyRead.includes(id)).length;
  const prior=read?`<p class="note-hint">原分页的阅读记录已保留：读过 ${read} / ${Object.keys(c.legacyChapters).length} 篇。完成这篇连续讲解后，可单独标记全篇已读。</p>`:'';
  if (!entries.length) return prior;
  return prior+`<details class="legacy-notes"><summary>原分页笔记 · ${entries.length} 份</summary><p>这些笔记按原来的标题保留，可以继续编辑和导出。</p>${entries.map(([id,old])=>`<label for="note-${id}">${esc(old.title)}</label><textarea id="note-${id}" class="note-textarea" data-note="${id}" aria-label="${esc(old.title)}原笔记">${esc(state.notes[id])}</textarea>`).join('')}</details>`;
}
function notebookEntries() {
  return CHAPTERS.flatMap(c=>[c,...Object.entries(c.legacyChapters||{}).map(([id,old])=>[old.noteKey||id,old]).filter(([id])=>id!==c.id&&state.notes[id]).map(([id,old])=>({id,title:old.title+'（原分页笔记）',parent:c.id}))]);
}
