'use strict';

// These formulas describe fictional teaching scenarios, not measured hardware.
var PerformanceModel = Object.freeze({
  roofline({m=64,n=4096,k=4096,peakTflops=200,bandwidthTbps=2,overheadUs=5}={}) {
    const flops=2*m*n*k, bytes=2*(m*k+k*n+m*n);
    const intensity=flops/bytes, ridge=peakTflops/bandwidthTbps;
    const computeUs=flops/(peakTflops*1e6), transferUs=bytes/(bandwidthTbps*1e6);
    const lowerUs=Math.max(computeUs,transferUs), conditionalUs=lowerUs+overheadUs;
    return {flops,bytes,intensity,ridge,computeUs,transferUs,lowerUs,conditionalUs,
      ceilingTflops:Math.min(peakTflops,intensity*bandwidthTbps),
      budgetTflops:flops/(conditionalUs*1e6),
      dominant:computeUs>=transferUs?'compute':'transfer'};
  },
  overlap({computeMs=8,communicationMs=6,fraction=0.5,penaltyMs=0}={}) {
    const serialMs=computeMs+communicationMs, idealMs=Math.max(computeMs,communicationMs);
    const overlapMs=Math.min(computeMs,communicationMs)*fraction;
    const baseMs=serialMs-overlapMs, totalMs=baseMs+penaltyMs;
    return {serialMs,idealMs,overlapMs,baseMs,totalMs,
      communicationStartMs:computeMs-overlapMs,
      savedMs:serialMs-totalMs,savedFraction:(serialMs-totalMs)/serialMs,
      speedup:serialMs/totalMs};
  },
  workload({batch=8,context=2048,layers=32,hidden=4096,kvHeads=8,headDim=128,
    ffn=11008,bytesPerElement=2,peakTflops=200,bandwidthTbps=2}={}) {
    const layerParameters=2*hidden*hidden+2*hidden*kvHeads*headDim+3*hidden*ffn;
    const parameters=layers*layerParameters, weightBytes=parameters*bytesPerElement;
    const kvBytes=2*layers*batch*context*kvHeads*headDim*bytesPerElement;
    const kvWriteBytes=2*layers*batch*kvHeads*headDim*bytesPerElement;
    const linearFlops=2*batch*parameters;
    const attentionFlops=4*layers*batch*context*hidden;
    const flops=linearFlops+attentionFlops, bytes=weightBytes+kvBytes+kvWriteBytes;
    const computeMs=flops/(peakTflops*1e9), transferMs=bytes/(bandwidthTbps*1e9);
    return {layerParameters,parameters,weightBytes,kvBytes,kvWriteBytes,
      linearFlops,attentionFlops,flops,bytes,intensity:flops/bytes,
      computeMs,transferMs,lowerMs:Math.max(computeMs,transferMs),
      dominant:computeMs>=transferMs?'compute':'transfer'};
  },
  stepMetrics({concurrencyPerCard=8,stepMs=40,cards=4,acceptedPerSequence=1}={}) {
    performanceRequireNumber(concurrencyPerCard,'每卡归一并发',{positive:true});
    performanceRequireNumber(stepMs,'step 时长',{positive:true});
    performanceRequireNumber(cards,'实例物理 GPU 数',{positive:true,integer:true});
    performanceRequireNumber(acceptedPerSequence,'每路每步最终接受 token 数');
    const rawSequences=concurrencyPerCard*cards, sequences=Math.round(rawSequences);
    // The fixed-step picture represents a whole number of simultaneous requests.
    if(!Number.isSafeInteger(sequences) || sequences<1 || Math.abs(rawSequences-sequences)>1e-9)
      throw new RangeError('固定 step 模型要求 c × C 是正的安全整数，请调整归一并发或物理 GPU 数。');
    const perSequenceTps=acceptedPerSequence*1000/stepMs;
    const perCardTps=concurrencyPerCard*perSequenceTps, instanceTps=cards*perCardTps;
    const tokensPerStep=sequences*acceptedPerSequence;
    if(![perSequenceTps,perCardTps,instanceTps,tokensPerStep].every(Number.isFinite))
      throw new RangeError('参数产生了超出数值范围的结果，请缩小数值或增大 step 时长。');
    return {sequences,perSequenceTps,perCardTps,instanceTps,tokensPerStep};
  },
  windowMetrics({successes=120,outputTokens=30720,seconds=60,cards=4,sloSuccesses=80}={}) {
    performanceRequireNumber(successes,'成功请求数',{integer:true});
    performanceRequireNumber(outputTokens,'成功请求最终输出 token 总数',{integer:true});
    performanceRequireNumber(seconds,'窗口时长',{positive:true});
    performanceRequireNumber(cards,'实例物理 GPU 数',{positive:true,integer:true});
    performanceRequireNumber(sloSuccesses,'满足 SLO 的成功请求数',{integer:true});
    if(sloSuccesses>successes) throw new RangeError('满足 SLO 的成功请求数不能超过成功请求总数。');
    if(successes===0 && outputTokens!==0) throw new RangeError('成功请求数为 0 时，本口径的成功请求输出 token 总数也必须为 0。');
    const rps=successes/seconds, instanceTps=outputTokens/seconds;
    const perCardTps=instanceTps/cards, goodputRps=sloSuccesses/seconds;
    if(![rps,instanceTps,perCardTps,goodputRps].every(Number.isFinite))
      throw new RangeError('参数产生了超出数值范围的结果，请缩小数值或增大窗口时长。');
    return {rps,instanceTps,perCardTps,goodputRps,
      averageOutputTokens:successes>0?outputTokens/successes:null,
      sloFraction:successes>0?sloSuccesses/successes:null};
  }
});

