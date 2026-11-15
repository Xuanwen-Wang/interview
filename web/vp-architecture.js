'use strict';

// These models describe logical data and causal events, never RTL cycle timing.
const VPArchitecture = (() => {
  const WIDTH = 4096, ROWS = 4, WINDOW = 128;
  function locate(dtype, row, column, width=WIDTH) {
    if (!['bf16','fp32'].includes(dtype) || !Number.isInteger(row) || row<0 || row>=ROWS ||
        !Number.isInteger(width) || width<1 || !Number.isInteger(column) || column<0 || column>=width)
      throw new RangeError('Invalid tensor coordinate or format');
    const bytes = dtype==='bf16' ? 2 : 4, elements = 128/bytes;
    const group = Math.floor(column/elements), first = group*elements;
    const position = column-first;
    return {dtype,row,column,width,bytes,elements,group,first,
      valid:Math.min(elements,width-first), offset:(row*width+column)*bytes,
      byteInGroup:position*bytes, engine:position<32?'A':'B', lane:position%32,
      window:Math.floor(column/WINDOW), position};
  }

  function reduction(row, step, width=WIDTH, window=WINDOW) {
    if (!Number.isInteger(row) || row<0 || row>=ROWS || !Number.isInteger(width) || width<1 ||
        !Number.isInteger(window) || window<1) throw new RangeError('Invalid reduction geometry');
    const windows = Math.ceil(width/window), last = 2*windows+1;
    if (!Number.isInteger(step) || step<0 || step>last) throw new RangeError('Invalid reduction step');
    const collected = Math.min(step,windows), value=row+1;
    const processed = Math.min(width,collected*window), sum=processed*value*value;
    const coefficient = step>windows ? 1/Math.sqrt(sum/width+1e-6) : null;
    const emitted = Math.max(0,step-windows-1);
    return {row,step,width,window,windows,last,value,collected,processed,sum,coefficient,emitted,
      output:coefficient===null?null:value*coefficient,done:step===last};
  }

  function pipeline(scenario='normal') {
    if (!['normal','late-y','blocked-write'].includes(scenario)) throw new RangeError('Invalid scenario');
    const states=[];
    let s={x:null,y:null,z:null,phase:0,waiting:false,pending:0,done:false};
    const add=(title,note,update)=>{s={...s,...update,title,note};states.push({...s});};
    add('最后一组尚未进入计算','配置与前面各组的工作已经就绪；这里只放大最后 64 个元素。',{});
    add('X 进入主数据通路','以其中一个元素为例，BF16 的 1.5 转成 FP32 后数值仍为 1.5。',{x:1.5,phase:1});
    if(scenario==='late-y') {
      add('MUL 等待第二操作数','X 已就绪，Y 尚未到达。主值需要保持，不能凭空消耗一组辅助数据。',{phase:2,waiting:true});
      add('等待继续，数值保持','这是第二个教学观察点，不对应指定数量的硬件时钟。',{waiting:true});
    }
    add('辅助 Y 已配对','与该组匹配的 Y=-2 进入所选 FIFO 路径，MUL 可以消费这一对输入。',{y:-2,phase:2,waiting:false});
    add('MUL 得到 FP32 结果','此元素的结果为 -3；其他 lane 对各自匹配的元素执行同一种运算。',{z:-3,x:null,y:null,phase:3});
    add('PostCal 整理输出','本例将最后 64 个结果转换、打包成 128 B BF16 有效载荷。',{phase:4});
    if(scenario==='blocked-write') {
      add('下游暂不能接收','输出数据已经有效，写口尚未接受；结果必须保持。',{waiting:true});
      add('反压期间保持输出','下游阻塞可以向前传播；已有结果不会因为等待而重新计算。',{waiting:true});
    }
    add('最后的写请求已接受','还有一笔响应未排空，此时仍不能据此判定该操作完成。',{phase:5,pending:1,waiting:false});
    add('写响应排空，满足完成条件','限定普通 tensor 输出；参数装载等操作有不同的完成路径。',{pending:0,phase:6,done:true});
    return states;
  }
  return {WIDTH,ROWS,WINDOW,locate,reduction,pipeline};
})();

