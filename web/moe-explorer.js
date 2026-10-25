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
  return Object.freeze({config,inspect});
})();
if (typeof module === 'object' && module.exports) module.exports = MoeDeploymentModel;

function initMoeExplorers() {
  $$('[data-moe-explorer]').forEach(renderMoeExplorer);
}

function renderMoeExplorer(root) {
  root.classList.add('moe-explorer');
  const options=(count,label)=>Array.from({length:count},(_,i)=>`<option value="${i}">${label} ${i}</option>`).join('');
  root.innerHTML=`<header class="moe-widget-head"><span class="eyebrow">FOLLOW A RANK</span><h4>卡间 EP4、卡内 TP4：数据与权重落在哪里？</h4><p>固定当前 GLM5Next 300B 的 H=4096、E=288、I=2048、K=8。T 表示本次 MoE 的全局 token 数；本交互按四张卡均分 token，展示形状与纯矩阵容量推导。容量与 Shared 驻留按当前开发四 kernel 链；旧真实权重入口见正文版本对照。</p></header>
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