function performanceRequireNumber(value,label,{positive=false,integer=false}={}) {
  if(typeof value!=='number' || !Number.isFinite(value) || (positive?value<=0:value<0)
    || (integer && !Number.isSafeInteger(value)))
    throw new RangeError(label+'必须是'+(positive?'正':'非负')+(integer?'安全整数':'有限数值')+'。');
}

if(typeof module!=='undefined' && module.exports) module.exports=PerformanceModel;

function initPerformanceExplorers() {
  document.querySelectorAll('[data-performance-explorer="roofline"]').forEach(renderPerformanceRoofline);
  document.querySelectorAll('[data-performance-explorer="overlap"]').forEach(renderPerformanceOverlap);
  document.querySelectorAll('[data-performance-explorer="workload"]').forEach(renderPerformanceWorkload);
  document.querySelectorAll('[data-performance-explorer="metrics"]').forEach(renderPerformanceMetrics);
}

function performanceNumber(value,digits=2) {
  return value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}

function performanceStat(label,value,unit) {
  return `<div class="performance-stat"><small>${label}</small><strong>${value}</strong><span>${unit}</span></div>`;
}

function performanceInputs(root) {
  return Object.fromEntries(Array.from(root.querySelectorAll('[data-control]'),el=>[el.dataset.control,Number(el.value)]));
}

function performanceBind(root,update) {
  root.querySelectorAll('[data-control]').forEach(el=>el.addEventListener('input',update));
  update();
  const chart=root.querySelector('[data-view="chart"]');
  const zoom=document.createElement('button');
  zoom.type='button';
  zoom.className='figure-open performance-zoom';
  zoom.textContent='放大当前图示 ↗';
  zoom.onclick=()=>openFigureDialog(chart.querySelector('svg'),'当前教学参数生成的图示，非实测。','performance-'+root.dataset.performanceExplorer);
  chart.after(zoom);
}

