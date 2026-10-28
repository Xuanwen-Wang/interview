'use strict';

// Exact tensor accounting for the documented configuration; no latency model.
const MoeDeploymentModel = (() => {
  const config = Object.freeze({H:4096, E:288, I:2048, TP:4, EP:4, K:8});
  function inspect({tokens=24, ep=0, tp=0, expert=0} = {}) {
    if (!Number.isInteger(tokens) || tokens < 4 || tokens > 4096 || tokens % config.EP) throw new RangeError('Global tokens must be a multiple of four in [4,4096]');
    for (const [name,value,max] of [['ep',ep,config.EP],['tp',tp,config.TP],['expert',expert,config.E]]) {
      if (!Number.isInteger(value) || value < 0 || value >= max) throw new RangeError('Invalid '+name);
    }
    const {H,E,I,TP,EP,K}=config;
    const localI=I/TP, localExperts=E/EP, expertParameters=3*H*I;
    return {
      tokens, ep, tp, expert, rank:ep*TP+tp,
      localTokens:tokens/EP, localI, localExperts,
      firstExpert:ep*localExperts, lastExpert:(ep+1)*localExperts-1,
      owner:Math.floor(expert/localExperts), localExpert:expert%localExperts,
      firstI:tp*localI, lastI:(tp+1)*localI-1,
      tpGroup:Array.from({length:TP},(_,i)=>ep*TP+i),
      epLane:Array.from({length:EP},(_,i)=>i*TP+tp),
      routeSlots:tokens*K, balancedCardSlots:tokens*K/EP,
      expertParameters, fp8ExpertRank:expertParameters/TP,
      fp8RoutedRank:expertParameters*localExperts/TP,
      fp8RoutedCard:expertParameters*localExperts,
      bf16SharedRank:ep===0?expertParameters*2/TP:0,
      bf16LocalTokens:tokens/EP*H*2,
      bf16GlobalTokens:tokens*H*2,
      bf16OtherCards:tokens*(EP-1)/EP*H*2
    };
  }
  // Real-valued ownership model. It does not model collective rounding or time.
  function combine(partials) {
    if (!Array.isArray(partials) || partials.length !== 16) throw new RangeError('Expected sixteen rank partials');
    const tokens=partials[0]?.length;
    if (!Number.isInteger(tokens) || tokens<4 || tokens%4 || partials.some(row=>!Array.isArray(row)||row.length!==tokens||row.some(v=>!Number.isFinite(v)))) throw new RangeError('Expected equal finite token vectors divisible by four');
    const boards=Array.from({length:4},(_,ep)=>Array.from({length:tokens},(_,t)=>partials.slice(ep*4,ep*4+4).reduce((sum,row)=>sum+row[t],0)));
    const owners=Array.from({length:4},(_,owner)=>Array.from({length:tokens/4},(_,row)=>boards.reduce((sum,board)=>sum+board[owner*tokens/4+row],0)));
    return {boards,owners};
  }
  function trace({token=7,lane=0,step=0}={}) {
    if (!Number.isInteger(token)||token<0||token>=24||!Number.isInteger(lane)||lane<0||lane>=4||!Number.isInteger(step)||step<0||step>6) throw new RangeError('Invalid trace selection');
    // Invented values in one output feature; model dimensions remain unchanged.
    const partials=Array.from({length:16},(_,r)=>Array.from({length:24},(_,t)=>{
      const ep=Math.floor(r/4),tp=r%4;
      return (t+1)/8*(tp+1)*(0.3125*((2*ep+1)+(2*ep+2))+(ep===0?1:0));
    }));
    const {boards,owners}=combine(partials),owner=Math.floor(token/6),row=token%6;
    return {token,lane,step,owner,row,partials,boards,owners,
      cards:Array.from({length:4},(_,ep)=>({ep,rank:4*ep+lane,
        rows:step>=2&&step<=4?Array.from({length:24},(_,t)=>t):Array.from({length:6},(_,t)=>ep*6+t),
        value:step===3?partials[ep*4+lane][token]:step===4?boards[ep][token]:step===5&&ep===owner?owners[ep][row]:null
      }))};
  }
  return Object.freeze({config,inspect,combine,trace});
})();
if (typeof module === 'object' && module.exports) module.exports = MoeDeploymentModel;

