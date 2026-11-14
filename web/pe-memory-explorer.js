'use strict';

let peMemoryExplorerId=0;

// Address order, accepted consumption and conditional timing have separate views.
function initPeMemoryExplorers(scope=document) {
  scope.querySelectorAll('[data-pe-memory-explorer]').forEach(root=>{
    if(root.dataset.peMemoryReady)return;
    root.dataset.peMemoryReady='true';
    if(root.dataset.peMemoryExplorer==='credit')renderPeMemoryCredit(root);
    else renderPeMemoryExplorer(root);
  });
}

function renderPeMemoryExplorer(root) {
  const execution=root.dataset.peMemoryExplorer==='execution';
  const model=PEMemoryModel,uid=`pe-memory-${++peMemoryExplorerId}`;
  const view=key=>root.querySelector(`[data-memory-view="${key}"]`);
  const control=key=>root.querySelector(`[data-memory-control="${key}"]`);
  const action=key=>root.querySelector(`[data-memory-action="${key}"]`);
  const hex=n=>`0x${n.toString(16).padStart(6,'0')}`;
  const rowColors=['#117e83','#c8733b','#726c9c','#497c59'];
  const lessons={
    order:{scenario:'main',base:0},offset:{scenario:'main',base:557056},
    wide:{scenario:'wide',base:0},narrow:{scenario:'narrow',base:0},blocked:{scenario:'blocked',base:0}
  };
  root.classList.add('pe-memory-explorer',execution?'pe-memory-execution':'pe-memory-layout');
  const transport=`<div class="pe-memory-transport"><button type="button" data-memory-action="play" aria-pressed="false">播放</button><button type="button" data-memory-action="previous">上一步</button><button type="button" data-memory-action="next">下一步</button><button type="button" data-memory-action="reset">重头开始</button><label class="pe-memory-speed">速度<select data-memory-control="speed" aria-label="示意步进速度"><option value="1500">慢</option><option value="900" selected>标准</option><option value="450">快</option></select></label><label class="pe-memory-progress"><span>进度</span><input type="range" min="0" value="0" data-memory-control="progress" aria-label="${execution?'选择成功消费事件':'选择miniblock读取步骤'}"></label><strong data-memory-view="step"></strong><button type="button" data-memory-action="zoom">放大</button></div>`;
  const grouping='<label>有效 MTK<select data-memory-control="mtk"><option>1</option><option selected>2</option><option>4</option></select></label><label>有效 MTC<select data-memory-control="mtc"><option>4</option><option selected>8</option><option>16</option></select></label>';
  root.innerHTML=`<header class="pe-memory-head"><h4>${execution?'同一份 Weight，配合四行 Act 重放':'沿矩阵读 Weight，再看 MC row 怎样变化'}</h4><p>${execution?'一次前进代表一次成功消费。跟着高亮路径看：Weight 保持不变，Act 换行，Out 更新对应的部分和槽。':'每一步读取一个完整 miniblock。先看“同一 CI 位置往下读，再向右推进”，随后比较地址起点和物理跨度。'}</p></header><div class="pe-memory-body">
    ${execution?'':'<label class="pe-memory-lesson">观察任务<select data-memory-control="lesson"><option value="order">① 主例读序：#0 → #32 → #1 → #33</option><option value="offset">② 相同布局换起点：观察前四步反复切 row</option><option value="wide">③ 扩到 CI8192：为什么对齐也不够？</option><option value="narrow">④ 只缩计算 TC：存储跨度会改变吗？</option><option value="blocked">⑤ 改成 blocked：观察一个 CI2048 子块</option><option value="custom" hidden>自定义参数</option></select></label>'}
    <p class="pe-memory-scope" data-memory-view="scope"></p>
    <div class="pe-memory-canvas"><div class="pe-memory-matrix-scroll" data-memory-view="${execution?'flow':'grid'}"></div>${execution?'':'<p class="pe-memory-group-caption" data-memory-view="group"></p>'}</div>
    ${execution?'':'<p class="pe-memory-legend"><span><i class="current"></i>当前块</span><span><i class="visited"></i>已读取</span><span><i class="group"></i>当前 minitile</span><span>箭头：上一步 → 这一步</span></p>'}
    ${transport}
    ${execution?'<div class="pe-memory-event" data-memory-view="event" aria-live="polite"></div><p class="pe-memory-ownership" data-memory-view="ownership"></p>':'<div class="pe-memory-cards" data-memory-view="cards"></div><div class="pe-memory-event" data-memory-view="event" aria-live="polite"></div><div class="pe-memory-history-line"><span>最近8块<br><small>颜色标记 MC row</small></span><div class="pe-memory-history" data-memory-view="history"></div></div><p class="pe-memory-read-count" data-memory-view="stats"></p>'}
    <details class="pe-memory-advanced"><summary>${execution?'展开 AL1 / OL1 地址表与分组参数':'调整 minitile、布局与地址参数'}</summary><div class="pe-memory-controls">${execution?'':'<label>源布局<select data-memory-control="scenario"><option value="main">Dense CI4096</option><option value="wide">Dense CI8192</option><option value="narrow">CI8192 · TC2048</option><option value="blocked">独立 blocked 子块</option></select></label><label>Weight 起点<select data-memory-control="base"><option value="0">对齐起点 0</option><option value="557056">偏移 0x88000</option></select></label>'}${grouping}<button type="button" data-memory-action="example">主例：跳到下一组 CI</button></div>${execution?'<div class="pe-memory-local"><div data-memory-view="al1"></div><div data-memory-view="ol1"></div></div>':''}</details>
    <details class="pe-memory-notes"><summary>范围与计数说明</summary><p data-memory-view="boundary"></p></details>
    <p class="pe-memory-print">${execution?'静态读图：当前高亮行使用同一份 Weight，更新自己的 Out 槽；右侧是本 PE 的局部部分和。四行依次消费，完整 CI 与当前 CO 分组都接受完后才具备 OL1 面交接条件。':'静态读图：存储块号由源布局决定，读取次序由 minitile 决定。图中的当前块、最近请求轨迹和 row 状态保留打印时的选择；不是逐周期波形。'}</p>
  </div>`;
  let sequence,cursor=0,timer=null,disposed=false,previousWidth=0;
  const listeners=new AbortController();
  const listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:listeners.signal});
  const count=()=>execution?sequence.acceptedBeats:sequence.blockCount;
  const current=()=>model.eventAt(sequence,execution?cursor:cursor*4);
  function pause(){if(timer!==null)window.clearInterval(timer);timer=null;action('play').textContent='播放';action('play').setAttribute('aria-pressed','false');}
  function matrix(b) {
    const s=sequence,columns=s.sourceUnits,scroller=view('grid');
    const available=Math.round(scroller.clientWidth)||1000,width=columns>32?Math.max(1320,available):available;
    const x0=118,y0=32,rh=39,cell=(width-x0-12)/columns,height=y0+4*rh+7;
    previousWidth=available;
    const seen=new Set(s.blocks.slice(0,b.ordinal).map(x=>x.index));
    const labelColumns=[...new Set([...Array.from({length:Math.ceil(columns/4)},(_,i)=>4*i),columns-1])];
    let labels=labelColumns.map(c=>`<text x="${x0+(c+.5)*cell}" y="21" text-anchor="middle">c${c}</text>`).join(''),cells='';
    for(let k=0;k<s.kUnits;k++) {
      labels+=`<text x="0" y="${y0+k*rh+25}">k${k} · CO ${128*k}…</text>`;
      for(let c=0;c<columns;c++) {
        const index=k*columns+c,selected=index===b.index,visited=seen.has(index),inScope=c<s.cUnits;
        cells+=`<g ${inScope?`data-memory-block="${index}"`:''}><title>${inScope?'':'本次未访问：'}Weight(k${k},c${c}) · #${index} · CO ${k*128}…${k*128+127} / CI ${c*128}…${c*128+127} · ${hex(s.config.base+index*16384)}</title><rect x="${x0+c*cell+1}" y="${y0+k*rh+2}" width="${cell-2}" height="${rh-4}" rx="2" fill="${selected?'#c8733b':visited?'#c5e3d9':inScope?'#edf0ed':'#fafbf8'}" stroke="${selected?'#914716':inScope?'#d8e0dc':'#e3e7df'}" stroke-width="${selected?2:1}" stroke-dasharray="${inScope?'none':'3 3'}" class="${selected?'is-current':''}"/></g>`;
      }
    }
    const p=s.blocks[b.ordinal-1];
    const arrow=p?`<path d="M${x0+(p.cb+.5)*cell} ${y0+(p.kb+.5)*rh} L${x0+(b.cb+.5)*cell} ${y0+(b.kb+.5)*rh}" fill="none" stroke="#984e25" stroke-width="2.5" marker-end="url(#${uid}-arrow)"/>`:'';
    scroller.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;${columns>32?'min-width:1320px;':''}" font-family="system-ui,sans-serif" font-size="14" fill="#28464d" role="img" aria-label="Weight块矩阵：纵轴CO块k0到k3，横轴CI块c0到c${columns-1}。每格128乘128个FP8。当前存储块${b.index}。"><defs><marker id="${uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#984e25"/></marker></defs>${labels}${cells}<rect x="${x0+b.cg*cell-2}" y="${y0+b.kg*rh-1}" width="${b.actualC*cell+4}" height="${b.actualK*rh+2}" rx="4" fill="none" stroke="#117e83" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>${arrow}</svg>`;
    view('group').innerHTML=`当前 minitile：<strong>k${b.kg}…k${b.kg+b.actualK-1} × c${b.cg}…c${b.cg+b.actualC-1}</strong>；本次读 <strong>(k${b.kb}, c${b.cb})</strong>，存储编号 <strong>#${b.index}</strong>。`;
    if(columns>32){const box=scroller.querySelector('.is-current').getBoundingClientRect(),port=scroller.getBoundingClientRect();if(box.right>port.right-12)scroller.scrollLeft+=box.right-port.right+12;else if(box.left<port.left+12)scroller.scrollLeft-=port.left-box.left+12;}else scroller.scrollLeft=0;
  }
  function layoutState(e) {
    const s=sequence,c=s.config,b=e.block,p=s.blocks[b.ordinal-1];
    const context={main:`Weight[512,4096] · 4×32块 · CO带间距512 KiB`,wide:`Weight[512,8192] · 4×64块 · CO带间距1 MiB`,narrow:`只计算首个CI2048 · SC仍为8192 · CO带间距仍为1 MiB`,blocked:`首个独立Weight_block[512,2048] · 块内SC=TC=2048 · CO带间距256 KiB`};
    view('scope').textContent=`${context[c.scenario]} · 每格16 KiB · w4c${c.mtc}k${c.mtk} · base=${hex(c.base)}`;
    matrix(b);
    view('cards').innerHTML=`<div><small>① miniblock 坐标</small><strong>#${b.index} · (k${b.kb}, c${b.cb})</strong><span>CO ${b.kb*128}…${b.kb*128+127} / CI ${b.cb*128}…${b.cb*128+127}</span></div><div><small>② 每核 Weight 字节地址</small><strong>${hex(b.byteAddress)}</strong><span>${p?`比上一块 ${b.byteAddress>=p.byteAddress?'+':''}${(b.byteAddress-p.byteAddress)/1024} KiB`:`base + #${b.index} × 16 KiB`}</span></div><div><small>③ 单 MC 的两笔32 B</small><strong>row ${b.requests[0].row} → ${b.requests[1].row}</strong><span>word ${b.requests[0].word}、${b.requests[1].word} · column ${b.requests[0].column}、${b.requests[1].column}</span></div>`;
    const switched=p&&p.requests[1].row!==b.requests[0].row;
    view('event').dataset.switch=String(Boolean(switched));
    const title=!p?`第一个块落在 row ${b.requests[0].row}`:switched?`换 row：${p.requests[1].row} → ${b.requests[0].row}`:`仍在 row ${b.requests[0].row}`;
    const move=!p?'点击下一步：CI位置不变，先去下一条CO带。':b.kg!==p.kg?'完整CI已遍历，进入下一组CO带。':b.cg!==p.cg?'进入下一组CI块，minitile虚线框向右移动。':b.cb!==p.cb?'当前CI位置的CO块已读完，向右推进一个CI块。':'CI位置不变，往下读同组的下一条CO带。';
    view('event').innerHTML=`<strong>${title}</strong><p>${move} ${switched?'行地址变了；若需更换已打开的行，MC要经历PRE / ACT及相关等待。实际耗时还受时序与背压约束。':p?'这一跳没有增加行切换；仍需满足MC的其他时序与握手约束。':'第一笔不计入相邻请求的换行数。'}</p>`;
    view('history').innerHTML=s.blocks.slice(Math.max(0,b.ordinal-7),b.ordinal+1).map(x=>`<div style="--pe-row-color:${rowColors[x.requests[0].row%rowColors.length]}" ${x===b?'aria-current="step"':''}><strong>#${x.index} <b>row ${x.requests[0].row}</b></strong><span>(k${x.kb}, c${x.cb})</span></div>`).join('');
    const requests=s.blocks.slice(0,b.ordinal+1).flatMap(x=>x.requests);
    const changes=requests.reduce((n,r,i)=>n+Number(i>0&&r.row!==requests[i-1].row),0);
    view('stats').textContent=`单MC已发出 ${requests.length} / ${s.requestsPerMc} 笔请求 · 已发生 ${changes} 次相邻请求row变化 · 完整本场景 ${s.rowSwitches} 次`;
    view('boundary').textContent=`普通KC、FP8、完整128×128块、双hub、无UScale。256个MC各返回两笔32 B，共一份16 KiB miniblock。图只模拟块请求次序；选择的有效MTC/MTK不移动已有Weight字节。row映射限定splicing=1、bank-map=0xe4的低地址范围。${c.candidate?'扩展场景是教学对照；blocked仅展示一个独立打包子块，完整计算还需配套pack、descriptor和跨块结果合并。':''}播放速度不是硬件周期；没有模拟credit、MC服务流水、背压或PE内部时序。`;
  }
  function executionDiagram(e) {
    const b=e.block,w=e.wLocal,firstY=103,rowH=45,gap=11,cy=204;
    let arrows='',activeArrows='',rows='';
    for(let m=0;m<4;m++) {
      const y=firstY+m*(rowH+gap),center=y+rowH/2,active=m===w,done=m<w;
      const al1=m*b.actualC+b.cLocal,slot=b.kLocal*4+m;
      const route=`<path d="M254 ${center}H322V${cy}H409" fill="none" stroke="${active?'#2a7896':'#dce5e2'}" stroke-width="${active?3:1.5}" ${active?`marker-end="url(#${uid}-act)"`:''}/><path d="M586 ${cy}H665V${center}H733" fill="none" stroke="${active?'#85649a':'#e2dce7'}" stroke-width="${active?3:1.5}" ${active?`marker-end="url(#${uid}-out)"`:''}/>`;
      if(active)activeArrows+=route;else arrows+=route;
      rows+=`<g data-memory-act-row="${m}"><rect x="12" y="${y}" width="242" height="${rowH}" rx="5" fill="${active?'#d9edf2':done?'#edf4ef':'#fafbf9'}" stroke="${active?'#2a7896':'#d7e2de'}" stroke-width="${active?2:1}"/><text x="27" y="${y+28}" font-weight="${active?700:500}">Act m${m}</text><text x="238" y="${y+28}" text-anchor="end">AL1 word ${al1}</text></g><g data-memory-out-row="${m}"><rect x="733" y="${y}" width="255" height="${rowH}" rx="5" fill="${active?'#e9def0':done?'#f0ecf4':'#faf9fb'}" stroke="${active?'#85649a':'#ded8e4'}" stroke-width="${active?2:1}"/><text x="748" y="${y+28}" font-weight="${active?700:500}">Out m${m}</text><text x="971" y="${y+28}" text-anchor="end">OL1 slot ${slot}</text></g>`;
    }
    view('flow').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 353" width="100%" font-family="system-ui,sans-serif" font-size="16" fill="#28464d" role="img" aria-label="同一Weight块${b.index}第${w+1}次成功消费：Act输入行${w}，AL1 word${e.al1Word}，更新Out行${w}的OL1 slot${e.ol1Slot}。"><defs><marker id="${uid}-act" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#2a7896"/></marker><marker id="${uid}-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#85649a"/></marker><marker id="${uid}-weight" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#b57437"/></marker></defs><text x="12" y="51" font-size="19" font-weight="650">四行 Act</text><text x="12" y="79">本PE：CI ${e.ciFirst}…${e.ciLast}</text><text x="733" y="51" font-size="19" font-weight="650">四行 Out 的独立部分和</text><text x="733" y="79">本ALU：CO ${e.outputColumn}</text><rect x="350" y="7" width="300" height="65" rx="5" fill="#fff2e4" stroke="#d4ac81"/><text x="500" y="32" text-anchor="middle" font-size="18" font-weight="650">保持 Weight #${b.index} · (k${b.kb}, c${b.cb})</text><text x="500" y="56" text-anchor="middle">本块第 ${w+1} / 4 次消费</text><path d="M500 72V161" fill="none" stroke="#b57437" stroke-width="3" marker-end="url(#${uid}-weight)"/><text x="512" y="114" font-size="15" fill="#88572b">本ALU的16项Weight</text>${arrows}${activeArrows}<rect x="410" y="163" width="176" height="82" rx="7" fill="#f1f5ee" stroke="#97b19d" stroke-width="2"/><text x="498" y="193" text-anchor="middle" font-size="20" font-weight="650">16项乘加</text><text x="498" y="221" text-anchor="middle" font-size="15">group2 / PE4 / ALU5</text>${rows}<text x="500" y="341" text-anchor="middle" font-size="15" fill="#5e756d">${e.releaseWeight?'四行均已接受本块；随后可移走FIFO头部，换入下一份Weight。':'成功接受后换下一行；同一Weight继续留在FIFO头部。'}</text></svg>`;
  }
  function executionState(e) {
    const s=sequence,c=s.config,b=e.block;
    view('scope').textContent=`Act[4,4096] · Weight[512,4096] · Out[4,512] · w4c${c.mtc}k${c.mtk} · 本图放大一个ALU的16项乘加；示意接受次序，不表示真实时钟拍。`;
    executionDiagram(e);
    view('event').dataset.switch='false';
    view('event').innerHTML=`<strong>本块第 ${e.wLocal+1}/4 次接受：Act m${e.wLocal} → Out m${e.wLocal}</strong><p>AL1 word <b>${e.al1Word}</b> = m${e.wLocal} × ${b.actualC} + 局部c${b.cLocal}；OL1 slot <b>${e.ol1Slot}</b> = 局部k${b.kLocal} × 4 + m${e.wLocal}。${e.releaseWeight?'这次接受后，当前Weight块的四行重放完成。':'Weight保持，下一次只换Act行及其Out槽。'}</p>`;
    const completion=!e.completesC?'后续CI块继续累加，跨C minitile也不提前交接OL1。':e.outputTileComplete?'当前CO分组全部行和输出块的CI贡献已接受，逻辑上具备OL1面交接条件；内部写回、8路归约与排空仍要完成。':'当前行、当前输出的CI贡献已齐，但其他行或输出块尚未接受完，OL1整面仍不能交接。';
    view('ownership').innerHTML=`<strong>Out[m${e.wLocal}, CO${e.outputColumn}] 的本PE部分和</strong> 已覆盖 ${e.partialTerms} 项。${completion}`;
    const local=root.querySelector('.pe-memory-local');local.classList.toggle('is-wide',b.actualC>8);
    let al1='<span class="pe-memory-grid-corner">Act</span>'+Array.from({length:b.actualC},(_,i)=>`<span class="pe-memory-grid-col">c${b.cg+i}</span>`).join('');
    for(let m=0;m<4;m++){al1+=`<span class="pe-memory-word-row">m${m}</span>`;for(let j=0;j<b.actualC;j++){const word=m*b.actualC+j;al1+=`<span class="pe-memory-word ${word===e.al1Word?'is-current':''}">${word}</span>`;}}
    view('al1').innerHTML=`<h5>AL1：每格一个16 B word</h5><div class="pe-memory-word-grid" style="grid-template-columns:34px repeat(${b.actualC},minmax(24px,1fr))">${al1}</div><p>行是输入m，列是CI块；局部地址=m×${b.actualC}+局部c。k不在地址中。</p>`;
    let ol1='<span class="pe-memory-grid-corner">Out</span>'+Array.from({length:b.actualK},(_,k)=>`<span class="pe-memory-grid-col">k${b.kg+k}</span>`).join('');
    for(let m=0;m<4;m++){ol1+=`<span class="pe-memory-word-row">m${m}</span>`;for(let k=0;k<b.actualK;k++){const slot=4*k+m;ol1+=`<span class="pe-memory-slot ${slot===e.ol1Slot?'is-current':''}">${slot}</span>`;}}
    view('ol1').innerHTML=`<h5>OL1：每格一个FP32部分和槽</h5><div class="pe-memory-slot-grid" style="grid-template-columns:34px repeat(${b.actualK},minmax(48px,1fr))">${ol1}</div><p>行是输入m，列是CO块；局部槽位=局部k×4+m。</p>`;
    view('boundary').textContent=`normal KC、FP8、无UScale；默认w4c8k2是本章教学配置，不是最新最优推荐。全阵列一份Weight块为16KiB，本图只画group2/PE4/ALU5的16项权重与输入配对，其他位置各自更新对应输出。完整问题共128个Weight块、512次逻辑成功接受、${s.macs.toLocaleString('en-US')} MAC。各group实际可错开接受，图未模拟SRAM或算术流水延迟。当前minitile使用${e.al1Words}/64个AL1 word、${e.ol1Slots}/16个OL1槽；不推断绝对ping/pong bank。`;
  }
  function render(){const e=current();if(execution)executionState(e);else layoutState(e);view('step').textContent=`${cursor+1} / ${count()}`;control('progress').value=cursor;control('progress').max=count()-1;control('progress').setAttribute('aria-valuetext',`第${cursor+1}/${count()}${execution?'次接受':'块'}，Weight块${e.block.index}`);action('previous').disabled=cursor===0;action('next').disabled=cursor===count()-1;}
  function configure(){pause();sequence=model.enumerate({scenario:control('scenario')?.value||'main',base:Number(control('base')?.value||0),mtc:Number(control('mtc').value),mtk:Number(control('mtk').value)});cursor=0;render();}
  function play(){if(cursor===count()-1)cursor=0;action('play').textContent='暂停';action('play').setAttribute('aria-pressed','true');render();timer=window.setInterval(()=>{if(!root.isConnected||document.hidden){pause();return;}cursor=Math.min(cursor+1,count()-1);render();if(cursor===count()-1)pause();},Number(control('speed').value));}
  listen(action('play'),'click',()=>{if(timer!==null)pause();else play();});
  listen(control('speed'),'change',()=>{const playing=timer!==null;pause();if(playing)play();});
  for(const [name,delta] of [['previous',-1],['next',1]])listen(action(name),'click',()=>{pause();cursor=Math.max(0,Math.min(count()-1,cursor+delta));render();});
  listen(action('reset'),'click',()=>{pause();cursor=0;render();});
  listen(control('progress'),'input',()=>{pause();cursor=Number(control('progress').value);render();});
  for(const name of ['scenario','base','mtc','mtk'])if(control(name))listen(control(name),'change',()=>{if(control('lesson'))control('lesson').value='custom';configure();});
  listen(action('example'),'click',()=>{if(control('scenario'))control('scenario').value='main';if(control('base'))control('base').value='0';if(control('lesson'))control('lesson').value='order';control('mtc').value='8';control('mtk').value='2';configure();cursor=execution?64:16;render();});
  if(!execution){
    listen(control('lesson'),'change',()=>{const lesson=lessons[control('lesson').value];if(!lesson)return;control('scenario').value=lesson.scenario;control('base').value=String(lesson.base);control('mtc').value='8';control('mtk').value='2';configure();});
    listen(view('grid'),'click',event=>{const target=event.target.closest('[data-memory-block]');if(!target)return;const index=sequence.blocks.findIndex(b=>b.index===Number(target.dataset.memoryBlock));if(index<0)return;pause();cursor=index;render();});
  }
  listen(action('zoom'),'click',()=>{pause();if(typeof openFigureDialog==='function')openFigureDialog(view(execution?'flow':'grid').querySelector('svg'),execution?'同一Weight依次配合四行Act；高亮路径同时对应AL1 word与OL1部分和槽。这里只表示成功消费次序。':'纵轴为CO块，横轴为CI块；每格16 KiB。橙色是当前块，虚线是当前minitile。','pe-memory');});
  listen(document,'visibilitychange',()=>{if(document.hidden)pause();});listen(window,'beforeprint',pause);
  const visibility=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)pause();});if(visibility)visibility.observe(root);
  const resize=!execution&&typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{if(sequence&&Math.round(view('grid').clientWidth)!==previousWidth)matrix(current().block);}):null;if(resize)resize.observe(view('grid'));
  const removal=new MutationObserver(()=>{if(root.isConnected||disposed)return;disposed=true;pause();listeners.abort();removal.disconnect();if(visibility)visibility.disconnect();if(resize)resize.disconnect();delete root.dataset.peMemoryReady;});removal.observe(document.body,{childList:true,subtree:true});configure();
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
    chart.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 242" style="width:100%" font-family="system-ui, sans-serif" font-size="13" fill="#29494e" role="img" aria-label="15个credit、R=${t.rtt}的条件时间轴：发出请求、名额可复用、在途数三行。"><text x="0" y="23">模型 cycle →</text>${ticks}<text x="0" y="63" font-weight="600">发出请求</text><text x="0" y="118" font-weight="600">名额可复用</text><text x="0" y="177" font-weight="600">在途数</text><text x="0" y="199">0…15</text>${marks}<line x1="${left}" y1="160" x2="${width-10}" y2="160" stroke="#7eab94" stroke-dasharray="4 4"/><line x1="${left+t.rtt*dx}" y1="34" x2="${left+t.rtt*dx}" y2="220" stroke="#c8733b" stroke-width="1.5" stroke-dasharray="4 4"/><text x="${left+t.rtt*dx}" y="239" text-anchor="middle" font-size="12" fill="#935f32">R=${t.rtt}：首个名额可复用</text></svg>`;
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
