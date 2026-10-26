'use strict';

function initCycleCasebooks() {
  document.querySelectorAll('[data-cycle-casebook]').forEach(root => {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    const group = CYCLESIM_CASES.groups[root.dataset.cycleCasebook];
    if (!group) return;
    let selected = 0, step = 0, timer = null;
    const stop = () => { clearTimeout(timer); timer = null; if (root.isConnected) root.querySelector('[data-cc-play]').textContent = '播放步骤'; };
    root.classList.add('cycle-casebook');
    root.innerHTML = `<div class="cc-head"><span class="cc-kicker">${esc(group.kicker || '打开一条真实记录')}</span><h4>${esc(group.title)}</h4><p>${esc(group.description)}</p></div>
      <div class="cc-controls"><label>选择案例<select aria-label="${esc(group.title)}：选择案例">${group.cases.map((c, i) => `<option value="${i}">${esc(c.title)}</option>`).join('')}</select></label><div class="cc-actions"><button type="button" data-cc-prev>← 上一步</button><button type="button" data-cc-play>播放步骤</button><button type="button" data-cc-next>下一步 →</button><button type="button" data-cc-reset>重置</button></div></div>
      <div class="cc-context"></div><div class="cc-stats"></div><div class="cc-progress"><label>推导位置 <output></output><input type="range" min="0" step="1" value="0" aria-label="${esc(group.title)}：推导步骤"></label></div>
      <div class="cc-frame" aria-live="polite"></div><div class="cc-drawing"></div><button type="button" class="figure-open cc-zoom">放大当前图示 ↗</button>
      <div class="cc-ledger"></div><p class="cc-source"></p>`;
    const q = s => root.querySelector(s);
    const render = () => {
      const c = group.cases[selected], f = c.frames[step];
      q('.cc-context').innerHTML = `<strong>${esc(c.shape)}</strong><p>${esc(c.conditions)}</p><small>${esc(c.boundary)}</small>`;
      q('.cc-stats').innerHTML = c.stats.map(s => `<div><small>${esc(s.label)}</small><strong>${esc(s.value)}</strong><span>${esc(s.unit || '')}</span></div>`).join('');
      if (c.modelInput) {
        const m = CycleCaseModel.bf16Mini(c.modelInput);
        q('.cc-stats').innerHTML += `<div><small>浏览器按公式重算</small><strong>${m.cycles}</strong><span>max(${m.work_plus_envelope}, ${m.write_path_total})；受限台架配置</span></div>`;
      } else if (c.dtGeometry) {
        const m = CycleCaseModel.dtPartial({H: c.dtGeometry.H, W: c.dtGeometry.W, C: c.dtGeometry.C, Lrd: 9, Lwr: 2});
        q('.cc-stats').innerHTML += `<div><small>浏览器逐块重算</small><strong>${m.exec}</strong><span>XFER ${m.XFER} + 其余 ${m.exec-m.XFER}</span></div>`;
      }
      q('.cc-progress output').textContent = `${step + 1} / ${c.frames.length}`;
      q('input[type=range]').max = c.frames.length - 1;
      q('input[type=range]').value = step;
      q('[data-cc-prev]').disabled = step === 0;
      q('[data-cc-next]').disabled = step === c.frames.length - 1;
      q('.cc-frame').innerHTML = `<div class="cc-step-label">${f.cycle === undefined ? `推导 ${step + 1}` : `${esc(f.cycle)} ${esc(c.clockLabel || 'core cycle')}`}</div><h4>${esc(f.title)}</h4><p>${esc(f.text)}</p>${f.equation ? `<div class="cc-equation">${esc(f.equation)}</div>` : ''}${f.values ? `<dl>${Object.entries(f.values).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}`;
      q('.cc-drawing').innerHTML = cycleCaseDrawing(c, f, step);
      q('.cc-ledger').innerHTML = `<details class="cc-full-ledger"><summary>展开完整计算账与所有步骤（打印时完整显示）</summary><div class="table-wrap"><table><caption>${esc(c.ledgerTitle || '事件、计算与本项贡献')}</caption><thead><tr><th>步骤</th><th>计算 / 观测</th><th>为什么要计入</th></tr></thead><tbody>${c.frames.map((x, i) => `<tr${i === step ? ' class="cc-current-row"' : ''}><td>${esc(x.title)}${x.cycle === undefined ? '' : `<br>${esc(x.cycle)} ${esc(c.clockLabel || 'core cycle')}`}</td><td>${esc(x.equation || Object.entries(x.values || {}).map(([k,v]) => `${k}=${v}`).join('；') || '见右侧解释')}</td><td>${esc(x.text)}</td></tr>`).join('')}</tbody></table></div></details>`;
      const href = sourceUrl({url: c.source || './evidence/cyclesim-casebook-sources.md'});
      q('.cc-source').innerHTML = `${esc(c.provenance)} <a href="${esc(href)}" target="_blank" rel="noreferrer">查看原始行、条件与源码依据 ↗</a>`;
    };
    q('select').addEventListener('change', e => { stop(); selected = Number(e.target.value); step = 0; render(); });
    q('[data-cc-prev]').onclick = () => { stop(); step = Math.max(0, step - 1); render(); };
    q('[data-cc-next]').onclick = () => { stop(); step = Math.min(group.cases[selected].frames.length - 1, step + 1); render(); };
    q('[data-cc-reset]').onclick = () => { stop(); step = 0; render(); };
    q('input[type=range]').oninput = e => { stop(); step = Number(e.target.value); render(); };
    const advance = () => {
      if (!root.isConnected) { stop(); return; }
      if (step < group.cases[selected].frames.length - 1) { step++; render(); }
      if (step === group.cases[selected].frames.length - 1) stop();
      else timer = setTimeout(advance, 1800);
    };
    q('[data-cc-play]').onclick = () => {
      if (timer !== null) { stop(); return; }
      if (step === group.cases[selected].frames.length - 1) { step = 0; render(); }
      q('[data-cc-play]').textContent = '暂停';
      timer = setTimeout(advance, 1800);
    };
    q('.cc-zoom').onclick = () => openFigureDialog(q('.cc-drawing svg'), group.cases[selected].drawingNote, 'cyclesim-' + group.cases[selected].id);
    root._cycleCasePrint = stop;
    render();
  });
}

function cycleCaseDrawing(c, frame, step) {
  const specialized = cycleSpecialDrawing(c, step, frame);
  if (specialized) return `<figure>${specialized}<figcaption>${esc(c.drawingNote)}</figcaption></figure>`;
  const ns = 'xmlns="http://www.w3.org/2000/svg"', width = 880;
  const text = (x,y,s,size=17,extra='') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${esc(s)}</text>`;
  const colors = ['#316a8b','#38806c','#b76a38','#82669d','#b28b3a','#567c98','#8b6172'];
  let body = '', height = 360;
  if (c.timeline) {
    const rows = c.timeline.rows, end = c.timeline.end, begin = c.timeline.begin || 0;
    height = 112 + rows.length * 52;
    const x = v => 170 + (v-begin) / (end-begin) * 662;
    body += text(24,30,c.timeline.title || '真实事件时间轴',20);
    for (let i=0;i<=5;i++) {
      const v=begin+(end-begin)*i/5;
      body += `<path d="M${x(v)} 58 V${height-43}" stroke="#dce4df"/>`+text(x(v),height-18,Math.round(v),14,'text-anchor="middle"');
    }
    rows.forEach((r,i)=>{
      const y=66+i*52, active=frame.cycle !== undefined && frame.cycle>=r.start && frame.cycle<r.end;
      body += text(24,y+21,r.label,16);
      body += `<rect x="${x(r.start)}" y="${y}" width="${Math.max(2,x(r.end)-x(r.start))}" height="30" rx="4" fill="${colors[i%colors.length]}" opacity="${active||step===c.frames.length-1?1:.5}"/>`;
      body += text(Math.min(x(r.start)+3,716),y-5,`${r.start} → ${r.end}`,13);
    });
    if(frame.cycle!==undefined) body += `<path d="M${x(frame.cycle)} 45 V${height-42}" stroke="#af482c" stroke-width="2.5" stroke-dasharray="5 4"/>`+text(Math.min(820,Math.max(186,x(frame.cycle))),47,frame.cycle,15,'text-anchor="middle"');
    body+=text(690,30,c.clockLabel || 'core cycle',14);
  } else if (c.geometry) {
    const g=c.geometry, result=CycleCaseModel.geometry(g);
    height=390;
    body+=text(24,30,'把有效字节落到 128 B 传输格中',20);
    const show=result.rows.slice(0,4), scale=1.55;
    show.forEach((r,i)=>{
      const y=70+i*65;
      body+=text(24,y+22,`行 ${i} · 偏移 ${r.start%128} B`,16);
      r.words.slice(0,3).forEach((w,j)=>{
        const xx=235+j*206;
        body+=`<rect x="${xx}" y="${y}" width="${128*scale}" height="29" fill="#e0e5de" stroke="#b8c4ba"/><rect x="${xx+w.lo*scale}" y="${y}" width="${(w.hi-w.lo)*scale}" height="29" fill="#397f6b"/>`;
        body+=text(xx+99,y+46,`${w.hi-w.lo} / 128 B有效`,13,'text-anchor="middle"');
      });
      if(r.words.length>3)body+=text(840,y+20,'…',20);
    });
    body+=text(24,359,`全部 ${g.rows} 行：${result.beats} beat，${result.bursts} burst，${result.partial} 个 partial beat`,18);
    body+=text(24,382,'绿色为新字节；灰色为本次没有覆盖的字节。这里只画前四行。',15);
  } else {
    const nodes=c.nodes || ['输入','供数','计算','写回','完成'];
    height=280;
    body+=text(24,32,c.diagramTitle || '沿数据通路核对本项贡献',20);
    const gap=20, box=(832-gap*(nodes.length-1))/nodes.length;
    nodes.forEach((n,i)=>{
      const x=24+i*(box+gap), active=(frame.node ?? Math.min(step,nodes.length-1))===i;
      body+=`<rect x="${x}" y="78" width="${box}" height="96" rx="8" fill="${active?'#d8eadc':'#edf0e9'}" stroke="${active?'#34745e':'#bdcabe'}" stroke-width="${active?2:1}"/>`;
      const lines=typeof n==='string'?[n]:n;
      lines.forEach((line,j)=>body+=text(x+box/2,106+j*25,line,16,'text-anchor="middle"'));
      if(i<nodes.length-1)body+=`<path d="M${x+box+2} 125 H${x+box+gap-5} l-5 -4 m5 4 l-5 4" stroke="#61766b" fill="none" stroke-width="2"/>`;
    });
    if(c.chart) {
      height=420;
      body+=text(24,215,c.chart.title,16);
      const mx=Math.max(...c.chart.rows.map(r=>Math.max(r.model,r.rtl)));
      c.chart.rows.forEach((r,i)=>{
        const xx=65+i*127;
        body+=`<rect x="${xx}" y="${359-r.model/mx*120}" width="32" height="${r.model/mx*120}" fill="#397f6b"/><rect x="${xx+35}" y="${359-r.rtl/mx*120}" width="32" height="${r.rtl/mx*120}" fill="#b76a38"/>`;
        body+=text(xx+33,380,r.label,14,'text-anchor="middle"');
        body+=text(xx+33,399,`${r.model} / ${r.rtl}`,13,'text-anchor="middle"');
      });
      body+=text(620,215,'绿：模型 / 橙：RTL',14);
    } else body+=text(24,220,'框表示硬件环节，不按时长比例；高亮当前正在解释的环节。',16);
  }
  return `<figure><svg ${ns} viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(c.title+'：'+frame.title)}"><rect width="${width}" height="${height}" rx="10" fill="#f8faf5"/><g font-family="sans-serif" fill="#243d36">${body}</g></svg><figcaption>${esc(c.drawingNote)}</figcaption></figure>`;
}

if(typeof window!=='undefined')window.addEventListener('beforeprint',()=>document.querySelectorAll('[data-cycle-casebook]').forEach(root=>root._cycleCasePrint?.()));
