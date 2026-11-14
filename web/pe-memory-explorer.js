'use strict';

let peMemoryExplorerId = 0;

// Address order, accepted consumption and conditional timing have separate views.
function initPeMemoryExplorers(scope = document) {
  scope.querySelectorAll('[data-pe-memory-explorer]').forEach(root => {
    if(root.dataset.peMemoryReady) return;
    root.dataset.peMemoryReady='true';
    if(root.dataset.peMemoryExplorer==='credit') renderPeMemoryCredit(root);
    else renderPeMemoryExplorer(root);
  });
}

function renderPeMemoryExplorer(root) {
  const execution=root.dataset.peMemoryExplorer==='execution';
  const model=PEMemoryModel, uid=`pe-memory-${++peMemoryExplorerId}`;
  const view=key=>root.querySelector(`[data-memory-view="${key}"]`);
  const control=key=>root.querySelector(`[data-memory-control="${key}"]`);
  const action=key=>root.querySelector(`[data-memory-action="${key}"]`);
  const hex=n=>`0x${n.toString(16).padStart(6,'0')}`;
  const number=n=>n.toLocaleString('en-US');
  root.classList.add('pe-memory-explorer',execution?'pe-memory-execution':'pe-memory-layout');
  const transport=`<div class="pe-memory-transport"><button type="button" data-memory-action="play" aria-pressed="false">播放</button><button type="button" data-memory-action="previous">上一步</button><button type="button" data-memory-action="next">下一步</button><button type="button" data-memory-action="reset">重头开始</button><button type="button" data-memory-action="example" title="恢复主例 w4c8k2、base=0，定位 Weight[165,1097]；输入行 m2">定位正文例子</button><strong data-memory-view="step"></strong></div><label class="pe-memory-progress"><span>${execution?'消费进度':'读取进度'}</span><input type="range" min="0" value="0" data-memory-control="progress" aria-label="${execution?'选择Weight成功消费事件':'选择miniblock读取步骤'}"></label>`;
  const grouping=`<label>有效 MTK<select data-memory-control="mtk"><option>1</option><option selected>2</option><option>4</option></select></label><label>有效 MTC<select data-memory-control="mtc"><option>4</option><option selected>8</option><option>16</option></select></label>`;
  root.innerHTML=`<header class="pe-memory-head"><p class="pe-memory-kicker">${execution?'Act · Weight · Out':'Weight · miniblock · MC'}</p><h4>${execution?'保持同一份 Weight，依次换入4行 Act':'跟着 minitile 读一遍：坐标 → 地址 → MC row'}</h4><p>${execution?'每次成功消费都使用一行 Act，更新这一行自己的 Out 部分和。先看4次重放，再放大到一个 PE 的 AL1 与 OL1。':'先选布局与地址，再沿矩阵逐块读取。每一步是一个完整 miniblock；单个 MC 为这一块提供两笔32 B请求。'}</p></header>
    <div class="pe-memory-body">
      <div class="pe-memory-controls">${execution?'<div class="pe-memory-fixed-shape"><strong>Act[4,4096] · Weight[512,4096]</strong><span>Out[4,512] · 单核 normal KC · FP8 → FP32 · 无 UScale</span></div>':'<label class="pe-memory-scenario">布局场景<select data-memory-control="scenario"><option value="main">Dense · CI4096</option><option value="wide">Dense · CI8192</option><option value="narrow">CI8192 · 只缩小计算 TC</option><option value="blocked">CI8192 · 物理 blocked 子块</option></select></label><label class="pe-memory-base">Weight 起点<select data-memory-control="base"><option value="0">对齐起点 0</option><option value="557056">偏移 0x88000</option></select></label>'}${grouping}</div>
      <p class="pe-memory-scope" data-memory-view="scope"></p>
      ${execution?'<div class="pe-memory-weight-held" data-memory-view="weight"></div><div class="pe-memory-replay" data-memory-view="replay"></div>':'<div class="pe-memory-figure"><div class="pe-memory-figure-heading"><strong>Weight 的完整块矩阵</strong><button type="button" data-memory-action="zoom">放大图示 ↗</button></div><div class="pe-memory-matrix-scroll" data-memory-view="grid"></div><p class="pe-memory-group-caption" data-memory-view="group"></p></div><p class="pe-memory-legend"><span><i class="current"></i>橙色：当前块</span><span><i class="visited"></i>浅绿：已访问</span><span><i class="group"></i>虚线：MTC × MTK 分组</span><span>箭头：上一步 → 这一步</span></p>'}
      ${transport}
      ${execution?'<div class="pe-memory-event" data-memory-view="event" aria-live="polite"></div><div class="pe-memory-local-heading"><strong>放大 group2 / PE4 / ALU5</strong><span>AL1 读取 Act；OL1 累加 Out 的局部部分和。</span></div><div class="pe-memory-local"><div data-memory-view="al1"></div><div data-memory-view="ol1"></div></div><p class="pe-memory-ownership" data-memory-view="ownership"></p>':'<p class="pe-memory-read-count" data-memory-view="stats"></p><div class="pe-memory-cards" data-memory-view="cards"></div><div class="pe-memory-event" data-memory-view="event" aria-live="polite"></div><div class="pe-memory-history-heading">请求轨迹 <span>每格一个 miniblock；展示最近8块</span></div><div class="pe-memory-history" data-memory-view="history"></div>'}
      <details class="pe-memory-notes pe-deep-dive"><summary>图的范围与计数口径</summary><p data-memory-view="boundary"></p></details>
      <p class="pe-memory-print">${execution?'静态读图：同一份 Weight 先后配合 Act 的4行。AL1 地址随输入行变化；OL1 为各行、各输出块保留独立部分和。完整 CI 归约及当前 K 组所有行完成后，才具备 OL1 面交接条件。':'静态读图：先沿同一 CI 块访问当前组的 CO 块，再推进 CI。存储块号由源布局决定，读取次序由 minitile 决定；地址映射后的 row 变化不能直接换算为 kernel 时间。'}</p>
    </div>`;

  let sequence, cursor=0, timer=null, disposed=false, previousWidth=0;
  const listeners=new AbortController();
  const listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:listeners.signal});
  const count=()=>execution?sequence.acceptedBeats:sequence.blockCount;
  const current=()=>model.eventAt(sequence,execution?cursor:cursor*4);
  function pause() {
    if(timer!==null) window.clearInterval(timer);
    timer=null;action('play').textContent='播放';action('play').setAttribute('aria-pressed','false');
  }

  function matrix(block) {
    const s=sequence, columns=s.sourceUnits, scroller=view('grid');
    const available=Math.round(scroller.clientWidth)||780;
    const width=columns>32?Math.max(1320,available):available;
    const x0=108, y0=36, rh=54, cell=(width-x0-12)/columns, height=y0+4*rh+12;
    previousWidth=available;
    const seen=new Set(s.blocks.slice(0,block.ordinal).map(b=>b.index));
    const labelColumns=[...new Set([...Array.from({length:Math.ceil(columns/4)},(_,i)=>4*i),columns-1])];
    let labels=labelColumns.map(c=>`<text x="${x0+(c+.5)*cell}" y="23" text-anchor="middle">c${c}</text>`).join(''),cells='';
    for(let k=0;k<s.kUnits;k++) {
      labels+=`<text x="0" y="${y0+k*rh+21}" font-weight="600">k${k} · CO</text><text x="0" y="${y0+k*rh+41}" font-size="13">${128*k}…${128*k+127}</text>`;
      for(let c=0;c<columns;c++) {
        const index=k*columns+c, selected=index===block.index, visited=seen.has(index), inScope=c<s.cUnits;
        cells+=`<g ${inScope?`data-memory-block="${index}"`:''}><title>${inScope?'':'本次未访问：'}Weight miniblock(k${k}, c${c}) · 存储块 #${index} · CO ${128*k}…${128*k+127} / CI ${128*c}…${128*c+127} · ${hex(s.config.base+index*16384)}</title><rect x="${x0+c*cell+1}" y="${y0+k*rh+2}" width="${cell-2}" height="${rh-6}" rx="3" fill="${selected?'#ca8044':visited?'#c7dfd6':inScope?'#edf1ee':'#f8f9f6'}" stroke="${selected?'#965928':inScope?'#d3dfda':'#e1e5de'}" stroke-width="${selected?2:1}" stroke-dasharray="${inScope?'none':'3 3'}" class="${selected?'is-current':''}"/></g>`;
      }
    }
    const previous=s.blocks[block.ordinal-1];
    const arrow=previous?`<path d="M ${x0+(previous.cb+.5)*cell} ${y0+(previous.kb+.5)*rh} L ${x0+(block.cb+.5)*cell} ${y0+(block.kb+.5)*rh}" fill="none" stroke="#96612d" stroke-width="2.5" marker-end="url(#${uid}-arrow)"/>`:'';
    scroller.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;${columns>32?'min-width:1320px;':''}" font-family="system-ui, sans-serif" font-size="14" fill="#28464d" role="img" aria-label="Weight矩阵：CO块k0到k3，CI块c0到c${columns-1}；每格128乘128个FP8。当前存储块${block.index}。"><defs><marker id="${uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#96612d"/></marker></defs>${labels}${cells}${arrow}<rect x="${x0+block.cg*cell-2}" y="${y0+block.kg*rh-1}" width="${block.actualC*cell+4}" height="${block.actualK*rh-1}" rx="5" fill="none" stroke="#247f80" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/></svg>`;
    view('group').innerHTML=`当前分组：<strong>k${block.kg}…k${block.kg+block.actualK-1} × c${block.cg}…c${block.cg+block.actualC-1}</strong>；本次读 <strong>(k${block.kb}, c${block.cb})</strong>，存储块 <strong>#${block.index}</strong>。`;
    if(columns>32) {
      const selected=scroller.querySelector('.is-current').getBoundingClientRect(), viewport=scroller.getBoundingClientRect();
      if(selected.right>viewport.right-12)scroller.scrollLeft+=selected.right-viewport.right+12;
      else if(selected.left<viewport.left+12)scroller.scrollLeft-=viewport.left-selected.left+12;
    } else scroller.scrollLeft=0;
  }

  function layoutState(e) {
    const s=sequence,c=s.config,b=e.block,previous=s.blocks[b.ordinal-1];
    const shapes={main:'Weight[CO=512, CI=4096]',wide:'Weight[CO=512, CI=8192]',narrow:'Weight[512,8192] 的首个 CI2048 计算子块',blocked:'4个独立打包块中的首个 Weight_block[512,2048]'};
    const explanation={main:'32个 CI 块 × 4个 CO 块，共2 MiB。',wide:'64个 CI 块；相邻 CO 带已相隔1 MiB，MTK>1 时对齐也会交错换行。',narrow:'TC=2048，SC仍为8192：只算窄一些，存储中的跨带距离仍是1 MiB。',blocked:'每块独立打包，块内 SC=TC=2048；这里只看第一个子块，不代替完整 GEMM。'};
    view('scope').innerHTML=`<strong>${shapes[c.scenario]}</strong> · ${explanation[c.scenario]}<br>每格128 CO × 128 CI × 1 B = <strong>16 KiB</strong>；相邻 CO 带的首地址相差 <strong>${s.kStrideBytes/1024} KiB</strong>。`;
    matrix(b);
    const requests=s.blocks.slice(0,b.ordinal+1).flatMap(block=>block.requests);
    const changes=requests.reduce((n,r,i)=>n+Number(i>0&&r.row!==requests[i-1].row),0);
    view('stats').textContent=`当前第 ${b.ordinal+1} / ${s.blockCount} 块 · 单 MC 已请求 ${requests.length} / ${s.requestsPerMc} 笔 · 已发生 ${changes} 次 row 变化（完整序列 ${s.rowSwitches} 次）`;
    view('cards').innerHTML=`<div><small>① 当前 miniblock</small><strong>#${b.index} · (k${b.kb}, c${b.cb})</strong><span>CO ${b.kb*128}…${b.kb*128+127}<br>CI ${b.cb*128}…${b.cb*128+127}</span></div><div><small>② 每核 LDG 字节地址</small><strong>${hex(b.byteAddress)}</strong><span>base + #${b.index} × 16 KiB<br>${previous?'比上一块 '+(b.byteAddress>=previous.byteAddress?'+':'')+(b.byteAddress-previous.byteAddress)/1024+' KiB':'起点 '+hex(c.base)}</span></div><div><small>③ 单 MC 的两笔请求</small><strong>row ${b.requests[0].row} → ${b.requests[1].row}</strong><span>word ${b.requests[0].word}、${b.requests[1].word} · 各32 B<br>column ${b.requests[0].column}、${b.requests[1].column}</span></div>`;
    const switched=previous && previous.requests[1].row!==b.requests[0].row;
    view('event').dataset.switch=String(Boolean(switched));
    const title=!previous?`第一个 miniblock：落在 row ${b.requests[0].row}`:switched?`切换行：row ${previous.requests[1].row} → row ${b.requests[0].row}`:`仍在 row ${b.requests[0].row}：这一跳没有换行`;
    const transition=!previous?'这里作为地址序列起点，第一笔请求不计入“相邻请求换行”。':b.kg!==previous.kg?'前一 CO 分组的完整 CI 已遍历，进入下一个 CO 分组。':b.cg!==previous.cg?'CO 分组不变，进入下一组 CI 块。':b.cb!==previous.cb?'同一 CI 位置的 CO 块已读完，向右推进一个 CI 块。':'CI 位置不变，先读当前组的下一个 CO 块。';
    view('event').innerHTML=`<strong>${title}</strong><p>${transition} ${switched?'后续是否等待、等待多久还取决于 MC 行状态与供数流水。':''}</p>`;
    view('history').innerHTML=s.blocks.slice(Math.max(0,b.ordinal-7),b.ordinal+1).map(block=>`<div ${block===b?'aria-current="step"':''}><strong>#${block.index}</strong><span>(k${block.kb}, c${block.cb})</span><b>row ${block.requests[0].row}</b></div>`).join('');
    view('boundary').textContent=`本图只解释块请求顺序与地址。普通 KC、FP8、完整128×128块、双hub、无UScale；每个MC两笔32 B，256个MC合为16 KiB。任取本例一个MC，均可观察相同word/row顺序；图中没有展开各MC负载的通道交织。row映射限定splicing=1、bank-map=0xe4的低地址范围。MTC/MTK是有效长度；分组不移动Weight字节。${c.candidate?'扩展场景属于教学对照；blocked尚需配套pack、descriptor与跨块部分结果合并，未给出完整性能结论。':''} 动画速度不是时钟频率，也未模拟credit、PRE/ACT、背压或计算流水。`;
  }

  function executionState(e) {
    const s=sequence,c=s.config,b=e.block;
    view('scope').textContent=`有效 w4c${c.mtc}k${c.mtk}：当前 minitile 覆盖4行 Act、${b.actualC*128}个 CI、${b.actualK*128}个 CO。下方一次前进只增加一次成功消费，不表示一个实际时钟拍。`;
    view('weight').innerHTML=`<div><span class="pe-memory-object-label">保持的 Weight</span><strong>miniblock #${b.index} · (k${b.kb}, c${b.cb})</strong><span>CO ${b.kb*128}…${b.kb*128+127} × CI ${b.cb*128}…${b.cb*128+127} · 16 KiB</span></div><div class="pe-memory-held-count"><strong>${e.wLocal+1}<small> / 4</small></strong><span>${e.releaseWeight?'本次接受后可移走此块':'继续保持 FIFO 头部'}</span></div>`;
    view('replay').innerHTML=Array.from({length:4},(_,w)=>`<div class="${w===e.wLocal?'is-current':w<e.wLocal?'is-done':''}"><span class="pe-memory-replay-number">${w+1}</span><strong>Act 第 ${w} 行</strong><span>CI ${b.cb*128}…${b.cb*128+127}</span><div class="pe-memory-replay-product">× 同一 Weight #${b.index}</div><b>Out 第 ${w} 行</b><span>CO ${b.kb*128}…${b.kb*128+127}<br>更新独立部分和</span></div>`).join('');
    view('event').dataset.switch='false';
    view('event').innerHTML=`<strong>第 ${e.wLocal+1}/4 次接受：Act 第 ${e.wLocal} 行 → Out 第 ${e.wLocal} 行</strong><p>${e.releaseWeight?'4行已依次使用这份 Weight；本次完成后，FIFO 才能移走当前块。':'Weight 不变，输入行和对应 Out 槽位随此次接受切换。'} 同一块的4次消费共用一次取回的 Weight，不新增4份权重读取。</p>`;
    const local=root.querySelector('.pe-memory-local');local.classList.toggle('is-wide',b.actualC>8);
    let al1='<span class="pe-memory-grid-corner">Act</span>'+Array.from({length:b.actualC},(_,i)=>`<span class="pe-memory-grid-col">c${b.cg+i}</span>`).join('');
    for(let w=0;w<4;w++) {
      al1+=`<span class="pe-memory-word-row">m${w}</span>`;
      for(let j=0;j<b.actualC;j++){const word=w*b.actualC+j;al1+=`<span class="pe-memory-word ${word===e.al1Word?'is-current':''}" title="Act第${w}行、CI块c${b.cg+j}；PE4的16 B">${word}</span>`;}
    }
    view('al1').innerHTML=`<h5><span>Act</span> AL1 读哪个 word？</h5><p>行＝输入 m，列＝CI 块；格内是局部 word 地址，每格16 B。</p><div class="pe-memory-word-grid" style="grid-template-columns:34px repeat(${b.actualC},minmax(24px,1fr))">${al1}</div><div class="pe-memory-address-result"><strong>word ${e.al1Word}</strong><span>m${e.wLocal} × ${b.actualC} + 局部 c${b.cLocal}</span></div><p>当前读取 Act[m${e.wLocal}, CI ${e.ciFirst}…${e.ciLast}]。地址不含 k，同一 Act 可供不同 CO 块使用。</p>`;
    let ol1='<span class="pe-memory-grid-corner">Out</span>'+Array.from({length:b.actualK},(_,k)=>`<span class="pe-memory-grid-col">k${b.kg+k}<small>CO${(b.kg+k)*128+37}</small></span>`).join('');
    for(let w=0;w<4;w++){ol1+=`<span class="pe-memory-word-row">m${w}</span>`;for(let k=0;k<b.actualK;k++){const slot=4*k+w;ol1+=`<span class="pe-memory-slot ${slot===e.ol1Slot?'is-current':''}">${slot}</span>`;}}
    view('ol1').innerHTML=`<h5><span>Out</span> OL1 更新哪个槽？</h5><p>行＝输入 m，列＝CO 块；格内是 FP32 部分和槽位。</p><div class="pe-memory-slot-grid" style="grid-template-columns:34px repeat(${b.actualK},minmax(48px,1fr))">${ol1}</div><div class="pe-memory-address-result"><strong>slot ${e.ol1Slot}</strong><span>局部 k${b.kLocal} × 4 + m${e.wLocal}</span></div><p>对应 Out[m${e.wLocal}, CO${e.outputColumn}] 的 PE4 局部部分和。不同输入行、CO 块各自累计。</p>`;
    const completion=!e.completesC?'后续 CI 块继续累加到对应 Out 槽，跨 C minitile 也不提前结束。':e.outputTileComplete?'当前 CO 分组的全部行、全部输出块均已接受完整 CI 贡献，逻辑上具备 OL1 面交接条件；内部写回、8路归约及输出排空仍需继续完成。':'这一行、这一输出的 CI 贡献已齐，但本 CO 分组的其他行或输出块尚未接受完，OL1 整面仍不能交接。';
    view('ownership').innerHTML=`<strong>这一小步累加到 Out[m${e.wLocal}, CO${e.outputColumn}]</strong><span>PE4 本次贡献 CI ${e.ciFirst}…${e.ciLast} 的16项；加上此前 CI 块，共覆盖本 PE 的 ${e.partialTerms} 项。${completion}</span>`;
    view('boundary').textContent=`默认w4c8k2为本章历史配置的教学例，不是当前最优推荐。完整Act[4,4096]与Weight[512,4096]共128个Weight块、512次阵列成功接受、${number(s.macs)} MAC。当前minitile使用${e.al1Words}/64个AL1 word、${e.ol1Slots}/16个OL1槽。这里只显示当前minitile局部地址，不推断绝对ping/pong bank；也不模拟内部舍入、真实SRAM完成时刻或wall-clock周期。OL1各PE保留局部部分和，完整CI后还要group内8路归约。`;
  }

  function render() {
    const e=current();
    if(execution)executionState(e);else layoutState(e);
    view('step').textContent=`${cursor+1} / ${count()}`;
    control('progress').value=cursor;control('progress').max=count()-1;
    control('progress').setAttribute('aria-valuetext',`第${cursor+1}/${count()}${execution?'次接受':'块'}，Weight块${e.block.index}`);
    action('previous').disabled=cursor===0;action('next').disabled=cursor===count()-1;
  }
  function configure() {
    pause();sequence=model.enumerate({scenario:control('scenario')?.value||'main',base:Number(control('base')?.value||0),mtc:Number(control('mtc').value),mtk:Number(control('mtk').value)});cursor=0;render();
  }
  listen(action('play'),'click',()=>{
    if(timer!==null){pause();return;}
    if(cursor===count()-1)cursor=0;
    action('play').textContent='暂停';action('play').setAttribute('aria-pressed','true');render();
    timer=window.setInterval(()=>{if(!root.isConnected||document.hidden){pause();return;}cursor=Math.min(cursor+1,count()-1);render();if(cursor===count()-1)pause();},1000);
  });
  for(const [name,delta] of [['previous',-1],['next',1]])listen(action(name),'click',()=>{pause();cursor=Math.max(0,Math.min(count()-1,cursor+delta));render();});
  listen(action('reset'),'click',()=>{pause();cursor=0;render();});
  listen(action('example'),'click',()=>{
    if(control('scenario'))control('scenario').value='main';
    if(control('base'))control('base').value='0';
    control('mtc').value='8';control('mtk').value='2';
    configure();cursor=execution?70:17;render();
  });
  listen(control('progress'),'input',()=>{pause();cursor=Number(control('progress').value);render();});
  for(const name of ['scenario','base','mtc','mtk'])if(control(name))listen(control(name),'change',configure);
  if(!execution){
    listen(view('grid'),'click',event=>{const target=event.target.closest('[data-memory-block]');if(!target)return;const index=sequence.blocks.findIndex(b=>b.index===Number(target.dataset.memoryBlock));if(index<0)return;pause();cursor=index;render();});
    listen(action('zoom'),'click',()=>{pause();if(typeof openFigureDialog==='function')openFigureDialog(view('grid').querySelector('svg'),'CO块k0…k3沿纵轴，CI块c0…沿横轴；每格16 KiB。橙色为当前块，虚线为minitile。','pe-memory-grid');});
  }
  listen(document,'visibilitychange',()=>{if(document.hidden)pause();});listen(window,'beforeprint',pause);
  const visibility=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)pause();});
  if(visibility)visibility.observe(root);
  const resize=!execution&&typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{if(sequence&&Math.round(view('grid').clientWidth)!==previousWidth)matrix(current().block);}):null;
  if(resize)resize.observe(view('grid'));
  const removal=new MutationObserver(()=>{if(root.isConnected||disposed)return;disposed=true;pause();listeners.abort();removal.disconnect();if(visibility)visibility.disconnect();if(resize)resize.disconnect();delete root.dataset.peMemoryReady;});
  removal.observe(document.body,{childList:true,subtree:true});configure();
}

