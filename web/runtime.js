'use strict';

// Online entries load versioned assets on demand; portable HTML needs no fetch.
const onlineSite = typeof SITE !== 'undefined' && SITE.online ? SITE : null;
const pendingAssets = new Map();
const loadedChapters = new Set();

function installReadingLinks() {
  const entries = new Map(CHAPTERS.filter(c => c.portableReading).map(c => [c.portableReading.file, '#chapter/' + c.id]));
  entries.set('jobs.html', '#jobs');
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    const route = entries.get(url.pathname.split('/').pop());
    if (!route || url.origin !== location.origin || url.protocol !== location.protocol) return;
    event.preventDefault();
    const hash = url.hash || route;
    if (location.hash === hash) render(); else location.hash = hash;
  });
}

function cachedAsset(key, load) {
  if (!pendingAssets.has(key)) {
    const pending = load().catch(error => { pendingAssets.delete(key); throw error; });
    pendingAssets.set(key, pending);
  }
  return pendingAssets.get(key);
}
function fetchJSON(url) {
  return cachedAsset(url, async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Content request failed');
    return response.json();
  });
}
function loadScript(url) {
  return cachedAsset(url, () => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('Script request failed')); };
    document.head.append(script);
  }));
}
function loadStyle(url) {
  return cachedAsset(url, () => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = url;
    link.onload = resolve;
    link.onerror = () => { link.remove(); reject(new Error('Style request failed')); };
    document.head.append(link);
  }));
}
async function ensureRouteData(route, id) {
  if (!onlineSite) return;
  const tasks = [];
  if (route === 'chapter' && chapterMap.has(id) && !loadedChapters.has(id)) {
    tasks.push(fetchJSON(onlineSite.chapters[id]).then(chapter => {
      if (chapter.id !== id || !chapter.sections?.every(s => typeof s.html === 'string')) throw new Error('Invalid chapter');
      Object.assign(chapterMap.get(id), chapter);
      loadedChapters.add(id);
    }));
  }
  if (route === 'chapter' || route === 'lab') {
    tasks.push(loadScript(onlineSite.chapterScript), loadStyle(onlineSite.chapterStyle));
  }
  if (id === 'cyclesim-engineering') {
    tasks.push(fetchJSON(onlineSite.cases).then(value => { CYCLESIM_CASES = value; }));
  }
  if (route === 'practice') tasks.push(fetchJSON(onlineSite.questions).then(value => { questions = value; }));
  if (route === 'sources') tasks.push(fetchJSON(onlineSite.sources).then(value => { sources = value; }));
  await Promise.all(tasks);
}
function searchEntries() {
  if (!searchIndex) {
    searchIndex = onlineSite ? fetchJSON(onlineSite.search).then(entries => entries.concat(jobSearchEntries()))
      : Promise.resolve(CHAPTERS.flatMap(c => [
        {chapter:c.id,title:c.title,subtitle:c.part,body:c.lead+' '+c.tags.join(' '),link:'#chapter/'+c.id},
        ...c.sections.flatMap(s => sectionSearchEntries(c, s)),
        ...c.questions.map(q => ({chapter:c.id,title:q.q,subtitle:'面试追问 · '+c.title,body:q.a+' '+q.followup,link:'#chapter/'+c.id+'/questions'}))
      ]).concat(jobSearchEntries()));
    searchIndex = searchIndex.catch(error => { searchIndex = null; throw error; });
  }
  return searchIndex;
}