function renderPerformanceRoofline(root) {
  root.classList.add('performance-explorer');
  root.innerHTML=`<header class="performance-widget-head"><span class="eyebrow">ROOFLINE LAB</span><h3>同一个 GEMM，为什么小 M 难以跑满算力？</h3><p>虚构教学机器；可切换方阵与 Qwen3-8B Gate 的真实维度。A/W/C 均为 BF16，β=0；输入冷读一次、输出写一次，图中是条件预算。</p></header>
    <div class="performance-controls">
      <label>线性层 shape<select data-control="n"><option value="4096">教学方阵：K=4096，N=4096</option><option value="12288">Qwen3-8B Gate：K=4096，N=12288</option></select></label>
      <label>M：一次参与计算的行数<select data-control="m"><option value="1">1</option><option value="8">8</option><option value="64" selected>64</option><option value="256">256</option><option value="1024">1024</option><option value="2048">2048</option><option value="4096">4096</option></select></label>
      <label>算术峰值 P <output data-value="peakTflops"></output><input data-control="peakTflops" type="range" min="50" max="500" step="10" value="200" aria-label="假设算术峰值，TFLOP每秒"></label>
      <label>带宽 BW <output data-value="bandwidthTbps"></output><input data-control="bandwidthTbps" type="range" min="0.5" max="5" step="0.1" value="2" aria-label="假设内存带宽，TB每秒"></label>
      <label>额外固定开销 L <output data-value="overheadUs"></output><input data-control="overheadUs" type="range" min="0" max="30" step="1" value="5" aria-label="额外固定开销，微秒"></label>
    </div><div class="performance-stats" data-view="stats" aria-live="polite"></div>
    <div class="performance-chart" data-view="chart"></div>
    <div class="performance-legend"><span class="performance-roof">理论 Roofline</span><span class="performance-budget">含 L 的预算点（非实测）</span><span class="performance-ridge">转折点 P/BW</span><span class="performance-reference">同 shape 的 M=1 / 2048 上界</span></div>
    <div class="performance-verdict" data-view="verdict" aria-live="polite"></div>
    <div class="performance-formula" data-view="formula"></div>
    <p class="performance-model-note">Q 是在上述冷读条件下的最低字节数估计，不是实际 DRAM 计数器。重复搬运、缓存命中、布局转换、写分配、融合与设备执行效率都会改变实测位置。P 与 BW 必须匹配运算精度、访存层级和同一设备条件。固定开销在本模型中单独串行相加。</p>`;
  const view=key=>root.querySelector(`[data-view="${key}"]`);
  performanceBind(root,()=>{
    const input=performanceInputs(root), r=PerformanceModel.roofline(input);
    for(const [key,unit] of [['peakTflops',' TFLOP/s'],['bandwidthTbps',' TB/s'],['overheadUs',' μs']]) root.querySelector(`[data-value="${key}"]`).textContent=input[key]+unit;
    view('stats').innerHTML=performanceStat('算术强度 AI',performanceNumber(r.intensity),'FLOP / byte')+
      performanceStat('转折点 P / BW',performanceNumber(r.ridge),'FLOP / byte')+
      performanceStat('条件时间：max + L',performanceNumber(r.conditionalUs),'μs / GEMM')+
      performanceStat('预算点：F / 条件时间',performanceNumber(r.budgetTflops),'TFLOP/s · 非实测');
    const x=v=>70+(Math.log2(v)+1)/13*540, y=v=>273-(Math.log10(v)+1)/4*231;
    const ticksX=[1,4,16,64,256,1024,4096], ticksY=[0.1,1,10,100,1000];
    const grid=ticksX.map(v=>`<line x1="${x(v)}" y1="42" x2="${x(v)}" y2="273" class="performance-gridline"/><text x="${x(v)}" y="294" text-anchor="${v===4096?'end':'middle'}" class="performance-tick">${v}</text>`).join('')+
      ticksY.map(v=>`<line x1="70" y1="${y(v)}" x2="610" y2="${y(v)}" class="performance-gridline"/><text x="59" y="${y(v)+5}" text-anchor="end" class="performance-tick">${v}</text>`).join('');
    const roof=`${x(0.5)},${y(0.5*input.bandwidthTbps)} ${x(r.ridge)},${y(input.peakTflops)} ${x(4096)},${y(input.peakTflops)}`;
    const referencePoints=[1,2048].map(m=>{
      const point=PerformanceModel.roofline({...input,m,overheadUs:0});
      return `<circle cx="${x(point.intensity)}" cy="${y(point.ceilingTflops)}" r="5" fill="#fffefa" stroke="#426f93" stroke-width="2"/>`;
    }).join('');
    view('chart').innerHTML=`<svg viewBox="0 0 640 330" role="img" aria-label="对数坐标 Roofline。当前算术强度 ${performanceNumber(r.intensity)} FLOP每字节，含固定开销预算吞吐 ${performanceNumber(r.budgetTflops)} TFLOP每秒，点为理论预算而非测量。"><text x="70" y="22" class="performance-svg-title">吞吐 TFLOP/s · 双对数坐标</text><rect x="70" y="42" width="${x(r.ridge)-70}" height="231" fill="#faeee8"/><rect x="${x(r.ridge)}" y="42" width="${610-x(r.ridge)}" height="231" fill="#eaf2e7"/>${grid}<line x1="70" y1="273" x2="610" y2="273" class="performance-axis"/><line x1="70" y1="42" x2="70" y2="273" class="performance-axis"/><line x1="${x(r.ridge)}" y1="${y(input.peakTflops)}" x2="${x(r.ridge)}" y2="273" class="performance-ridge-line"/><polyline points="${roof}" class="performance-roof-line"/>${referencePoints}<line x1="${x(r.intensity)}" y1="${y(r.ceilingTflops)}" x2="${x(r.intensity)}" y2="${y(r.budgetTflops)}" class="performance-budget-gap"/><circle cx="${x(r.intensity)}" cy="${y(r.budgetTflops)}" r="7" class="performance-budget-point"/><text x="340" y="321" text-anchor="middle" class="performance-tick">算术强度 AI · FLOP / byte</text></svg>`;
    view('verdict').innerHTML=`<strong>Roofline 主导项：${r.dominant==='compute'?'算术':'搬运'}。</strong> 算术下界 ${performanceNumber(r.computeUs)} μs；搬运下界 ${performanceNumber(r.transferUs)} μs。取较大值 ${performanceNumber(r.lowerUs)} μs，再加 L=${input.overheadUs} μs。${input.overheadUs>r.lowerUs?'当前额外固定开销比两项资源下界都大。':''}`;
    view('formula').innerHTML=`A[${input.m},4096] × W[4096,${input.n}] → C[${input.m},${input.n}]<br>F = 2MNK = <b>${performanceNumber(r.flops,0)}</b> FLOP<br>Q = 2(MK + KN + MN) = <b>${performanceNumber(r.bytes,0)}</b> byte<br>AI = F/Q；T = max(F/P, Q/BW) + L；预算点 = F/T<br><span>按一次乘加 = 2 FLOP；1 TFLOP/s = 10¹² FLOP/s，1 TB/s = 10¹² byte/s。</span>`;
  });
}

