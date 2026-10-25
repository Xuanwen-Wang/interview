'use strict';

// Logical tensor accounting for the Qwen3-8B teaching example; no device model.
const DecodeDataflowModel = (() => {
  const config = Object.freeze({hidden:4096, queryHeads:32, headDim:128, intermediate:12288, layers:36, elementBytes:2});
  const batches = Object.freeze([1,4,16,32]);
  const contexts = Object.freeze([1024,4096,8192,32768]);
  function validate(value, options, name) {
    if (!Number.isInteger(value) || !options.includes(value)) throw new RangeError('Unsupported '+name);
  }
  function attention({batch=1, context=4096} = {}) {
    validate(batch,batches,'batch');
    validate(context,contexts,'context');
    const {queryHeads,headDim,layers,elementBytes}=config;
    const qkPvFlops=4*batch*queryHeads*context*headDim;
    const scenarios=[['MHA',32],['GQA',8],['MQA',1]].map(([name,kvHeads])=>{
      const cacheBytes=2*batch*context*kvHeads*headDim*elementBytes;
      const newKvBytes=2*batch*kvHeads*headDim*elementBytes;
      return {name,kvHeads,queriesPerKv:queryHeads/kvHeads,cacheBytes,allLayersCacheBytes:cacheBytes*layers,
        newKvBytes,allLayersNewKvBytes:newKvBytes*layers,logicalScanBytes:cacheBytes,qkPvFlops,
        queryShape:[batch,queryHeads,1,headDim],kvShape:[batch,kvHeads,context,headDim],outputShape:[batch,queryHeads,1,headDim]};
    });
    return {batch,context,qkPvFlops,scenarios,blockSize:128,blocks:context/128};
  }
  function ffn({batch=1} = {}) {
    validate(batch,batches,'batch');
    const {hidden,intermediate,elementBytes}=config;
    const matrixParameters=hidden*intermediate;
    const weightBytes=3*matrixParameters*elementBytes;
    return {batch,matrixParameters,matrixBytes:matrixParameters*elementBytes,weightBytes,
      weightBytesPerToken:weightBytes/batch,matmulFlops:6*batch*matrixParameters,
      inputShape:[batch,hidden],middleShape:[batch,intermediate],outputShape:[batch,hidden],
      gateShape:[hidden,intermediate],upShape:[hidden,intermediate],downShape:[intermediate,hidden],
      inputBytes:batch*hidden*elementBytes,middleBytes:batch*intermediate*elementBytes,
      outputBytes:batch*hidden*elementBytes};
  }
  return Object.freeze({config,batches,contexts,attention,ffn});
})();
if (typeof module === 'object' && module.exports) module.exports = DecodeDataflowModel;

function initDecodeExplorers(scope=document) {
  scope.querySelectorAll('[data-decode-explorer]').forEach(root=>{
    if (root.dataset.decodeReady || !['attention','ffn'].includes(root.dataset.decodeExplorer)) return;
    root.dataset.decodeReady='true';
    renderDecodeExplorer(root);
  });
}

