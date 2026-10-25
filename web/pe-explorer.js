'use strict';

// The controls use exact packing formulas and small integer examples, not a cycle simulator.
function initPeExplorers() {
  $$('[data-pe-explorer="mapping"]').forEach(renderPeMapping);
  $$('[data-pe-explorer="budget"]').forEach(renderPeBudget);
}

function renderPeMapping(root) {
  root.className = 'pe-explorer';
  root.innerHTML = `<header class="pe-widget-head"><span class="eyebrow">FOLLOW ONE OUTPUT</span><h3>从 W[k,c]，走到一个输出 y[k]</h3><p>单核 · KC · FP8×FP8 · normal packing · 无 UScale。矩阵按 <strong>W[输出 K, 归约 C]</strong> 展示。</p></header>
    <div class="pe-controls">
      <label>输出列 k <output data-value="k">37</output><input data-control="k" aria-label="选择输出列k" type="range" min="0" max="127" value="37"></label>
      <label>局部 CI c <output data-value="c">86</output><input data-control="c" aria-label="选择局部CI坐标c" type="range" min="0" max="127" value="86"></label>
      <label>C 总长度<select data-control="blocks" aria-label="选择归约总长度"><option value="1">128：一个 C 块</option><option value="2" selected>256：两个 C 块</option></select></label>
    </div>
    <div class="pe-map-layout"><div class="pe-map-main"><div data-view="matrix"></div><button class="pe-zoom" type="button" data-action="zoom-matrix">放大当前矩阵 ↗</button><p class="pe-legend"><i class="weight"></i>橙：选中 weight / 输出列 <i class="act"></i>蓝：选中 activation 的 CI 段</p></div><div class="pe-location" data-view="location" aria-live="polite"></div></div>
    <div class="pe-zoom-heading"><h4>放大这一个 PE：16 个 ALU，各取一列的 16 个权重</h4><span data-view="zoom-label"></span></div><div data-view="lanes"></div>
    <div class="pe-stage-controls"><span>沿数据路径读图</span><button type="button" data-action="previous" aria-label="上一个数据通路阶段">← 上一步</button><button type="button" data-action="next" aria-label="下一个数据通路阶段">下一步 →</button><strong data-view="stage-number"></strong></div>
    <div class="pe-stages" data-view="stages"></div><div class="pe-stage-explanation" data-view="stage-text" aria-live="polite"></div>
    <div class="pe-accumulation" data-view="accumulation"></div>
    <p class="pe-model-note">输入 A[c]=c mod 5−2，W[k,c]=(3k+2c) mod 7−3，均为可精确表示的小整数。本例用于核对数据归属与求和，不模拟内部舍入、流水延迟或 RTL 波形。步骤编号是逻辑阶段，不是时钟编号。</p>`;
  $('[data-action="zoom-matrix"]',root).onclick=()=>openFigureDialog($('[data-view="matrix"] svg',root),'当前选中的weight坐标；矩阵行是输出K，列是归约C。','pe-mapping');
  let stage = 0;
  const select = key => $(`[data-control="${key}"]`,root);
  const view = key => $(`[data-view="${key}"]`,root);
  const names = ['取数与分发','MAC 局部乘积','ALU 局部 dot','OL1 跨 C 块','group 八路归约','格式转换与写回'];
  const update = () => {
    const k = Number(select('k').value), c = Number(select('c').value), blocks = Number(select('blocks').value);
    const m = PEModel.locate(k,c), sums = PEModel.accumulate(k,blocks);
    $('[data-value="k"]',root).textContent=k; $('[data-value="c"]',root).textContent=c;
    // Each square is a 16-output by 16-C tile, i.e. one PE's 256-byte weight slice.
    const cell=34, x=88, y=53;
    let squares='';
    for(let g=0;g<8;g++) for(let p=0;p<8;p++) squares+=`<rect x="${x+p*cell}" y="${y+g*cell}" width="${cell-2}" height="${cell-2}" rx="2" fill="${g===m.group&&p===m.pe?'#b86b38':g===m.group?'#f0d6be':p===m.pe?'#dcebf0':'#e9e9df'}" stroke="${g===m.group&&p===m.pe?'#79421f':'#d2d8cb'}"/>`;
    view('matrix').innerHTML=`<svg viewBox="0 0 460 382" role="img" aria-label="权重128乘128分块图，行分8个输出group，列分8个CI段PE"><text x="88" y="18" class="pe-svg-title">W[128 K, 128 C] = 16 KiB</text><text x="88" y="39" class="pe-svg-small">C → 每格16个CI；p是group内的PE编号</text>${squares}${Array.from({length:8},(_,i)=>`<text x="${x+cell*i+16}" y="343" text-anchor="middle" class="pe-svg-small">p${i}</text><text x="77" y="${y+cell*i+21}" text-anchor="end" class="pe-svg-small">g${i}</text>`).join('')}<line x1="${x}" y1="${y+(m.group+m.alu/16)*cell+1}" x2="${x+8*cell-2}" y2="${y+(m.group+m.alu/16)*cell+1}" stroke="#b15c2f" stroke-width="2"/><circle cx="${x+(m.pe+(c%16)/16)*cell+1}" cy="${y+(m.group+m.alu/16)*cell+1}" r="4" fill="#193e50" stroke="white"/><text x="88" y="370" class="pe-svg-small">选中 W[${k}, ${c}]；每格16×16=256 B</text><text x="378" y="78" class="pe-svg-small">K ↓</text><text x="378" y="99" class="pe-svg-small">每group</text><text x="378" y="116" class="pe-svg-small">16输出</text></svg>`;
    view('location').innerHTML=`<span class="tag">真实 normal 映射</span><h4>group ${m.group} · PE ${m.pe}</h4><dl><dt>group 输出范围</dt><dd>${16*m.group}…${16*m.group+15}</dd><dt>PE 的 C0 局部 CI 范围</dt><dd>${16*m.pe}…${16*m.pe+15}</dd><dt>输出 k 对应的 ALU</dt><dd>a = ${m.alu}</dd><dt>选中 MAC / 字节 lane</dt><dd>j = ${m.mac} / lane ${m.lane}</dd><dt>group 内 weight 字节偏移</dt><dd>${m.alu}×128 + ${m.pe}×16 + ${c%16} = <b>${m.groupByte}</b></dd><dt>双 hub 的读取位置</dt><dd>轮 ${m.round} · hub ${m.hub} · MC ${m.mc}<br>该 MC 32 B 返回内偏移 ${m.byte}</dd></dl><p>这是当前 128×128 块内的位置，不是整条指令的绝对 DRAM 地址。</p>`;
    view('zoom-label').textContent=`展示 C 块 0 · ALU ${m.alu} / MAC ${m.mac}`;
    view('lanes').innerHTML=`<div class="pe-lane-grid">${Array.from({length:8},(_,j)=>{const lo=16*m.pe+2*j;return `<div class="pe-mac ${j===m.mac?'selected':''}"><small>MAC ${j}</small><b>A[${lo}] · W[${k},${lo}]</b><span>${PEModel.activation(lo)} × ${PEModel.weight(k,lo)}</span><b>A[${lo+1}] · W[${k},${lo+1}]</b><span>${PEModel.activation(lo+1)} × ${PEModel.weight(k,lo+1)}</span></div>`;}).join('')}</div><p class="small muted">一个 ALU：8 个 MAC cell × 每 cell 2 个 FP8 乘积 = dot16。其他 ALU 复用这 16 个 A，换成各自输出列的 W。</p>`;
    view('stages').innerHTML=names.map((name,i)=>`<button type="button" data-stage="${i}" aria-pressed="${i===stage}" class="${i===stage?'active':''}"><small>${String(i+1).padStart(2,'0')}</small>${name}</button>`).join('');
    view('stage-number').textContent=`${stage+1} / ${names.length}`;
    const descriptions=[
      `L2 一次128 B握手携带128个FP8 act，按16元素切给p0…p7，同编号p再广播到8个group。每个group独立接收2 KiB weight，各PE拿256 B。A与W是两路输入。`,
      `当前PE ${m.pe}的ALU ${m.alu}中，MAC ${m.mac}使用16 bit act与16 bit weight，给出两个FP8乘积。图中两项对应的CI是${16*m.pe+2*m.mac}和${16*m.pe+2*m.mac+1}。`,
      `8个MAC贡献的16项先进入内部对齐/加法树，再归一化为FP32局部和。当前第一块的dot16=${sums.partials[m.pe][0]}；不要把这层说成已经完成128项的全列点积。`,
      blocks===2?`C=256：第二个128-C块到来时，同一PE/ALU累加CI ${128+16*m.pe}…${128+16*m.pe+15}这另一段16项。PE ${m.pe}的OL1得到 ${sums.partials[m.pe][0]} + (${sums.partials[m.pe][1]}) = ${sums.ol1[m.pe]}。复用的是partial-sum槽位，A本身不累加。`:`C=128：此例每个PE只有一段dot16，OL1保存其局部结果。更长C会在此跨C块累加。`,
      `KC模式下，group ${m.group}将8个PE的同编号ALU ${m.alu}结果相加。八路分别覆盖不同CI条带；得到 y[${k}]=${sums.output}。不同group负责不同输出列，彼此不再做这次CI归约。`,
      `每group形成16个FP32值（64 B）。128-bit DT口若输出FP32需要4次成功输出握手；BF16需2次，FP8/INT8需1次。输出握手数不是从最初输入到完成的总周期数。`
    ];
    view('stage-text').textContent=descriptions[stage];
    view('accumulation').innerHTML=`<h4>一个 y[${k}]：先在各 PE 跨 C 块累加，再汇合</h4><p class="pe-table-hint">窄屏可横向滚动表格，查看全部 8 路部分和。</p><div class="pe-table-scroll"><table><thead><tr><th>CI归约分片</th>${Array.from({length:8},(_,p)=>`<th class="${p===m.pe?'picked':''}">PE ${p}</th>`).join('')}</tr></thead><tbody>${Array.from({length:blocks},(_,t)=>`<tr><th>C块 ${t} · dot16</th>${sums.partials.map((row,p)=>`<td class="${p===m.pe?'picked':''}">${row[t]}</td>`).join('')}</tr>`).join('')}<tr class="pe-psum"><th>OL1 FP32局部和</th>${sums.ol1.map((v,p)=>`<td class="${p===m.pe?'picked':''}">${v}</td>`).join('')}</tr></tbody></table></div><div class="pe-output">group ${m.group} 八路归约 <span>${sums.ol1.join(' + ').replaceAll('+ -','− ')}</span><strong>y[${k}] = ${sums.output}</strong></div>`;
    $$('[data-stage]',root).forEach(b=>b.onclick=()=>{stage=Number(b.dataset.stage);update();});
  };
  $$('[data-control]',root).forEach(el=>el.addEventListener('input',update));
  $('[data-action="previous"]',root).onclick=()=>{stage=(stage+names.length-1)%names.length;update();};
  $('[data-action="next"]',root).onclick=()=>{stage=(stage+1)%names.length;update();};
  update();
}