function renderPerformanceOverlap(root) {
  root.classList.add('performance-explorer');
  root.innerHTML=`<header class="performance-widget-head"><span class="eyebrow">OVERLAP LAB</span><h3>看见通信与计算重叠，还要算净收益</h3><p>把一段计算 C 和一段通信 D 放进同一关键路径。比例 f 指较短时长中被假设可独立重叠的部分；这是教学参数，不是从时间线自动推断的利用率。</p></header>
    <div class="performance-controls">
      <label>计算时长 C <output data-value="computeMs"></output><input data-control="computeMs" type="range" min="1" max="20" step="1" value="8" aria-label="计算时长，毫秒"></label>
      <label>通信时长 D <output data-value="communicationMs"></output><input data-control="communicationMs" type="range" min="1" max="20" step="1" value="6" aria-label="通信时长，毫秒"></label>
      <label>独立可重叠比例 f <output data-value="fraction"></output><input data-control="fraction" type="range" min="0" max="100" step="10" value="50" aria-label="独立可重叠比例，百分比"></label>
      <label>额外拥塞罚时 <output data-value="penaltyMs"></output><input data-control="penaltyMs" type="range" min="0" max="8" step="0.5" value="0" aria-label="额外拥塞罚时，毫秒"></label>
    </div><div class="performance-stats" data-view="stats" aria-live="polite"></div><div class="performance-chart" data-view="chart"></div>
    <div class="performance-legend"><span class="performance-compute">计算</span><span class="performance-comm">通信</span><span class="performance-penalty">额外罚时</span></div>
    <div class="performance-verdict" data-view="verdict" aria-live="polite"></div><div class="performance-formula" data-view="formula"></div>
    <p class="performance-model-note">独立性必须由数据依赖和同步关系证明。资源竞争、通信进程到达偏斜（arrival skew）、链路拓扑和分块流水需要单独测量。本图把这些影响仅抽象为末端附加罚时，不能用于推断真实执行顺序，也不能把重叠率当作 GPU 利用率。串行基线没有附加罚时。</p>`;
  const view=key=>root.querySelector(`[data-view="${key}"]`);
  performanceBind(root,()=>{
    const input=performanceInputs(root);
    for(const key of ['computeMs','communicationMs','penaltyMs']) root.querySelector(`[data-value="${key}"]`).textContent=input[key]+' ms';
    root.querySelector('[data-value="fraction"]').textContent=input.fraction+'%';
    input.fraction/=100;
    const r=PerformanceModel.overlap(input);
    view('stats').innerHTML=performanceStat('串行基线 C + D',performanceNumber(r.serialMs,1),'ms')+
      performanceStat('理想完全重叠',performanceNumber(r.idealMs,1),'ms · 忽略罚时')+
      performanceStat('当前条件时间 T′',performanceNumber(r.totalMs,1),'ms · 已计罚时')+
      performanceStat('较串行缩短',performanceNumber(r.savedFraction*100,1)+'%',performanceNumber(r.speedup,2)+'× 条件加速比');
    const max=Math.max(r.serialMs,r.totalMs), x=t=>72+t/max*528;
    const ticks=Array.from({length:5},(_,i)=>max*i/4);
    const overlapShade=r.overlapMs>0?`<rect x="${x(r.communicationStartMs)}" y="48" width="${x(input.computeMs)-x(r.communicationStartMs)}" height="108" fill="#dfeadf"/><line x1="${x(r.communicationStartMs)}" y1="46" x2="${x(r.communicationStartMs)}" y2="158" stroke="#71957f" stroke-dasharray="3 3"/>`:'';
    const penalty=input.penaltyMs>0?`<rect x="${x(r.baseMs)}" y="48" width="${x(r.totalMs)-x(r.baseMs)}" height="108" fill="#efcaa8" stroke="#a96b3b" stroke-dasharray="4 3"/>`:'';
    view('chart').innerHTML=`<svg viewBox="0 0 640 218" role="img" aria-label="两条教学泳道。计算从0到${input.computeMs}毫秒，通信从${r.communicationStartMs}到${r.baseMs}毫秒，末端附加罚时${input.penaltyMs}毫秒。"><text x="72" y="24" class="performance-svg-title">建模重叠 ${performanceNumber(r.overlapMs,1)} ms · 条长表示时长</text>${overlapShade}${penalty}<text x="60" y="82" text-anchor="end" class="performance-tick">计算</text><rect x="72" y="60" width="${x(input.computeMs)-72}" height="31" rx="3" fill="#527d90"/><text x="60" y="140" text-anchor="end" class="performance-tick">通信</text><rect x="${x(r.communicationStartMs)}" y="118" width="${x(r.baseMs)-x(r.communicationStartMs)}" height="31" rx="3" fill="#4d7459"/><line x1="72" y1="174" x2="600" y2="174" class="performance-axis"/>${ticks.map(t=>`<line x1="${x(t)}" y1="174" x2="${x(t)}" y2="181" class="performance-axis"/><text x="${x(t)}" y="201" text-anchor="middle" class="performance-tick">${performanceNumber(t,1)}</text>`).join('')}<text x="624" y="201" text-anchor="end" class="performance-tick">ms</text></svg>`;
    view('verdict').innerHTML=`<strong>${r.savedMs>0?'重叠带来净节省':r.savedMs<0?'罚时抵消重叠并使执行变慢':'当前没有净节省'}。</strong> 重叠 ${performanceNumber(r.overlapMs,1)} ms − 罚时 ${performanceNumber(input.penaltyMs,1)} ms = 净节省 ${performanceNumber(r.savedMs,1)} ms。通信起点设为 C − 重叠 = ${performanceNumber(r.communicationStartMs,1)} ms。`;
    view('formula').textContent=`O = min(C, D) × f = ${performanceNumber(r.overlapMs,1)} ms；T = C + D − O = ${performanceNumber(r.baseMs,1)} ms；T′ = T + 罚时 = ${performanceNumber(r.totalMs,1)} ms。`;
  });
}