function initMoeExplorers() {
  $$('[data-moe-explorer]').forEach(renderMoeExplorer);
  $$('[data-moe-flow]').forEach(renderMoeFlow);
}

function renderMoeFlow(root) {
  const stages=[
    ['Attention 已合并','每卡只观察自己的6行完整 Attention 输出。KDA 已完成 C0；DSA 已完成 D1–D3。','A[6,4096]'],
    ['mHC 转换','Attention post 更新四条残差流；FFN pre+norm 产生 X。post/comb 与 residual 留在原卡。','Xlocal[6,4096]'],
    ['C1 · AllGather','四卡按原顺序拼成24行，每个 rank 得到相同的 X；这一步不做加法。','Xglobal[24,4096]'],
    ['四 kernel / 本地 Reduce','每个 rank 独立路由并计算本卡命中的专家；本地 Reduce 合 Shared 双core与加权 Routed slot。只读本rank缓冲区，尚未加入其他TP分片。','P[24,4096]'],
    ['C2 · TP AllReduce','同卡4 rank 传递 P，对同一[token,特征]逐元素相加，再复制给四者。补齐的是I2048的投影贡献；没有拼接列，不重乘α。','B[24,4096]'],
    ['C3 · EP ReduceScatter','跨卡同lane对同一[token,特征]相加，每卡只取一份。加齐不同专家贡献后按6行一块归还；不重乘α、不取平均。','Ylocal[6,4096]'],
    ['mHC post / 下一层','完整 MoE 输出与原卡 residual、post、comb 按同一请求行配对，更新四流残差。','residual[6,4,4096]']
  ];
  root.classList.add('moe-explorer','moe-flow');
  root.innerHTML=`<header class="moe-widget-head"><span class="eyebrow">FOLLOW ONE TOKEN</span><h4>让一条 token 真正走完这张图</h4><p>固定真实 shape：全局24行、每卡6行、H4096、Top8。彩色格只追踪行身份；数值是一个输出特征的构造例，不是实测或延迟动画。</p></header>
    <div class="moe-controls"><label>追踪 token<select data-flow-token aria-label="追踪通信token">${Array.from({length:24},(_,t)=>`<option value="${t}" ${t===7?'selected':''}>token ${t}</option>`).join('')}</select></label><label>观察 TP lane<select data-flow-lane aria-label="观察通信TP lane">${Array.from({length:4},(_,i)=>`<option value="${i}">lane ${i}</option>`).join('')}</select></label></div>
    <div class="moe-flow-nav" role="group" aria-label="MoE通信步骤">${stages.map(([name],i)=>`<button type="button" data-flow-step="${i}" aria-pressed="false">${i+1} · ${name}</button>`).join('')}</div>
    <div class="moe-owner" data-flow-status aria-live="polite"></div><div class="moe-card-grid" data-flow-cards></div>
    <div class="moe-flow-actions"><button type="button" data-flow-prev>上一步</button><button type="button" data-flow-next>下一步</button><button type="button" data-flow-reset>重置</button></div>
    <div class="moe-route-budget" data-flow-math></div>
    <p class="moe-model-note">数值构造：IDs=[5,20,73,100,151,200,220,287]，各 α=0.3125；slot k 在 TP p 的单通道 partial=(k+1)(p+1)(token+1)/8。EP0 的 Shared partial=(p+1)(token+1)/8，演示把它均分给两个 Shared core。只用于验证一次求和与返回位置，忽略设备舍入。</p>
    <p class="moe-model-note moe-flow-print">完整静态流程与通信账本见紧邻正文。交互状态只展示当前所选一步；没有播放中的中间帧。</p>`;
  let step=0;
  const token=$('[data-flow-token]',root),lane=$('[data-flow-lane]',root);
  function update() {
    const m=MoeDeploymentModel.trace({token:Number(token.value),lane:Number(lane.value),step});
    const [title,explanation,shape]=stages[step];
    $$('[data-flow-step]',root).forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.flowStep)===step)));
    $('[data-flow-status]',root).innerHTML=`<h4>${step+1}/7 · ${title}</h4><p>${explanation}</p><p><strong>${shape}</strong>；token ${m.token} 的原 owner 始终是卡${m.owner}、本地行${m.row}（从0编号）。</p>`;
    const expertIds=[5,20,73,100,151,200,220,287];
    function equation(c) {
      if(step===2)return 'C1 只拼行：本卡6行 + 其他三卡18行 = 全部24行；没有对 hidden 数值求和。';
      if(step===3) {
        const unit=(m.token+1)*(m.lane+1)/8;
        const shared=c.ep===0?`(${unit/2} + ${unit/2})`:'0';
        return `本地 Reduce：${shared} + 0.3125 × ${(2*c.ep+1)*unit} + 0.3125 × ${(2*c.ep+2)*unit} = ${c.value}。前项是Shared双core之和，后两项来自expert ${expertIds[2*c.ep]}、${expertIds[2*c.ep+1]}；尚缺另外三个TP分片。`;
      }
      if(step===4)return `C2 加 rank${4*c.ep}–${4*c.ep+3} 的 P：${m.partials.slice(4*c.ep,4*c.ep+4).map(row=>row[m.token]).join(' + ')} = ${c.value}。同卡四rank现在都有这份 B，还缺其他卡专家。`;
      if(step===5)return c.ep===m.owner?`C3 加四卡 B：${m.boards.map(b=>b[m.token]).join(' + ')} = ${c.value}。归还本地行${m.row}。`:`本卡仅保留 token ${6*c.ep}–${6*c.ep+5}；选中的 token ${m.token} 已归还卡${m.owner}。`;
      return '';
    }
    $('[data-flow-cards]',root).innerHTML=m.cards.map(c=>`<div class="moe-card ${c.ep===m.owner?'selected':''}"><strong>卡${c.ep} · rank ${c.rank}</strong><small>${shape} · ${step===6?'四流残差':step===3?'rank partial':step===4?'卡级贡献':'本步张量'}</small><div class="moe-token-grid">${c.rows.map(t=>`<span class="${t===m.token?'selected':''}">${t}</span>`).join('')}</div><small>${c.value===null?'':`所选 token 的单通道值：${c.value}`}</small><small data-flow-equation>${equation(c)}</small></div>`).join('');
    const total=m.owners[m.owner][m.row];
    const operation=[
      '本步是完整 Attention 输出；C0 合的是 O-proj partial，不是下面的专家输出。',
      '本步在原卡做残差混合和归一化，生成 MoE 输入；没有跨卡汇集专家结果。',
      '本步搬输入 X，不算专家，不搬专家权重。每rank都已有全部24行，因此Router后无需额外跨卡dispatch。',
      '本步加本rank的有效专家slot及Shared双core，得到P。卡内四rank的Router结果相同，但专家FFN各算不同I512，所以四份P通常不同。',
      '本步加同卡四个TP分片的P，得到B。通信payload是[24,4096]；I512是计算范围，不是正在搬运的列宽。',
      `本步加不同卡的B，再按原token归属分行。token ${m.token} 的完整结果是 ${total}，只留在卡${m.owner}的本地行${m.row}，卡内四rank各有一份。`,
      '本步将完整MoE输出接回原卡残差流；mHC post不是再做一次TP或EP求和。'
    ][step];
    $('[data-flow-math]',root).innerHTML=`<h4>当前步骤：搬什么、加什么？</h4><p>${operation}</p>${step===4||step===5?`<p>注意：C2后同卡四份B是副本。如果再对world16无差别SUM，最终 ${total} 会被重复成 ${4*total}。</p>`:''}`;
    $('[data-flow-prev]',root).disabled=step===0;
    $('[data-flow-next]',root).disabled=step===6;
  }
  $$('[data-flow-step]',root).forEach(b=>b.addEventListener('click',()=>{step=Number(b.dataset.flowStep);update();}));
  token.addEventListener('change',update);lane.addEventListener('change',update);
  $('[data-flow-prev]',root).addEventListener('click',()=>{step=Math.max(0,step-1);update();});
  $('[data-flow-next]',root).addEventListener('click',()=>{step=Math.min(6,step+1);update();});
  $('[data-flow-reset]',root).addEventListener('click',()=>{step=0;token.value='7';lane.value='0';update();});
  update();
}