function renderPeMemoryCredit(root) {
  root.classList.add('pe-memory-explorer','pe-memory-credit');
  root.innerHTML=`<header class="pe-memory-head"><p class="pe-memory-kicker">MC 请求 · 返回消费 · credit 归还</p><h4>15个名额，怎样限制连续读取？</h4><p>一个 MC 每发出一笔请求就占用一个名额。名额等到返回数据被消费后才能再用；把这段有效周转时间记作 R。</p></header><div class="pe-memory-body"><div class="pe-memory-credit-control"><label>改变有效周转时间 <strong>R = <output data-memory-credit-value>23</output> cycle</strong><input type="range" min="8" max="46" value="23" data-memory-credit-rtt aria-label="条件模型的credit周转R"></label><button type="button" data-memory-credit-reset>恢复23</button></div><div class="pe-memory-figure"><div class="pe-memory-figure-heading"><strong>同一 MC 的请求与名额</strong><button type="button" data-memory-credit-zoom>放大图示 ↗</button></div><div class="pe-memory-matrix-scroll" data-memory-credit-chart></div><p class="pe-memory-credit-caption" data-memory-credit-caption></p></div><div class="pe-memory-credit-results" data-memory-credit-stats></div><p class="pe-memory-credit-equation" data-memory-credit-equation></p><details class="pe-memory-notes pe-deep-dive"><summary>这是条件模型：哪些量已知，哪些仍待测？</summary><p>15来自RTL的读在途门限；R=23是选定的条件参数，完整RTT仍待独立波形测量。返回到名额可再次使用的边沿已并入R。图以每MC每同域cycle最多发出一笔32 B为条件，不包含row切换、refresh、额外背压或其他请求竞争；不是RTL/VCS波形。平均供数间隔是长数据流的稳态间隔，不是第一块Weight的读取延迟。400 MHz只用于带宽条件换算。</p></details></div>`;
  const input=root.querySelector('[data-memory-credit-rtt]'),chart=root.querySelector('[data-memory-credit-chart]');
  let previousWidth=0;
  const update=()=>{
    const t=PEMemoryModel.creditWindow({rtt:Number(input.value)});
    root.querySelector('[data-memory-credit-value]').textContent=t.rtt;
    const width=Math.round(chart.clientWidth)||780,left=112,dx=(width-left-10)/64;previousWidth=width;
    let marks='',ticks='';
    for(const e of t.events){const x=left+e.cycle*dx,h=58*e.inFlight/15;if(e.cycle%8===0)ticks+=`<text x="${x+dx/2}" y="23" text-anchor="middle">${e.cycle}</text>`;marks+=`<g><title>cycle ${e.cycle}：${e.issued?'发出请求':'未发新请求'}；${e.returned?'归还名额':'无名额归还'}；在途${e.inFlight}</title><rect x="${x}" y="45" width="${Math.max(2,dx-2)}" height="28" rx="1" fill="${e.issued?'#6b91a3':'#edf0ed'}"/><rect x="${x}" y="100" width="${Math.max(2,dx-2)}" height="28" rx="1" fill="${e.returned?'#71a48b':'#edf0ed'}"/><rect x="${x}" y="${218-h}" width="${Math.max(2,dx-2)}" height="${h}" fill="#b1c9bb"/></g>`;}
    chart.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 242" style="width:100%" font-family="system-ui, sans-serif" font-size="13" fill="#29494e" role="img" aria-label="15个credit、R=${t.rtt}的条件时间轴：发出请求、名额可复用、在途数三行。"><text x="0" y="23">模型 cycle →</text>${ticks}<text x="0" y="63" font-weight="600">发出请求</text><text x="0" y="118" font-weight="600">名额可复用</text><text x="0" y="177" font-weight="600">在途数</text><text x="0" y="199">0…15</text>${marks}<line x1="${left}" y1="160" x2="${width-10}" y2="160" stroke="#7eab94" stroke-dasharray="4 4"/></svg>`;
    root.querySelector('[data-memory-credit-caption]').innerHTML=t.rtt>15?`<strong>先发15笔，再等${t.rtt-15}个模型 cycle。</strong> 到 cycle ${t.rtt}，第一笔名额可复用，读口继续发射。蓝格是请求，绿格是名额归还；在途名额由下方柱高表示。`:`<strong>R≤15：第一笔名额已在用尽credit之前归还。</strong> 因而能够持续每cycle一笔；增加名额也不能超过读口上限。`;
    root.querySelector('[data-memory-credit-stats]').innerHTML=`<div><small>每 MC 稳态发射率</small><strong>${t.rate.toFixed(3)}</strong><span>次 / cycle</span></div><div><small>16 KiB Weight 平均供数间隔</small><strong>${t.cyclesPerMiniblock.toFixed(3)}</strong><span>同域 cycle / miniblock</span></div><div><small>按400 MHz条件换算</small><strong>${(t.bytesPerCycle*400/1e6).toFixed(3)}</strong><span>TB/s / core · 非实测</span></div>`;
    root.querySelector('[data-memory-credit-equation]').textContent=`min(1, 15/${t.rtt}) 次/cycle × 256 MC × 32 B = ${t.bytesPerCycle.toFixed(1)} B/cycle。每个miniblock需要每MC两笔读。`;
  };
  input.addEventListener('input',update);
  root.querySelector('[data-memory-credit-reset]').addEventListener('click',()=>{input.value=23;update();});
  root.querySelector('[data-memory-credit-zoom]').addEventListener('click',()=>{if(typeof openFigureDialog==='function')openFigureDialog(chart.querySelector('svg'),'固定15个名额，R为有效周转时间。显示请求发射、名额可复用和在途数，属于条件模型。','pe-memory-credit');});
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(Math.round(chart.clientWidth)!==previousWidth)update();});
  if(resize)resize.observe(chart);
  const removal=new MutationObserver(()=>{if(root.isConnected)return;if(resize)resize.disconnect();removal.disconnect();delete root.dataset.peMemoryReady;});
  removal.observe(document.body,{childList:true,subtree:true});update();
}