function renderPerformanceWorkload(root) {
  root.classList.add('performance-explorer');
  root.innerHTML=`<header class="performance-widget-head"><span class="eyebrow">DECODE WORKLOAD LAB</span><h3>Batch 和上下文，如何改变 decode 的两本账？</h3><p>虚构稠密 GQA 模型：32 层，H=4096，查询头 32、KV 头 8、d=128，门控 FFN=11008，BF16。一个 decode step 为 batch 中每条序列各生成 1 个 token；S 表示本步读取的已有上下文长度。</p></header>
    <div class="performance-controls performance-controls-two">
      <label>Decode batch B<select data-control="batch"><option value="1">1</option><option value="8" selected>8</option><option value="32">32</option><option value="128">128</option></select></label>
      <label>已有上下文 S<select data-control="context"><option value="512">512</option><option value="2048" selected>2048</option><option value="8192">8192</option><option value="32768">32768</option></select></label>
    </div><div class="performance-stats" data-view="stats" aria-live="polite"></div>
    <div class="performance-chart" data-view="chart"></div>
    <div class="performance-legend"><span class="performance-compute">冷读权重</span><span class="performance-comm">已有 KV 读取</span><span class="performance-penalty">本步 KV 写入</span></div>
    <div class="performance-verdict" data-view="verdict" aria-live="polite"></div>
    <dl class="performance-ledger" data-view="ledger"></dl><div class="performance-formula" data-view="formula"></div>
    <p class="performance-model-note">虚构机器 P=200 TFLOP/s、BW=2 TB/s。每 step 权重冷读一次、已有 KV 读一次，并写入本步 KV；假设 GQA 各查询头组复用同一份 KV 读取。这里的算术是理论有用 FLOP，流量是条件最低估计，不是硬件事务或实测带宽。未计词表投影/embedding、norm、bias、位置编码、activation 流量、softmax 运算、调度、通信、采样、缓存复用与重复搬运。没有设备容量约束；大 batch / 长上下文可能无法放入一张真实 GPU。时间只是这部分工作的资源下界，不能当作端到端延迟或真实 tokens/s。</p>`;
  const view=key=>root.querySelector(`[data-view="${key}"]`);
  performanceBind(root,()=>{
    const input=performanceInputs(root), r=PerformanceModel.workload(input);
    const gib=bytes=>performanceNumber(bytes/2**30), gb=bytes=>performanceNumber(bytes/1e9,3);
    view('stats').innerHTML=performanceStat('已有上下文 KV 容量',gib(r.kvBytes),'GiB · 不含本步新增')+
      performanceStat('最低条件流量 Q',gb(r.bytes),'GB / step')+
      performanceStat('有用算术强度 F / Q',performanceNumber(r.intensity),'FLOP / byte')+
      performanceStat('资源时间下界 max',performanceNumber(r.lowerMs,3),'ms / step · 非实测');
    const widths=[r.weightBytes,r.kvBytes,r.kvWriteBytes].map(v=>v/r.bytes*556);
    view('chart').innerHTML=`<svg viewBox="0 0 640 117" role="img" aria-label="本步最低流量构成，权重${gb(r.weightBytes)}GB，已有KV读取${gb(r.kvBytes)}GB，本步KV写入${gb(r.kvWriteBytes)}GB。"><text x="42" y="24" class="performance-svg-title">每 step 字节构成 · 按建模字节数比例绘制</text><rect x="42" y="42" width="${widths[0]}" height="35" fill="#527d90"/><rect x="${42+widths[0]}" y="42" width="${widths[1]}" height="35" fill="#4d7459"/><rect x="${42+widths[0]+widths[1]}" y="42" width="${widths[2]}" height="35" fill="#c88d54"/><text x="42" y="104" class="performance-tick">0</text><text x="598" y="104" text-anchor="end" class="performance-tick">${gb(r.bytes)} GB / step</text></svg>`;
    view('verdict').innerHTML=`<strong>当前资源下界由${r.dominant==='compute'?'算术':'搬运'}主导。</strong> F/P=${performanceNumber(r.computeMs,3)} ms，Q/BW=${performanceNumber(r.transferMs,3)} ms。增加 B 让权重读取被更多 token 分摊；已有 KV 容量和每步读取则随 B×S 增长。`;
    view('ledger').innerHTML=`<dt>估算参数量（不计词表等）</dt><dd>${performanceNumber(r.parameters,0)}，每层 ${performanceNumber(r.layerParameters,0)}</dd><dt>权重容量 / 每步冷读</dt><dd>${gib(r.weightBytes)} GiB / ${gb(r.weightBytes)} GB</dd><dt>已有 KV 容量 / 每步读取</dt><dd>${gib(r.kvBytes)} GiB / ${gb(r.kvBytes)} GB</dd><dt>本步新增 KV / 每步写入</dt><dd>${performanceNumber(r.kvWriteBytes/2**20,3)} MiB / ${gb(r.kvWriteBytes)} GB</dd><dt>线性层 / attention 算术</dt><dd>${performanceNumber(r.linearFlops/1e9,3)} / ${performanceNumber(r.attentionFlops/1e9,3)} GFLOP</dd><dt>总算术 / 本步 token 数</dt><dd>${performanceNumber(r.flops,0)} FLOP / ${input.batch} tokens</dd>`;
    view('formula').innerHTML=`P<sub>layer</sub> = 2H² + 2H·H<sub>kv</sub>·d + 3H·FFN<br>W = 2 × layers × P<sub>layer</sub> byte<br>KV = 2(K,V) × layers × B × S × H<sub>kv</sub> × d × 2 byte<br>KV<sub>write</sub> = 2(K,V) × layers × B × H<sub>kv</sub> × d × 2 byte<br>F = 2B × layers × P<sub>layer</sub> + 4 × layers × B × S × H<br>Q = W + KV + KV<sub>write</sub>；T ≥ max(F/P, Q/BW)<br><span>本例采用 S 个 attention 位置的近似；忽略新 token 自注意的 +1 差别。1 GiB=2³⁰ byte；1 GB=10⁹ byte。</span>`;
  });
}