function renderMoeExplorer(root) {
  root.classList.add('moe-explorer');
  const options=(count,label)=>Array.from({length:count},(_,i)=>`<option value="${i}">${label} ${i}</option>`).join('');
  root.innerHTML=`<header class="moe-widget-head"><span class="eyebrow">FOLLOW A RANK</span><h4>卡间 EP4、卡内 TP4：数据与权重落在哪里？</h4><p>固定 GLM-5.3-Flash 的 H=4096、E=288、I=2048、K=8。T 表示本次 MoE 的全局 token 数；本交互按四张卡均分 token，展示形状与纯矩阵容量推导。容量按优化后的 FP8 Routed / BF16 Shared；Shared 非零贡献由 EP0 注入。</p></header>
    <div class="moe-controls"><label>全局 token 数 T<select data-moe-control="tokens" aria-label="MoE全局token数"><option value="8">T8 · 每卡 2</option><option value="16">T16 · 每卡 4</option><option value="24" selected>T24 · 每卡 6</option><option value="32">T32 · 每卡 8</option></select></label><label>观察哪张卡<select data-moe-control="ep" aria-label="选择EP卡">${options(4,'卡 / EP')}</select></label><label>卡内 TP rank<select data-moe-control="tp" aria-label="选择卡内TP rank">${options(4,'TP')}</select></label><label>追踪 expert id<input data-moe-control="expert" aria-label="追踪专家id" type="number" min="0" max="287" step="1" value="0"></label></div>
    <p class="moe-selection" data-moe-view="selection" aria-live="polite"></p>
    <div class="moe-card-grid" data-moe-view="cards"></div>
    <p class="moe-legend">边框突出当前观察卡；深色为所选 rank；浅蓝色为同一 TP 编号的跨卡 EP 通信 lane。每格代表逻辑 rank，不额外推断芯片封装。</p>
    <div class="moe-owner" data-moe-view="owner" aria-live="polite"></div>
    <div class="moe-accounting"><div data-moe-view="matrices"></div><div data-moe-view="payload"></div></div>
    <div class="moe-route-budget" data-moe-view="routes"></div>
    <p class="moe-model-note">容量口径：Routed 按 FP8 1 B/元素、Shared 按 BF16 2 B/元素；通信张量按 BF16。均不包含 scale、padding、打包元数据、临时副本、路由索引或传输协议开销。这里没有带宽、耗时或性能测量，也没有使用真实路由样本。</p>`;
  const view=key=>$(`[data-moe-view="${key}"]`,root);
  const control=key=>$(`[data-moe-control="${key}"]`,root);
  const size=bytes=>bytes>=1048576?`${(bytes/1048576).toLocaleString('en-US',{maximumFractionDigits:2})} MiB`:`${(bytes/1024).toLocaleString('en-US',{maximumFractionDigits:2})} KiB`;
  function update() {
    const selected=Object.fromEntries($$('[data-moe-control]',root).map(el=>[el.dataset.moeControl,Number(el.value)]));
    if (!control('expert').value || !Number.isInteger(selected.expert) || selected.expert<0 || selected.expert>287) {
      control('expert').setCustomValidity('请输入 0 到 287 的整数专家编号。');
      return;
    }
    control('expert').setCustomValidity('');
    const m=MoeDeploymentModel.inspect(selected);
    view('selection').textContent=`当前：T${m.tokens}，每卡 ${m.localTokens} token；卡 ${m.ep} / TP ${m.tp} / 全局 rank ${m.rank}。expert ${m.expert} 属于卡 ${m.owner}。`;
    view('cards').innerHTML=Array.from({length:4},(_,ep)=>`<div class="moe-card ${ep===m.ep?'selected':''}"><strong>卡 ${ep} · EP ${ep}</strong><small>专家 ${ep*72}–${ep*72+71}</small><div class="moe-ranks">${Array.from({length:4},(_,tp)=>`<span class="${ep===m.ep&&tp===m.tp?'selected':tp===m.tp?'lane':''}">TP ${tp}<b>r${ep*4+tp}</b></span>`).join('')}</div><small>${ep===0?'Shared 真实权重所在卡':'Shared 无真实权重归属'}</small></div>`).join('');
    view('owner').innerHTML=`<h4>从一个 expert 追到一个 TP 分片</h4><p>expert <strong>${m.expert}</strong> → 卡 <strong>${m.owner}</strong> → 卡内局部 expert <strong>${m.localExpert}</strong>。它的 2048 个中间维按 4 路 TP 切分：当前 TP ${m.tp} 负责 I[${m.firstI}…${m.lastI}]，共 ${m.localI} 维。</p><p>${m.owner===m.ep?`所选卡拥有该专家；所选 rank ${m.rank} 持有上述分片。`:`所选卡 ${m.ep} 不持有该专家；上述 TP 分片位于 rank ${m.owner*4+m.tp}。`} 当前卡的 TP 组为 [${m.tpGroup.join(', ')}]；当前 TP 编号的 EP lane 为 [${m.epLane.join(', ')}]。</p>`;
    view('matrices').innerHTML=`<h4>所选 rank 的权重账本</h4><p class="moe-shape-key">以下用逻辑 W[输入, 输出] 表示，非物理打包布局。</p><dl><dt>每专家 Gate / Up</dt><dd>各 [4096, ${m.localI}]<br>FP8 各 ${size(4096*m.localI)}</dd><dt>每专家 Down</dt><dd>[${m.localI}, 4096]<br>FP8 ${size(4096*m.localI)}</dd><dt>每专家三矩阵</dt><dd>${size(m.fp8ExpertRank)} / rank</dd><dt>72 个 Routed</dt><dd><b>${size(m.fp8RoutedRank)} / rank</b><br>${size(m.fp8RoutedCard)} / 卡</dd><dt>Shared 真实权重</dt><dd>${size(m.bf16SharedRank)} / rank${m.ep===0?'<br>EP0 合计 48 MiB':'<br>当前开发链分配同形状零占位，不计为真实权重'}</dd></dl>`;
    view('payload').innerHTML=`<h4>通信张量大小，而非线上流量</h4><p class="moe-shape-key">表中是 BF16 张量元素大小，不代表 collective 算法发送的总字节数。</p><dl><dt>单卡 token 块</dt><dd>[${m.localTokens}, 4096]<br>${size(m.bf16LocalTokens)}</dd><dt>跨卡 AllGather 结果</dt><dd>[${m.tokens}, 4096]<br><b>${size(m.bf16GlobalTokens)} / 副本</b></dd><dt>其中来自其他 3 卡</dt><dd>${size(m.bf16OtherCards)} / 接收方逻辑副本</dd><dt>卡内 TP 归约对象</dt><dd>[${m.tokens}, 4096]<br>${size(m.bf16GlobalTokens)} / 部分结果</dd><dt>跨卡归约并分回 token</dt><dd>[${m.tokens}, 4096] → [${m.localTokens}, 4096]<br>${size(m.bf16GlobalTokens)} → ${size(m.bf16LocalTokens)}</dd></dl>`;
    view('routes').innerHTML=`<h4>T${m.tokens} 到底有多少路 expert 工作？</h4><p>Top-8 产生 <strong>${m.tokens} × 8 = ${m.routeSlots}</strong> 个 token–expert 选择。若四卡路由完全均衡，平均每卡 ${m.balancedCardSlots} 个选择；这只是负载模型，真实卡负载必须看路由结果。同一卡内 4 个 TP rank 各算同一批专家选择的 1/4 中间维，不能把 ${m.balancedCardSlots} 再除以 4 当成其 token 工作数。</p>`;
  }
  $$('[data-moe-control]',root).forEach(el=>el.addEventListener('input',update));
  update();
}