function renderPeBudget(root) {
  root.className='pe-explorer';
  root.innerHTML=`<header class="pe-widget-head"><span class="eyebrow">DERIVE BEFORE TUNING</span><h3>16 KiB weight 供给，能养活多少次重放？</h3><p>固定单核KC FP8×FP8；假设MC/core/PE同频，每MC最大发射率为1次/该域cycle。R是条件参数，可改；不计refresh、行切换、仲裁的额外损失，本图没有实测点。</p></header><div class="pe-controls">
    <label>内部重放行数 w <output data-value="w"></output><input data-control="w" aria-label="权重重放行数w" type="range" min="1" max="16" value="4"></label>
    <label>credit周转 R <output data-value="r"></output><input data-control="r" aria-label="模型credit周转周期R" type="range" min="15" max="46" value="23"></label>
    <label>每WL1启用hub<select data-control="hubs" aria-label="模型hub数量"><option value="2">2：双 hub</option><option value="1">1：单 hub</option></select></label>
    <label>换算频率<select data-control="mhz" aria-label="模型换算频率MHz"><option value="400">400 MHz 假设</option><option value="500">500 MHz 假设</option></select></label>
    <label>activation归约长度<select data-control="cElements" aria-label="归约长度用于驻留推导"><option value="4096">4096：Gate/Up例</option><option value="512">512：Down例</option></select></label></div>
    <div class="pe-budget-stats" data-view="stats" aria-live="polite"></div><div data-view="balance"></div><button class="pe-zoom" type="button" data-action="zoom-budget">放大当前预算图 ↗</button><div class="pe-residency" data-view="residency"></div>
    <p class="pe-model-note">这里只计算weight供数对理想MAC发射的上限，未计AL1重装/credit、OL1依赖、输出drain、尾块、scale及固定开销。c取输入容量允许的最大值用于解释驻留，不是编译器推荐配置；w&gt;4也不表示当前自动搜索已覆盖。</p>`;
  $('[data-action="zoom-budget"]',root).onclick=()=>openFigureDialog($('[data-view="balance"] svg',root),'条件稳态预算，不是实测或RTL波形。','pe-budget');
  const update=()=>{
    const inputs=Object.fromEntries($$('[data-control]',root).map(el=>[el.dataset.control,Number(el.value)]));
    const b=PEModel.budget(inputs);
    $('[data-value="w"]',root).textContent=inputs.w; $('[data-value="r"]',root).textContent=inputs.r+' 同域cycle';
    $('[data-view="stats"]',root).innerHTML=`<div><small>条件平均供数间隔</small><strong>${b.interval.toFixed(3)}</strong><span>cycle / 16 KiB</span></div><div><small>条件供数上界</small><strong>${b.tbps.toFixed(3)}</strong><span>十进制 TB/s / core</span></div><div><small>只计weight的MAC上限</small><strong>${(b.weightCeiling*100).toFixed(1)}%</strong><span>min(1, w / 间隔)</span></div><div><small>纯FP8算术峰值</small><strong>${b.fp8Tops.toFixed(4)}</strong><span>TOPS / core @${inputs.mhz} MHz</span></div>`;
    const max=Math.max(b.interval,inputs.w,4), scale=530/max;
    $('[data-view="balance"]',root).innerHTML=`<svg viewBox="0 0 740 175" role="img" aria-label="条件weight供数间隔与理想重放工作量对比，不是波形"><text x="22" y="31" class="pe-svg-title">同一16 KiB miniblock的两本时间账</text><text x="22" y="77" class="pe-svg-small">供数间隔</text><rect x="135" y="54" width="${b.interval*scale}" height="31" rx="4" fill="#bd7947"/><text x="${143+b.interval*scale}" y="76" class="pe-svg-small">${b.interval.toFixed(2)}</text><text x="22" y="123" class="pe-svg-small">${inputs.w}行理想发射</text><rect x="135" y="101" width="${inputs.w*scale}" height="31" rx="4" fill="#557d91"/><text x="${143+inputs.w*scale}" y="123" class="pe-svg-small">${inputs.w}</text><text x="22" y="160" class="pe-svg-small">条长是条件稳态预算；实际接受顺序由valid/ready与credit决定。</text></svg>`;
    $('[data-view="residency"]',root).innerHTML=`<strong>再问AL1能否保住这些act：</strong>Cᵤ=${inputs.cElements}/128=${inputs.cElements/128}，输入容量 w·c≤64 ⇒ 这里取c=${b.c}，N_TC=${b.cTiles}。<b>${b.canRetain?'两份bank可覆盖C块；仍要经历首次填充和flag_only门控。':'C块数超过2；后续K tile需要重装act，不能只看权重收益。'}</b><p>每PE每bank存128bit×64=1KiB；同编号PE跨group复制。容量约束来自每PE的地址深度，不是把全核物理SRAM加起来任意分配。</p>`;
  };
  $$('[data-control]',root).forEach(el=>el.addEventListener('input',update));update();
}
