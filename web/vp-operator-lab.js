'use strict';

// Values explain data dependencies; no frame represents an RTL clock cycle.
const VPOperatorModel = (() => {
  const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
  const copy=xs=>xs.slice();
  function rmsnorm(input,weight,chunk=4,epsilon=1e-6) {
    if(!input.length||input.length!==weight.length||!Number.isInteger(chunk)||chunk<1||epsilon<=0||![...input,...weight].every(Number.isFinite))throw Error('Invalid RMSNorm inputs');
    const frames=[];let sum=0;const output=Array(input.length).fill(null);
    const push=(title,detail,path,rows,state,active=[])=>frames.push({title,detail,path,rows,state,active,output:copy(output),sum});
    push('建立一行的状态','本例一行 8 个元素；每次显示 4 个元素只为便于阅读，不代表 VP lane 数或编译 tile。',['l2'],[['原输入 X',copy(input)],['权重 γ',copy(weight)]],[['行累计和','0'],['行系数','尚不可用']]);
    for(let start=0;start<input.length;start+=chunk){
      const end=Math.min(start+chunk,input.length),ids=Array.from({length:end-start},(_,i)=>i+start);
      const squares=input.map((x,i)=>i>=start&&i<end?x*x:null);
      push('第一遍：读取并逐元素平方',`X[${start}…${end-1}] 从 L2 进入 PreCal，MUL 计算 x²。原 X 仍保留在 L2，平方结果不是最终输出。`,['l2','pre','a'],[['原输入 X',copy(input)],['MUL：x²',squares]],[['当前范围',`${start}…${end-1}`],['跨块累计',String(sum)]],ids);
      const local=squares.reduce((s,x)=>s+(x??0),0);sum+=local;
      push('SMT：块内归约，合入本行部分和',`本块贡献 ${local}，行累计 S=${sum}。此处只表达加法依赖；实际树模式、跨块累加和反馈由 lowering 决定。`,['a','smt','scalar'],[['原输入 X',copy(input)],['本块平方',squares]],[['块贡献',String(local)],['行累计 S',String(sum)]],ids);
    }
    const mean=sum/input.length,rrms=1/Math.sqrt(mean+epsilon);
    push('整行统计完成：形成行系数','先按行长度缩放，加 ε，再计算 rsqrt。只有看到整行最后一块后，该行系数才能用于输出。',['smt','scalar'],[['原输入 X',copy(input)],['权重 γ',copy(weight)]],[['S / D + ε',String(mean+epsilon)],['rrms',String(rrms)]]);
    for(let start=0;start<input.length;start+=chunk){
      const end=Math.min(start+chunk,input.length),ids=Array.from({length:end-start},(_,i)=>i+start);
      for(const i of ids)output[i]=input[i]*rrms*weight[i];
      push('第二遍：重读 X，与行系数及 γ 配对',`输出特征 ${start}…${end-1}。rrms 按行复用，γ 按特征变化；不能把两者当成同一种广播对象。`,['l2','pre','a','post','out'],[['重读 X',copy(input)],['逐特征 γ',copy(weight)],['输出 Y',copy(output)]],[['rrms',String(rrms)],['输出有效数',String(output.filter(x=>x!==null).length)]],ids);
    }
    return {key:'rmsnorm',name:'RMSNorm：两遍数据与行状态',note:'8 元素数值走读，实数参考；实际示例仍为 [4,4096]。不模拟 FP32 归约次序、PRG/SQR 近似或 BF16 舍入。',input:copy(input),frames,output,rrms};
  }
  function topk(input,k=3) {
    if(!input.length||!input.every(Number.isFinite)||!Number.isInteger(k)||k<1||k>Math.min(16,input.length))throw Error('Invalid TopK inputs');
    const frames=[],mask=Array(input.length).fill(false),selected=[];
    const push=(title,detail,path,active=[])=>frames.push({title,detail,path,active,masked:copy(mask),rows:[['原输入 score',copy(input)],['Mask：1 已选',mask.map(Number)]],state:[['TKV values',selected.map(x=>x.value).join(', ')||'空'],['TKV indices',selected.map(x=>x.index).join(', ')||'空']],selected:selected.map(x=>({...x})),mask:copy(mask)});
    push('初始化本轮选择上下文','本例 8 个互异分数取 Top-3。Mask 属于这组选择任务，不得继承上一个任务的已选位。',['l2','mask']);
    for(let round=0;round<k;round++){
      const candidates=input.map((value,index)=>({value,index})).filter(x=>!mask[x.index]);
      // The reference uses the smaller index for ties; this is not an RTL tie claim.
      const winner=candidates.reduce((a,b)=>b.value>a.value||(b.value===a.value&&b.index<a.index)?b:a);
      push(`第 ${round+1} 轮：重扫未屏蔽候选`,'比较树同时携带值与原始索引。已经输出过的元素仍在原输入中，由 Mask 排除。',['l2','pre','cmt','mask'],candidates.map(x=>x.index));
      push(`第 ${round+1} 轮：比较树产生胜者`,`本轮胜者为 index=${winner.index}，value=${winner.value}。比较结果不能丢掉索引后再靠数值回查。`,['cmt','mask'],[winner.index]);
      selected.push(winner);mask[winner.index]=true;
      push(`第 ${round+1} 轮：写 TKV 槽 ${round} 并更新 Mask`,'TKV 保留此前轮次的值/索引。非末轮继续扫描同一输入，尚不提交最终 packet。',['cmt','mask'],[winner.index]);
    }
    mask.fill(false);
    push('最后一轮：提交 packet，并释放 Mask','TKVO 提交结果，MSKRC 清理状态。Mask packet 回到 Compare 的 packet 选择，经算术链/SMT 合法旁路进入向量出口，再经 PostCal 写出。只定义两半各前 K 项。',['mask','cmt','a','smt','select','post','out']);
    frames[frames.length-1].edges=[['mask','cmt'],['cmt','a'],['a','smt'],['smt','select'],['select','post'],['post','out']];
    return {key:'topk',name:'TopK：比较树、索引与跨轮 Mask',note:'本例无相等值。参考模型遇到相等值选较小索引，仅用于可重复演示；实际 tie/NaN 语义必须按目标合同另行核对。步骤不是 cycle。',input:copy(input),frames,output:selected,mask};
  }
  function swiglu(gate,up) {
    if(!gate.length||gate.length!==up.length||![...gate,...up].every(Number.isFinite))throw Error('Invalid SwiGLU inputs');
    const s=gate.map(sigmoid),swish=gate.map((x,i)=>x*s[i]),out=swish.map((x,i)=>x*up[i]);
    const rows=[['原 gate G',copy(gate)],['up U',copy(up)]];
    const make=(title,detail,path,extra,state)=>({title,detail,path,rows:[...rows,...extra],state,active:gate.map((_,i)=>i)});
    const frames=[
      make('保留 gate 的两个使用者','G 既用于 sigmoid(G)，也用于后面的 G×sigmoid(G)。提前覆盖 G 会使第二个使用者读到错误数据。',['l2'],[],[['G 的寿命','直到 SiLU 乘法结束'],['U 的寿命','直到最后乘法结束']]),
      make('编程 PRG：参数先就绪','生产 fast 配方装载 64 段参数。表是有所有权的 VP 状态；另一个任务改写表后，旧计算不能继续假设它有效。',['l2','prg'],[],[['PRG 状态','sigmoid 表'],['说明','本演示不复制生产 LUT']]),
      make('读取 G：PreCal 与 CMT 钳位','当前 fast 分支先处理下界，再在计算链上处理上界，避免无穷输入进入零斜率段后出现 0×Inf。',['l2','pre','cmt'],[],[['下界','−104'],['上界','10']]),
      make('PRG → MUL → SUM1：分段近似','PRG 选择区间的 k、b；MUL 计算 k×G，SUM1 加 b。下方数值为精确 sigmoid 的数学参考，未冒充生产 LUT 输出。',['prg','a'],[['σ(G) 数学参考',s]],[['生产算术','kᵢ×G+bᵢ'],['FIFO 内部来源','PRG.b']]),
      make('再次消费原 G：形成 SiLU','新的乘法读取 σ(G) 和仍存活的 G。PRG.b 与外部 tensor Y 竞争通用 CAL FIFO，不能只按代数把它们塞进同一条链。',['l2','pre','a','post'],[['SiLU 数学参考',swish]],[['X','σ(G)'],['tensor Y','原 G']]),
      make('消费 U，写回 SwiGLU','SiLU 结果再乘 U；最终由 PostCal 按输出类型窄化并写 L2。实际融合与中间缓冲区数量要检查该版本编译产物。',['l2','pre','a','post','out'],[['最终数学参考',out]],[['X','SiLU(G)'],['tensor Y','U']])
    ];
    return {key:'swiglu',name:'SwiGLU：追踪原值、PRG 与第二输入',note:'8 个元素放大观察；数值采用精确数学 sigmoid，连接与资源冲突依据当前源码。未模拟 LUT 误差、舍入或最终指令数量。',input:copy(gate),frames,output:out};
  }
  function accurate(x=1) {
    if(!Number.isFinite(x)||x< -80||x>80)throw Error('Normal-branch example expects -80 <= x <= 80');
    const t=-x*Math.LOG2E,n=Math.floor(t),f=t-n,e=2**f*2**n,d=1+e,r0=.97/d,c=2-d*r0,r1=r0*c;
    const frame=(title,detail,path,state)=>({title,detail,path,rows:[['正常支路输入 x',[x]]],state,active:[0]});
    return {key:'accurate',name:'Sigmoid accurate：指数分解与倒数修正',input:[x],output:[r1],note:'只放大正常支路 x=1；r₀=0.97/d 是故意带 3% 误差的教学种子，不是生产 PRG 系数。尾部支路与全部分配见正文。',frames:[
      frame('装载 exp2 表','同一组 PRG 后续还要装载倒数种子表，必须先完成依赖 exp2 的正常支路和尾部计算。',['l2','prg'],[['B 的 PRG','exp2'],['原 x','仍存活']]),
      frame('A：MUL → FLR → SUM1','对 −x 乘 log₂e，拆为整数 n 与小数 f。整数部分必须延迟到 B 的 SHF，与同一元素的小数计算对齐。',['pre','a'],[['t=−x·log₂e',String(t)],['n=floor(t)',String(n)],['f=t−n',String(f)]]),
      frame('B：PRG → MUL → SUM1 → SHF','用 PRG 近似 2^f，再按 n 做指数尺度恢复。下方为理想 exp2 参考；A/B 此时为级联路径。',['a','b','prg'],[['2^f',String(2**f)],['exp(−x)',String(e)]]),
      frame('PostCal：形成分母 d','加 1，分母 d 后面既被用于构造倒数种子，也被 Newton 修正再次读取。不能在第一次消费后释放。',['b','post','out'],[['d=1+exp(−x)',String(d)],['d 的使用者','种子 + 修正']]),
      frame('改装 PRG：倒数种子','DIP 分解分母的指数与尾数；PRG/MUL/SUM1 近似归一化倒数，SHF 恢复尺度。',['l2','prg','a','b'],[['PRG 所有权','由 exp2 换为 reciprocal'],['教学 r₀',String(r0)]]),
      frame('Newton：重读 d 与 r₀','MUL 计算 d×r₀，PostCal 按原次序执行 ×(−1) 后 +2。r₀ 还有下一个使用者，必须保留。',['l2','a','post'],[['d×r₀',String(d*r0)],['c=2−d×r₀',String(c)]]),
      frame('Newton：再用 r₀','第二次乘法得到 r₁=r₀×c。教学相对误差从 3% 缩小到 0.09%；生产误差还受表、FP32 舍入和尾部分支影响。',['l2','a','post','out'],[['r₁',String(r1)],['精确 σ(x)',String(sigmoid(x))],['教学相对误差','0.09%']])
    ]};
  }
  const presets={swiglu:()=>swiglu([-2,-1,-.5,0,.5,1,2,3],[1,2,3,4,1,2,3,4]),rmsnorm:()=>rmsnorm([1,-2,3,-4,5,-6,7,-8],[1,.5,1.5,1,2,.5,1,1.5]),topk:()=>topk([.2,.8,-.4,1.3,.9,.5,1.1,-.2]),accurate:()=>accurate()};
  return {sigmoid,rmsnorm,topk,swiglu,accurate,presets};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VPOperatorModel;

let vpOperatorCleanups=[];
function destroyVpOperatorLabs(){vpOperatorCleanups.forEach(fn=>fn());vpOperatorCleanups=[];}
function initVpOperatorLabs(chapter){
  if(chapter.id!=='hw-vp-architecture')return;
  const format=x=>x===null?'—':Number.isInteger(x)?String(x):Math.abs(x)<.0001?x.toExponential(3):Number(x.toFixed(5)).toString();
  const nodes=[['l2',24,15,1032,58,'L2 · 原 tensor / 中间缓冲区','数据可被多个阶段再次读取'],['pre',24,126,148,80,'PreCal','格式与输入整理'],['cmt',204,126,160,80,'CMT','比较 / packet 选择'],['a',396,126,224,80,'引擎 A · 32 lane','DIP SUM0 PRG MUL…'],['b',652,126,224,80,'引擎 B · 32 lane','级联配方使用第二段'],['post',908,126,148,80,'PostCal','算术 / 转换'],['mask',24,286,184,86,'Mask / TKV','跨轮选择状态'],['prg',244,286,220,86,'PRG 参数状态','非独立算术级'],['smt',500,286,160,86,'SMT','归约 / tensor 旁路'],['scalar',696,286,176,86,'Scalar / SQR','行统计与系数'],['select',696,410,176,72,'出口选择','向量或 S2P 标量'],['out',908,410,148,72,'写回 L2','请求后等待完成']];
  const paths=[['l2','pre','M98 73V126'],['pre','cmt','M172 166H204'],['cmt','a','M364 166H396'],['a','b','M620 166H652'],['cmt','mask','M284 206V245H116V286'],['mask','cmt','M76 286V226H234V206'],['prg','a','M354 286V246H506V206'],['a','smt','M566 206V286'],['b','smt','M764 206V245H612V286'],['smt','scalar','M660 329H696'],['scalar','select','M784 372V410'],['smt','select','M580 372V446H696'],['select','post','M872 446H892V240H935V206'],['post','out','M1000 206V410']];
  document.querySelectorAll('[data-vp-operator-lab]').forEach((root,index)=>{
    let key=root.dataset.vpOperatorLab||'swiglu',model=VPOperatorModel.presets[key](),step=0,timer=null;
    const uid=`vp-op-${index}`;
    root.classList.add('vp-operator-lab');
    const controls=document.createElement('div');controls.className='vpo-controls';
    controls.innerHTML='<label>执行走读 <select aria-label="选择 VP 算子走读"><option value="swiglu">SwiGLU / fast Sigmoid</option><option value="accurate">accurate Sigmoid 正常支路</option><option value="rmsnorm">RMSNorm</option><option value="topk">TopK</option></select></label><span>步骤表示依赖顺序，不是 cycle</span>';
    const live=document.createElement('div');live.className='vpo-live';
    const transport=document.createElement('div');transport.className='vpo-transport';transport.innerHTML='<div class="vpo-buttons"><button data-vpo-action="prev">← 上一步</button><button data-vpo-action="play">播放</button><button data-vpo-action="next">下一步 →</button><button data-vpo-action="reset">重置</button></div><label>阶段 <input type="range" min="0" value="0" aria-label="VP 算子阶段"><output></output></label><div class="vpo-steps"></div>';
    root.append(controls,live,transport);root.dataset.ready='true';
    const select=controls.querySelector('select'),slider=transport.querySelector('input'),play=transport.querySelector('[data-vpo-action=play]');select.value=key;
    function stop(){if(timer)clearInterval(timer);timer=null;play.textContent='播放';}
    function draw(){
      const frame=model.frames[step],active=new Set(frame.path);
      if(active.has('post')&&(active.has('a')||active.has('b'))){active.add('smt');active.add('select');}
      const edgeActive=(a,b)=>frame.edges?frame.edges.some(edge=>edge[0]===a&&edge[1]===b):active.has(a)&&active.has(b)&&!(a==='a'&&b==='smt'&&active.has('b'));
      root.dataset.step=String(step);slider.max=String(model.frames.length-1);slider.value=String(step);transport.querySelector('output').textContent=`${step+1} / ${model.frames.length}`;
      transport.querySelector('[data-vpo-action=prev]').disabled=step===0;transport.querySelector('[data-vpo-action=next]').disabled=step===model.frames.length-1;
      const svg=`<svg viewBox="0 0 1080 520" role="img" aria-label="${model.name}：${frame.title}"><defs><marker id="${uid}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker></defs>${paths.map(([a,b,d])=>`<path d="${d}" fill="none" stroke="${edgeActive(a,b)?'#087e84':'#c6d0ca'}" stroke-width="${edgeActive(a,b)?3:1.5}" marker-end="url(#${uid}-arrow)"/>`).join('')}${nodes.map(([id,x,y,w,h,title,sub])=>`<g class="${active.has(id)?'vpo-node-active':''}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${active.has(id)?'#e0f0e9':'#f4f5f1'}" stroke="${active.has(id)?'#16858a':'#d4ddd5'}" stroke-width="${active.has(id)?2:1}"/><text x="${x+14}" y="${y+27}" font-size="18" font-weight="600" fill="#24463d">${title}</text><text x="${x+14}" y="${y+49}" font-size="13" fill="#61766c">${sub}</text></g>`).join('')}<text x="795" y="397" font-size="12" fill="#687c73">S2P</text><text x="25" y="510" font-size="13" fill="#687c73">功能路径简图，省略 ReLU 旁路与部分 mux；青色标出当前模块。TopK packet 经向量旁路，标量先经 S2P。</text></svg>`;
      live.innerHTML=`<div class="vpo-heading"><small>${String(step+1).padStart(2,'0')} / ${model.frames.length}</small><h4>${frame.title}</h4></div><p class="vpo-detail">${frame.detail}</p><div class="vpo-map">${svg}</div><div class="vpo-values">${frame.rows.map(([label,values])=>`<div class="vpo-value-row"><strong>${label}</strong><div style="--vpo-count:${values.length}">${values.map((value,i)=>`<span class="${frame.masked?.[i]?'vpo-masked':frame.active?.includes(i)?'vpo-selected':''}"><small>[${i}]</small><b>${format(value)}</b></span>`).join('')}</div></div>`).join('')}</div><div class="vpo-state">${frame.state.map(([label,value])=>`<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><p class="vpo-note">${model.note}</p>`;
      transport.querySelector('.vpo-steps').innerHTML=model.frames.map((f,i)=>`<button data-vpo-step="${i}" aria-label="第 ${i+1} 阶段：${f.title}" aria-current="${i===step?'step':'false'}">${i+1}</button>`).join('');
    }
    select.onchange=()=>{stop();key=select.value;model=VPOperatorModel.presets[key]();step=0;draw();};
    slider.oninput=()=>{stop();step=Number(slider.value);draw();};
    transport.onclick=event=>{
      const direct=event.target.closest('[data-vpo-step]');if(direct){stop();step=Number(direct.dataset.vpoStep);draw();return;}
      const action=event.target.closest('[data-vpo-action]')?.dataset.vpoAction;if(!action)return;
      if(action==='play'){if(timer){stop();return;}if(step===model.frames.length-1)step=0;draw();play.textContent='暂停';timer=setInterval(()=>{step++;draw();if(step===model.frames.length-1)stop();},1600);return;}
      stop();step=action==='reset'?0:Math.max(0,Math.min(model.frames.length-1,step+(action==='next'?1:-1)));draw();
    };
    const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);window.addEventListener('beforeprint',stop);
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stop();});observer?.observe(root);
    vpOperatorCleanups.push(()=>{stop();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('beforeprint',stop);});draw();
  });
}