let vpArchitectureCleanup=[];
function destroyVpArchitecture() {
  vpArchitectureCleanup.forEach(fn=>fn());vpArchitectureCleanup=[];
}

function initVpArchitecture(chapter) {
  if(chapter.id!=='hw-vp-architecture')return;
  if(!currentRoute()[2])highlightReadingSection(chapter.readingStages[0].sections[0]);
  document.querySelectorAll('[data-vp-lab]').forEach(root=>{
    root.dataset.ready='true';
    const kind=root.dataset.vpLab;
    const controls=document.createElement('div');controls.className='vp-controls';
    const view=document.createElement('div');view.className='vp-live';
    const footer=document.createElement('div');footer.className='vp-transport';
    const status=document.createElement('p');status.className='vp-event';status.setAttribute('aria-live','polite');
    root.prepend(controls,view,status,footer);
    let cursor=0, row=1, dtype='bf16', scenario='normal', timer=null;
    const boundaries=[0,31,32,37,63,64,127,128,4095];
    const count=()=>kind==='packets'?boundaries.length:kind==='reduction'?66:VPArchitecture.pipeline(scenario).length;
    const title=kind==='packets'?'数据包与 lane':kind==='reduction'?'归约与行系数':'输入配对与写回';
    if(kind==='packets')controls.innerHTML='<label>输入格式 <select name="dtype"><option value="bf16">BF16 · 普通 wide</option><option value="fp32">FP32 · 普通输入</option></select></label>';
    if(kind!=='pipeline')controls.innerHTML+='<label>观察行 <select name="row">'+[0,1,2,3].map(r=>`<option value="${r}" ${r===1?'selected':''}>第 ${r} 行</option>`).join('')+'</select></label>';
    if(kind==='pipeline')controls.innerHTML='<label>观察场景 <select name="scenario"><option value="normal">输入配对后完成</option><option value="late-y">第二操作数晚到</option><option value="blocked-write">写端反压</option></select></label>';
    controls.innerHTML+='<span class="vp-lab-kind">可步进的教学示意 · 非 RTL 时钟</span>';
    footer.innerHTML=`<div class="vp-buttons"><button type="button" data-action="prev">← 前一步</button><button type="button" data-action="play" aria-label="播放${title}">播放</button><button type="button" data-action="next">后一步 →</button><button type="button" data-action="reset">重置</button></div><label class="vp-slider">步骤 <input type="range" min="0" max="${count()-1}" value="0" aria-label="${title}步骤"><output>1 / ${count()}</output></label>`;
    const slider=footer.querySelector('input'), output=footer.querySelector('output'), play=footer.querySelector('[data-action="play"]');
    function pause(){if(timer!==null)clearInterval(timer);timer=null;play.textContent='播放';play.setAttribute('aria-label','播放'+title);}
    function format(v){return v===null?'尚未产生':String(Number(Number(v).toPrecision(8)));}
    function packetView() {
      const v=VPArchitecture.locate(dtype,row,boundaries[cursor]);
      const matrix=Array.from({length:4},(_,r)=>`<b class="vp-row-label">r=${r}</b>${Array.from({length:32},(_,t)=>`<span class="vp-window ${r===row&&t===v.window?'is-selected':''}" title="第 ${r} 行，特征 ${t*128}…${t*128+127}">${t}</span>`).join('')}`).join('');
      const lanes=engine=>Array.from({length:32},(_,lane)=>{
        const position=lane+(engine==='B'?32:0), active=position<v.valid, c=v.first+position;
        return `<span class="vp-lane ${active?'':'is-empty'} ${active&&c===v.column?'is-selected':''}"><small>lane ${lane}</small><b>${active?c:'—'}</b></span>`;
      }).join('');
      view.innerHTML=`<div class="vp-metrics"><div><small>同一个逻辑元素</small><strong>X[${row}, ${v.column}]</strong><span>4 行 × 4096 个特征</span></div><div><small>相对 tensor 起点的字节偏移</small><strong>${v.offset.toLocaleString()} B</strong><span>(${row} × 4096 + ${v.column}) × ${v.bytes} B</span></div><div><small>普通输入组内的位置</small><strong>${v.engine} · lane ${v.lane}</strong><span>第 ${v.group} 组，组内第 ${v.byteInGroup} 字节</span></div></div><div class="vp-matrix-title"><strong>完整输入</strong><span>横轴：每格 128 个连续特征；窗口编号 0…31 →</span></div><div class="vp-matrix">${matrix}</div><div class="vp-packet-strip"><b>放大第 ${v.group} 个输入组</b><span>特征 ${v.first}…${v.first+v.elements-1}</span><strong>128 B = ${v.elements} × ${v.bytes} B</strong></div><div class="vp-engines"><section><h5>引擎 A · 32 lane</h5><div class="vp-lanes">${lanes('A')}</div></section><section><h5>引擎 B · 32 lane${dtype==='fp32'?'（本组无有效元素）':''}</h5><div class="vp-lanes">${lanes('B')}</div></section></div><p class="vp-caption">格内大数字是原 tensor 的特征坐标；lane 是引擎内的位置。${dtype==='bf16'?'64 个 BF16 展宽为 64 个 FP32，数值不变。':'一个满载荷只容纳 32 个 FP32。此处不把 B 的空位计成有效计算。'}</p>`;
      status.textContent=`当前追踪 X[${row},${v.column}]。下一步观察边界处的输入组和 lane 如何改变；组号从每行 0 开始。`;
    }
    function reductionView() {
      const s=VPArchitecture.reduction(row,cursor);
      const phase=cursor<=32?'第一遍：统计平方和':cursor===33?'整行完成：形成行系数':'第二遍：读取原输入并输出';
      const windows=Array.from({length:32},(_,i)=>`<span class="vp-reduce-window ${i<s.emitted?'is-output':i<s.collected?'is-collected':''}"><b>${i}</b><small>${i<s.emitted?'已输出':i<s.collected?'已统计':'待统计'}</small></span>`).join('');
      view.innerHTML=`<div class="vp-phase"><span>第 ${row} 行</span><strong>${phase}</strong></div><p>教学数据：本行每个 X 都取 ${s.value}，γ 都取 1，ε = 10⁻⁶。完整行有 4096 个特征，分成 32 个 128 元素观察窗口。</p><div class="vp-reduce-windows">${windows}</div><div class="vp-state-table"><div><small>原始 X[r,:]</small><strong>保留在 L2</strong><span>统计后仍需要第二遍读取</span></div><div><small>数学部分和 S[r]</small><strong>${s.sum.toLocaleString()}</strong><span>${s.processed} × ${s.value}² · ${s.collected}/32 个窗口</span></div><div><small>行系数 a[r]</small><strong>${format(s.coefficient)}</strong><span>${s.coefficient===null?'整行未完成，不能消费最终系数':'1 / √(S[r]/4096 + ε)'}</span></div><div><small>本行输出</small><strong>${s.emitted}/32 个窗口</strong><span>${s.output===null?'等待最终行系数':'每个元素 ≈ '+format(s.output)}</span></div></div><p class="vp-caption">蓝绿：已统计；紫色：已输出。部分和显示数学依赖，其物理落点由具体实现决定；反馈寄存器与 L2 都有各自的使用条件。</p><div class="vp-presets"><button type="button" data-jump="1">首窗口</button><button type="button" data-jump="32">整行统计完成</button><button type="button" data-jump="33">系数就绪</button><button type="button" data-jump="65">本行输出完成</button></div>`;
      status.textContent=s.done?'本行输出已完成。切换观察行会从空统计状态重新开始，不能沿用上一行系数。':s.coefficient===null?`已收集 ${s.processed}/4096 个元素；还有 ${4096-s.processed} 个元素属于同一行统计。`:'行系数已形成，下一步将它用于原输入；归约不会替你保存一份可任意读取的原向量。';
    }
    function pipelineView() {
      const s=VPArchitecture.pipeline(scenario)[cursor];
      const names=['配置就绪','PreCal','MUL 输入','MUL 结果','PostCal','写请求','完成'];
      view.innerHTML=`<div class="vp-pipeline-path">${names.map((name,i)=>`<div class="${i===s.phase?'is-current':i<s.phase?'is-past':''}"><small>${i+1}</small><b>${name}</b></div>`).join('')}</div><div class="vp-phase ${s.waiting?'is-waiting':''}"><span>${s.waiting?'等待条件':'当前事件'}</span><strong>${s.title}</strong></div><p class="vp-explanation">${s.note}</p><div class="vp-state-table"><div><small>主流中的示例 X</small><strong>${s.x===null&&s.z!==null?'已消费':format(s.x)}</strong><span>${s.x===null&&s.z!==null?'已被本次 MUL 消费':'对应最后一组的一个元素'}</span></div><div><small>辅助 FIFO 的示例 Y</small><strong>${s.y===null&&s.z!==null?'已消费':format(s.y)}</strong><span>${s.y===null&&s.z!==null?'配对数据已被消费':'标签需要匹配本次消费者'}</span></div><div><small>示例结果</small><strong>${format(s.z)}</strong><span>${s.waiting&&s.z!==null?'等待期间保持结果':'1.5 × (−2) = −3'}</span></div><div><small>未排空的写响应</small><strong>${s.pending}</strong><span>${s.done?'满足本例的普通完成条件':'操作尚未宣告完成'}</span></div></div><p class="vp-caption">范围：最后一组 64 个 BF16 元素；前 255 组及其响应已经处理。等待观察点由教学场景指定，不能据此计算延迟或启动间隔。</p>`;
      status.textContent=s.done?'全部输入、最后输出及响应条件均已满足。本示意结束。':s.note;
    }
    function render() {
      if(kind==='packets')packetView();else if(kind==='reduction')reductionView();else pipelineView();
      slider.max=String(count()-1);slider.value=String(cursor);output.textContent=`${cursor+1} / ${count()}`;
      footer.querySelector('[data-action="prev"]').disabled=cursor===0;
      footer.querySelector('[data-action="next"]').disabled=cursor===count()-1;
      root.dataset.step=String(cursor);
    }
    function move(value){pause();cursor=Math.min(count()-1,Math.max(0,value));render();}
    footer.addEventListener('click',e=>{
      const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
      if(action==='play') {
        if(timer!==null){pause();return;}
        if(cursor===count()-1)cursor=0;
        render();play.textContent='暂停';play.setAttribute('aria-label','暂停'+title);
        timer=setInterval(()=>{if(!root.isConnected||document.hidden){pause();return;}cursor++;render();if(cursor>=count()-1)pause();},800);
      } else move(action==='reset'?0:cursor+(action==='next'?1:-1));
    });
    controls.addEventListener('change',e=>{
      if(e.target.name==='row')row=Number(e.target.value);
      if(e.target.name==='dtype')dtype=e.target.value;
      if(e.target.name==='scenario')scenario=e.target.value;
      move(0);
    });
    view.addEventListener('click',e=>{const jump=e.target.closest('[data-jump]');if(jump)move(Number(jump.dataset.jump));});
    slider.addEventListener('input',()=>move(Number(slider.value)));
    const hidden=()=>{if(document.hidden)pause();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('beforeprint',pause);
    vpArchitectureCleanup.push(()=>{pause();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('beforeprint',pause);});
    render();
  });
}

if(typeof module!=='undefined'&&module.exports)module.exports=VPArchitecture;