function renderDecodeExplorer(root) {
  const kind=root.dataset.decodeExplorer, attention=kind==='attention';
  const number=n=>n.toLocaleString('en-US',{maximumFractionDigits:3});
  const size=bytes=>bytes>=1073741824?`${number(bytes/1073741824)} GiB`:bytes>=1048576?`${number(bytes/1048576)} MiB`:`${number(bytes/1024)} KiB`;
  const shape=values=>`[${values.join(', ')}]`;
  const options=(values,selected)=>values.map(value=>`<option value="${value}"${value===selected?' selected':''}>${number(value)}</option>`).join('');
  const metric=(label,value,note='')=>`<div class="decode-metric"><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</div>`;
  const node=(title,dimensions,note,extra='')=>`<div class="decode-node ${extra}"><strong>${title}</strong><code>${dimensions}</code><small>${note}</small></div>`;
  root.classList.add('decode-explorer');
  root.innerHTML=`<header class="decode-head"><span class="decode-eyebrow">CHANGE THE SHAPE · FOLLOW THE BYTES</span><h4>${attention?'同一份 Q，KV head 数量改变了什么？':'一个 decode 步：三块权重如何处理一批 token？'}</h4><p>固定 Qwen3-8B 的公开维度：H = 4096，32 个 Q head，每 head 128 维，FFN 中间维 12288，共 36 层。这里统一按 BF16、每元素 2 字节算账；这是形状与逻辑字节推导。</p></header>
    <div class="decode-controls"><label>本步一起处理的请求数 B<select data-decode-control="batch" aria-label="${attention?'Attention':'FFN'} 批量请求数 B">${options(DecodeDataflowModel.batches,1)}</select></label>${attention?`<label>每个请求可见的 KV token 数 N<select data-decode-control="context" aria-label="Attention 可见 KV token 数 N">${options(DecodeDataflowModel.contexts,4096)}</select></label>`:'<p>每个请求生成 1 个新 token。增大 B 会增加矩阵行数；历史上下文 N 不进入 FFN 的这些 shape。</p>'}</div>
    <p class="decode-selection" data-decode-view="selection" aria-live="polite"></p>
    <div data-decode-view="body"></div>
    <p class="decode-footnote">${attention?'统计范围：单步、单层、所有 B 个请求，N 包含本步刚写入的 KV。完整扫描按每个 K/V 元素理想读取一次计算，不是实际 HBM 流量；共享复用不足、分块、缓存、padding 与并行切分会改变设备访问。计算量只计 QK + PV 的乘加（1 次乘加 = 2 FLOPs），不含投影、softmax、RoPE 与归一化。':'统计范围：单步、单层、所有 B 个新 token；逻辑权重按三块 BF16 矩阵计算，理想情况下每块权重在这一批内读取一次。未计激活读写、SiLU、缓存、padding、量化元数据与并行通信；没有估计设备耗时。'} 数值不是 518 或 NVIDIA 实测。</p>`;
  const view=key=>root.querySelector(`[data-decode-view="${key}"]`);
  const control=key=>root.querySelector(`[data-decode-control="${key}"]`);
  function updateAttention() {
    const m=DecodeDataflowModel.attention({batch:Number(control('batch').value),context:Number(control('context').value)});
    const gqa=m.scenarios[1];
    view('selection').textContent=`当前：B = ${m.batch}，N = ${number(m.context)}。每个请求本步只算 1 个新位置；Q 都是 ${shape(gqa.queryShape)}。下方容量与 FLOPs 均已包含这 ${m.batch} 个请求。`;
    view('body').innerHTML=`<div class="decode-compare">${m.scenarios.map(s=>`<section class="decode-scenario ${s.name==='GQA'?'decode-actual':''}"><div class="decode-scenario-title"><h5>${s.name} · ${s.kvHeads} 个 KV head</h5><span>${s.name==='GQA'?'Qwen3-8B 实际结构':'保持 Q 维度不变的对照'}</span></div><p class="decode-share">${s.queriesPerKv} 个 Q head 共享 1 个 KV head</p><div class="decode-share-diagram"><span>${s.queriesPerKv===1?'Q head 0':`Q head 0–${s.queriesPerKv-1}`}</span><b aria-hidden="true">↔</b><span>KV head 0</span></div><p class="decode-shape-label">K / V 各自的 shape</p><code class="decode-shape">${shape(s.kvShape)}</code><div class="decode-capacity-bar" aria-hidden="true"><span style="width:${s.kvHeads/32*100}%"></span></div><dl><dt>单层 KV 容量</dt><dd>${size(s.cacheBytes)}</dd><dt>36 层 KV 总容量</dt><dd>${size(s.allLayersCacheBytes)}</dd><dt>本步单层新增 KV 写入</dt><dd>${size(s.newKvBytes)}</dd><dt>本步单层完整扫描 KV</dt><dd>${size(s.logicalScanBytes)}</dd><dt>本步单层 QK + PV</dt><dd>${number(s.qkPvFlops/1e9)} GFLOPs</dd></dl></section>`).join('')}</div>
      <div class="decode-takeaway"><strong>GQA 缩小了每个历史 token 的 KV，却仍要看完整的 ${number(m.context)} 个位置。</strong><p>与这里的 MHA 对照相比，GQA 的 KV 容量和理想扫描字节降到 1/4；32 个 Q head 仍各自计算注意力，QK + PV 的乘加总量不变。把 N 增大 4 倍，三种方案的容量、扫描字节和 QK + PV 计算量都会增大 4 倍。</p></div>
      <div class="decode-flow-block"><h5>跟随 GQA 的一个 KV 分块：第 0 组的 4 个 Q head</h5><p class="decode-flow-intro">只展开 KV head 0：它为 Q head 0–3 服务，其余 7 组做同样的事。教学分块大小为 128 个 token；按顺序扫描 ${m.blocks} 个块。</p><div class="decode-flow"><div class="decode-input-pair">${node('独立输入：当前 Q',`[${m.batch}, 4, 1, 128]`,'来自本步的新 token；4 个 Q head 各有自己的查询')}${node('独立输入：缓存中的 K / V 块',`各 [${m.batch}, 1, 128, 128]`,'128 个历史位置 × 128 维；供 4 个 Q head 复用')}</div><div class="decode-merge-label">Q 与 K 计算分数；V 提供待加权的数据 ↓</div>${node('块内注意力分数',`[${m.batch}, 4, 1, 128]`,'QK → 在线 softmax → 加权 V')}<span class="decode-arrow" aria-hidden="true">↓</span>${node('累计输出',`[${m.batch}, 4, 1, 128]`,'继续读下一个块，直到所有历史位置处理完')}</div><p class="decode-flow-summary">合并 8 组后输出 <code>${shape(gqa.outputShape)}</code>，再整理为 <code>[${m.batch}, 4096]</code> 进入输出投影。分块与在线 softmax 可以避免把完整分数表写回显存，但完整 attention 依然扫描全部可见 KV；减少可见位置是稀疏或滑窗等另一类算法选择。</p></div>`;
  }
  function updateFfn() {
    const m=DecodeDataflowModel.ffn({batch:Number(control('batch').value)});
    view('selection').textContent=`当前：B = ${m.batch}，输入 ${shape(m.inputShape)}。三块权重共 288 MiB；本步一起处理 ${m.batch} 个 token，理想摊到每个 token 的权重读取为 ${size(m.weightBytesPerToken)}。`;
    view('body').innerHTML=`<div class="decode-ffn-flow"><h5>Gate 和 Up 并行扩维，逐元素合并后由 Down 压回</h5>${node('归一化后的输入 X',shape(m.inputShape),`${size(m.inputBytes)} · ${m.batch} 行，每行 4096 维`,'decode-input')}<div class="decode-fork"><div class="decode-branch"><span class="decode-arrow" aria-hidden="true">↓</span>${node('Gate 投影',shape(m.middleShape),`X × W_gate ${shape(m.gateShape)}；随后 SiLU`)}</div><div class="decode-branch"><span class="decode-arrow" aria-hidden="true">↓</span>${node('Up 投影',shape(m.middleShape),`X × W_up ${shape(m.upShape)}`)}</div></div><div class="decode-merge-label">两条支路逐元素相乘 ↓</div>${node('SwiGLU 中间结果',shape(m.middleShape),`${size(m.middleBytes)} · 两条支路 shape 相同`,'decode-middle')}<span class="decode-arrow" aria-hidden="true">↓</span>${node('Down 投影后的输出',shape(m.outputShape),`中间结果 × W_down ${shape(m.downShape)}`,'decode-output')}</div>
      <div class="decode-metrics">${metric('三块 BF16 权重','288 MiB','Gate / Up / Down 各 96 MiB')}${metric('本步三次矩阵乘计算量',`${number(m.matmulFlops/1e9)} GFLOPs`,`${m.batch} 个 token 合计；不计逐元素操作`)}${metric('理想每 token 权重读取',size(m.weightBytesPerToken),'整批只读一次权重后的摊销')}</div>
      <div class="decode-weight-block"><h5>把 batch 改大，权重条仍然一样长</h5><div class="decode-weight-bar"><span>Gate · 96 MiB</span><span>Up · 96 MiB</span><span>Down · 96 MiB</span></div><p>本步仍使用同一套 <strong>288 MiB</strong> 权重，但可以为 <strong>${m.batch}</strong> 行输入共同服务。B = 1 时接近矩阵–向量乘，B 增大后更有机会复用权重、形成有效矩阵乘；实际效果取决于调度、缓存容量与 kernel 实现。</p></div>
      <div class="decode-takeaway"><strong>FFN 的主要复用维度是本步 token 数 B，不是历史长度 N。</strong><p>固定 B，把上下文从 1K 拉到 32K，不会放大这三次 FFN 矩阵乘。增加 B 则按比例增加激活行数与计算量；若权重可以在批内复用，理想总权重读取保持 288 MiB。这解释了为什么 decode 的权重量化与连续批处理有价值。</p></div>
      <div class="decode-optimization-grid"><div><h5>融合：减少中间张量读写</h5><p>可把 SiLU 和逐元素乘接在 Gate / Up 的计算中。图中的中间 shape 仍存在，但不一定都要独立写回显存。</p></div><div><h5>量化：缩小每个权重元素</h5><p>改变权重字节数，并引入 scale、解包或反量化代价。288 MiB 是 BF16 基线，不能直接当成量化后的实际访问量。</p></div></div>`;
  }
  const update=attention?updateAttention:updateFfn;
  root.querySelectorAll('[data-decode-control]').forEach(el=>el.addEventListener('input',update));
  update();
}