function renderPerformanceMetrics(root) {
  root.classList.add('performance-explorer','performance-metrics');
  root.innerHTML=`<header class="performance-widget-head"><span class="eyebrow">THROUGHPUT LAB</span><h3>同一批请求：单路、每卡、实例的吞吐差在哪里？</h3><p>先固定计数范围，再做除法。下面两种模式分别练习稳态 step 换算和完整测量窗口统计，都是独立教学示例。</p></header>
    <label class="performance-mode">选择计数方式<select data-metrics-mode aria-label="选择吞吐计算模式"><option value="step">固定 decode step：单路 / 每卡 / 实例</option><option value="window">封闭测量窗口：RPS / token throughput / goodput</option></select></label>
    <div class="performance-metrics-panel" data-metrics-panel="step">
      <p class="performance-definition"><strong>先约定 c = N / C：</strong>N 是实例中同时活跃的请求数，C 是整个实例的物理 GPU 数，c 才是这里的“每卡归一并发”。若看板把 req/card 定义为 DP rank 局部并发，必须先换算 N 与 C。示例 4 卡是教学假设，不是截图设备数。</p>
      <div class="performance-controls">
        <label>每卡归一并发 c（req/card）<input data-control="concurrencyPerCard" type="number" min="0.001" step="any" value="8" inputmode="decimal"></label>
        <label>共同 step 时长 t（ms/step）<input data-control="stepMs" type="number" min="0.001" step="any" value="40" inputmode="decimal"></label>
        <label>实例物理 GPU 数 C（card）<input data-control="cards" type="number" min="1" step="1" value="4" inputmode="numeric"></label>
        <label>每路每步最终接受 a（token/req/step）<input data-control="acceptedPerSequence" type="number" min="0" step="any" value="1" inputmode="decimal"></label>
      </div><p class="performance-input-error" data-view="error" aria-live="polite" hidden></p>
      <div class="performance-stats" data-view="stats" aria-live="polite"></div>
      <div class="performance-chart performance-metrics-chart" data-view="chart"></div>
      <div class="performance-verdict" data-view="verdict" aria-live="polite"></div><div class="performance-formula" data-view="formula"></div>
      <p class="performance-model-note">每个共同 step 都假设同一批请求持续活跃、每路平均最终接受 a 个 token；a 可用于平均接受数教学，不计被拒绝的草稿 token。归一到物理卡只是在实例总量上做除法，不表示每条请求独占一张卡，也不推断 TP / PP / DP 拓扑。这个 step 模型不包含排队、首 token、prefill 和完整请求时间，不能当作 E2E 速率或完整服务基准。改变并发时，真实 step 时长通常也会变化；保持 t 不变只练习换算，不是扩容预测。</p>
    </div>
    <div class="performance-metrics-panel" data-metrics-panel="window" hidden>
      <p class="performance-definition"><strong>本例使用封闭窗口：</strong>同一请求集合全部在窗口内发起并结束，没有跨窗口请求或期末未完成请求。O 只累计 N 个成功请求最终输出的 token；窗口 T 包含这批请求的运行时间与窗口内空闲，C 在窗口内固定。SLO 合格请求必须是成功请求的子集。</p>
      <div class="performance-controls">
        <label>成功请求 N（request）<input data-control="successes" type="number" min="0" step="1" value="120" inputmode="numeric"></label>
        <label>成功请求输出 O（token）<input data-control="outputTokens" type="number" min="0" step="1" value="30720" inputmode="numeric"></label>
        <label>完整窗口 T（s）<input data-control="seconds" type="number" min="0.001" step="any" value="60" inputmode="decimal"></label>
        <label>实例物理 GPU 数 C（card）<input data-control="cards" type="number" min="1" step="1" value="4" inputmode="numeric"></label>
        <label>SLO 合格的成功请求 G（request）<input data-control="sloSuccesses" type="number" min="0" step="1" value="80" inputmode="numeric"></label>
      </div><p class="performance-input-error" data-view="error" aria-live="polite" hidden></p>
      <div class="performance-stats" data-view="stats" aria-live="polite"></div>
      <div class="performance-chart performance-metrics-chart" data-view="chart"></div>
      <div class="performance-verdict" data-view="verdict" aria-live="polite"></div><div class="performance-formula" data-view="formula"></div>
      <p class="performance-model-note">这里只演示 request goodput = 满足既定 SLO 的成功请求数 / 窗口时间；SLO 阈值应在采集前定义，不能仅凭 token 总数推断。O 不含输入 token、失败请求产物或未接受的草稿。连续服务的开放窗口还要规定跨窗口请求、到达与完成计数规则；不能直接照搬本例的封闭集合。窗口聚合吞吐不能反推每个请求的输出速率或延迟分布。</p>
    </div>`;
  const mode=root.querySelector('[data-metrics-mode]');
  mode.addEventListener('change',()=>root.querySelectorAll('[data-metrics-panel]').forEach(panel=>{
    panel.hidden=panel.dataset.metricsPanel!==mode.value;
  }));
  const bindPanel=(name,model,render)=>{
    const panel=root.querySelector(`[data-metrics-panel="${name}"]`);
    const view=key=>panel.querySelector(`[data-view="${key}"]`);
    panel.dataset.performanceExplorer='metrics-'+name;
    performanceBind(panel,()=>{
      const input=Object.fromEntries(Array.from(panel.querySelectorAll('[data-control]'),el=>[el.dataset.control,el.valueAsNumber]));
      let result;
      try {
        result=model(input);
        panel.querySelectorAll('[data-control]').forEach(el=>el.removeAttribute('aria-invalid'));
        view('error').hidden=true;
      } catch(error) {
        view('error').textContent=error.message;
        view('error').hidden=false;
        view('stats').textContent='参数有效后显示结果。';
        view('verdict').textContent='';view('formula').textContent='';
        view('chart').hidden=true;
        const zoom=panel.querySelector('.performance-zoom');
        if(zoom) zoom.hidden=true;
        panel.querySelectorAll('[data-control]').forEach(el=>{
          if(!el.validity.valid || !Number.isFinite(el.valueAsNumber)) el.setAttribute('aria-invalid','true');
          else el.removeAttribute('aria-invalid');
        });
        return;
      }
      view('chart').hidden=false;
      const zoom=panel.querySelector('.performance-zoom');
      if(zoom) zoom.hidden=false;
      render(input,result,view);
    });
  };
  bindPanel('step',PerformanceModel.stepMetrics,(input,r,view)=>{
    const a=performanceNumber(input.acceptedPerSequence,2), t=performanceNumber(input.stepMs,3);
    view('stats').innerHTML=performanceStat('单路最终输出速率',performanceNumber(r.perSequenceTps),'token/s/request · step 模型')+
      performanceStat('按物理卡归一吞吐',performanceNumber(r.perCardTps),'token/s/card · 实例总量 ÷ C')+
      performanceStat('实例最终输出总吞吐',performanceNumber(r.instanceTps),'token/s · 所有请求合计')+
      performanceStat('实例同时活跃请求 N',performanceNumber(r.sequences,0),'request · c × C');
    const rows=r.sequences<=3?Array.from({length:r.sequences},(_,i)=>i+1):[1,2,r.sequences];
    const lanes=rows.map((request,i)=>{
      const y=75+i*47, name=i===2 && r.sequences>3?'… 路 '+performanceNumber(request,0):'路 '+request;
      return `<text x="110" y="${y+22}" text-anchor="end" class="performance-tick">${name}</text><rect x="130" y="${y}" width="210" height="33" rx="3" fill="${i===0?'#dbe9ee':'#e2eadf'}"/><rect x="350" y="${y}" width="210" height="33" rx="3" fill="${i===0?'#dbe9ee':'#e2eadf'}"/><text x="235" y="${y+22}" text-anchor="middle" class="performance-tick">接受 ${a} token</text><text x="455" y="${y+22}" text-anchor="middle" class="performance-tick">接受 ${a} token</text>`;
    }).join('');
    view('chart').innerHTML=`<svg viewBox="0 0 640 290" role="img" aria-label="同一实例的${r.sequences}路请求在连续两个共同step中并行推进，每个step为${input.stepMs}毫秒，每路最终接受${input.acceptedPerSequence}个token。图按请求分行，不按GPU分行。"><text x="30" y="26" class="performance-svg-title">同一批请求，连续推进两个 step（图中行代表请求）</text><text x="235" y="60" text-anchor="middle" class="performance-tick">step 1 · ${t} ms</text><text x="455" y="60" text-anchor="middle" class="performance-tick">step 2 · ${t} ms</text>${lanes}<line x1="130" y1="224" x2="560" y2="224" class="performance-axis"/><text x="130" y="245" class="performance-tick">0</text><text x="345" y="245" text-anchor="middle" class="performance-tick">t</text><text x="560" y="245" text-anchor="end" class="performance-tick">2t</text><text x="30" y="277" class="performance-tick">每 step 全实例合计 N × a = ${performanceNumber(r.tokensPerStep,2)} token</text></svg>`;
    view('verdict').innerHTML=`<strong>每路只跟随自己的 token；实例把 ${performanceNumber(r.sequences,0)} 路相加。</strong> 本例单路 ${performanceNumber(r.perSequenceTps)} token/s，实例 ${performanceNumber(r.instanceTps)} token/s。再除以 ${input.cards} 张物理 GPU，得到 ${performanceNumber(r.perCardTps)} token/s/card；这不改变单路速率。`;
    view('formula').innerHTML=`N = c × C = ${performanceNumber(r.sequences,0)} request<br>单路速率 = a × 1000 / t = ${performanceNumber(r.perSequenceTps)} token/s/request<br>每卡归一吞吐 = c × a × 1000 / t = ${performanceNumber(r.perCardTps)} token/s/card<br>实例吞吐 = N × a × 1000 / t = ${performanceNumber(r.instanceTps)} token/s<br><span>t 输入为 ms；1000 将 ms 换成 s。未在本模型中计算完整请求 RPS。</span>`;
  });
  bindPanel('window',PerformanceModel.windowMetrics,(input,r,view)=>{
    view('stats').innerHTML=performanceStat('成功请求吞吐 RPS',performanceNumber(r.rps,3),'request/s')+
      performanceStat('实例输出 token 吞吐',performanceNumber(r.instanceTps),'token/s')+
      performanceStat('按物理卡归一吞吐',performanceNumber(r.perCardTps),'token/s/card')+
      performanceStat('满足 SLO 的 goodput',performanceNumber(r.goodputRps,3),'request/s · 成功且合格');
    const qualified=r.sloFraction===null?0:r.sloFraction, x=46, width=548;
    view('chart').innerHTML=`<svg viewBox="0 0 640 205" role="img" aria-label="封闭窗口长${input.seconds}秒，共完成${input.successes}个成功请求，其中${input.sloSuccesses}个符合SLO；成功请求输出总计${input.outputTokens}个token。"><text x="46" y="26" class="performance-svg-title">同一个 ${performanceNumber(input.seconds,2)} s 封闭窗口</text><text x="46" y="54" class="performance-tick">成功请求集合 N = ${performanceNumber(input.successes,0)}</text><rect x="${x}" y="68" width="${width}" height="34" fill="#ece9df"/><rect x="${x}" y="68" width="${width*qualified}" height="34" fill="#527d90"/><text x="46" y="128" class="performance-tick">SLO 合格 ${performanceNumber(input.sloSuccesses,0)} · 未达 SLO ${performanceNumber(input.successes-input.sloSuccesses,0)}</text><text x="46" y="156" class="performance-tick">该集合输出 O = ${performanceNumber(input.outputTokens,0)} token</text><text x="46" y="184" class="performance-tick">请求 / 秒与 token / 秒，各用自己的分子</text></svg>`;
    const average=r.averageOutputTokens===null?'没有成功请求，平均输出长度与 SLO 合格率不定义。':`成功请求平均输出 ${performanceNumber(r.averageOutputTokens,2)} token/request，SLO 合格率 ${performanceNumber(100*r.sloFraction,2)}%。`;
    view('verdict').innerHTML=`<strong>RPS 和 token throughput 共享窗口时间，分子不同。</strong> ${average} 合格率也不是 goodput：goodput 的分母是窗口秒数。`;
    view('formula').innerHTML=`RPS = N / T = ${performanceNumber(r.rps,3)} request/s<br>实例输出吞吐 = O / T = ${performanceNumber(r.instanceTps)} token/s<br>每卡归一吞吐 = O / (T × C) = ${performanceNumber(r.perCardTps)} token/s/card<br>request goodput = G / T = ${performanceNumber(r.goodputRps,3)} request/s<br><span>只对同一个成功请求集合，O/T = (N/T) × (O/N)；N=0 时不计算 O/N。</span>`;
  });
}
