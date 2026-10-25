'use strict';

// Small, deterministic teaching examples. These are not device timing models.
const AttentionLabMath = (() => {
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  function validate(scores, values) {
    if (!Array.isArray(scores) || !scores.length || !scores.every(score => finite(score) || score === -Infinity) || !Array.isArray(values) || values.length !== scores.length || !Array.isArray(values[0]) || !values[0].length) throw new TypeError('Expected finite or masked scores and finite value rows');
    const width = values[0].length;
    if (values.some(row => !Array.isArray(row) || row.length !== width || !row.every(finite))) throw new TypeError('Value rows must have the same finite width');
  }
  function partitionIndices(length, partitions) {
    const result = partitions || [Array.from({length}, (_, i) => i)];
    if (!Array.isArray(result) || !result.length || result.some(p => !Array.isArray(p) || !p.length)) throw new RangeError('Partitions must be nonempty');
    const flat = result.flat();
    if (flat.length !== length || new Set(flat).size !== length || flat.some(i => !Number.isInteger(i) || i < 0 || i >= length)) throw new RangeError('Partitions must cover every row exactly once');
    return result;
  }
  function onlineAttention(scores, values, partitions) {
    validate(scores, values);
    const groups = partitionIndices(scores.length, partitions);
    let m = -Infinity, l = 0, u = Array(values[0].length).fill(0);
    const trace = groups.map(indices => {
      const previous = {m, l, u: u.slice()};
      const tileMax = Math.max(...indices.map(i => scores[i]));
      // A fully masked tile contributes nothing, even before the first valid tile.
      if (tileMax === -Infinity) return {indices: indices.slice(), previous, tileMax, alpha: 1, weights: indices.map(() => 0), contribution: u.map(() => 0), m, l, u: u.slice(), output: u.map(x => l === 0 ? 0 : x / l)};
      const nextMax = Math.max(m, tileMax);
      const alpha = m === -Infinity ? 0 : Math.exp(m - nextMax);
      const weights = indices.map(i => Math.exp(scores[i] - nextMax));
      const contribution = u.map((_, c) => indices.reduce((sum, i, j) => sum + weights[j] * values[i][c], 0));
      l = alpha * l + weights.reduce((sum, w) => sum + w, 0);
      u = u.map((x, c) => alpha * x + contribution[c]);
      m = nextMax;
      return {indices: indices.slice(), previous, tileMax, alpha, weights, contribution, m, l, u: u.slice(), output: u.map(x => x / l)};
    });
    // This teaching API explicitly defines an all-masked row as zero / -Infinity.
    return {m, l, u, output: u.map(x => l === 0 ? 0 : x / l), lse: l === 0 ? -Infinity : m + Math.log(l), trace};
  }
  function splitAttention(scores, values, partitions) {
    validate(scores, values);
    const groups = partitionIndices(scores.length, partitions);
    const partials = groups.map(indices => {
      const p = onlineAttention(indices.map(i => scores[i]), indices.map(i => values[i]));
      return {indices: indices.slice(), output: p.output, lse: p.lse};
    });
    const maxLse = Math.max(...partials.map(p => p.lse));
    const masses = partials.map(p => maxLse === -Infinity ? 0 : Math.exp(p.lse - maxLse));
    const mass = masses.reduce((a, b) => a + b, 0);
    const weights = masses.map(w => mass === 0 ? 0 : w / mass);
    return {partials, maxLse, weights, output: values[0].map((_, c) => partials.reduce((sum, p, i) => sum + weights[i] * p.output[c], 0)), lse: mass === 0 ? -Infinity : maxLse + Math.log(mass)};
  }
  function rope(pair, position, frequency) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(finite) || !finite(position) || !finite(frequency)) throw new TypeError('Expected a finite pair, position and frequency');
    const angle = position * frequency, cos = Math.cos(angle), sin = Math.sin(angle);
    return {angle, cos, sin, output: [pair[0] * cos - pair[1] * sin, pair[0] * sin + pair[1] * cos]};
  }
  function deltaStep(state, key, value, beta, query) {
    if (!Array.isArray(state) || !state.length || !Array.isArray(state[0]) || !state[0].length || !Array.isArray(key) || !Array.isArray(value) || !Array.isArray(query) || key.length !== state.length || query.length !== state.length || value.length !== state[0].length || ![...key, ...value, ...query, beta].every(finite) || state.some(row => !Array.isArray(row) || row.length !== value.length || !row.every(finite))) throw new TypeError('Incompatible finite delta-state tensors');
    const prediction = value.map((_, c) => state.reduce((sum, row, r) => sum + key[r] * row[c], 0));
    const residual = value.map((v, c) => v - prediction[c]);
    const update = state.map((row, r) => row.map((_, c) => beta * key[r] * residual[c]));
    const next = state.map((row, r) => row.map((s, c) => s + update[r][c]));
    const output = value.map((_, c) => next.reduce((sum, row, r) => sum + query[r] * row[c], 0));
    return {prediction, residual, update, state: next, output};
  }
  function gateState(state, alpha) {
    if (!Array.isArray(state) || !state.length || !Array.isArray(state[0]) || !state[0].length || !Array.isArray(alpha) || alpha.length !== state.length || !alpha.every(finite) || state.some(row => !Array.isArray(row) || row.length !== state[0].length || !row.every(finite))) throw new TypeError('Incompatible finite state and row gates');
    return state.map((row, r) => row.map(value => value * alpha[r]));
  }
  return Object.freeze({onlineAttention, splitAttention, rope, deltaStep, gateState});
})();
if (typeof module === 'object' && module.exports) module.exports = AttentionLabMath;

const AttentionLabRuntime = (() => {
  const active = new Set();
  let installed = false;
  const stopAll = () => active.forEach(item => item.pause());
  function register(item) {
    active.add(item);
    if (!installed) {
      installed = true;
      window.addEventListener('hashchange', stopAll);
      window.addEventListener('pagehide', stopAll);
      window.addEventListener('beforeprint', stopAll);
      document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
      new MutationObserver(() => {
        active.forEach(item => { if (!item.root.isConnected) { item.pause(); active.delete(item); } });
      }).observe(document.documentElement, {childList: true, subtree: true});
    }
  }
  return {register};
})();

function initAttentionLabs(scope = document) {
  scope.querySelectorAll('[data-attention-lab]').forEach(root => {
    if (root.dataset.attentionReady || !['flash', 'decode', 'rope', 'heads', 'mla', 'sparse', 'state'].includes(root.dataset.attentionLab)) return;
    root.dataset.attentionReady = 'true';
    renderAttentionLab(root);
  });
}

function renderAttentionLab(root) {
  const kind = root.dataset.attentionLab;
  const num = x => !Number.isFinite(x) ? (x < 0 ? '−∞' : '∞') : (Math.abs(x) < 0.0000005 ? '0' : Number(x.toFixed(6)).toLocaleString('en-US', {maximumFractionDigits: 6}));
  const vec = a => '[' + a.map(num).join(', ') + ']';
  const matrix = a => a.map(vec).join(' · ');
  const box = (label, value, note = '', tone = '') => `<div class="al-node ${tone}"><span>${label}</span><div class="al-value">${value}</div>${note ? `<small>${note}</small>` : ''}</div>`;
  const arrow = (label = '') => `<div class="al-arrow"><b aria-hidden="true">↓</b>${label ? `<span>${label}</span>` : ''}</div>`;
  const flow = (...nodes) => `<div class="al-flow">${nodes.join('')}</div>`;
  const columns = (...nodes) => `<div class="al-columns">${nodes.join('')}</div>`;
  const cellRows = (active, values = false) => `<div class="al-cache-grid">${[0, 1, 2, 3].map(i => `<div class="al-cache-row ${active.includes(i) ? 'al-selected' : ''}"><span>位置 ${i}</span><code>${values ? vec(toyValues[i]) : ['0', 'ln 3', 'ln 2', 'ln 4'][i]}</code><small>${active.includes(i) ? '当前块 → 片上' : '保留在 HBM'}</small></div>`).join('')}</div>`;
  const toyScores = [0, Math.log(3), Math.log(2), Math.log(4)];
  const toyValues = [[2, 0], [8, 2], [4, 6], [10, 4]];
  const online = AttentionLabMath.onlineAttention(toyScores, toyValues, [[0, 1], [2, 3]]);
  const split = AttentionLabMath.splitAttention(toyScores, toyValues, [[0, 1], [2, 3]]);
  const first = online.trace[0], second = online.trace[1];
  const stateBox = (label, state, note = '') => box(label, `m = ${num(state.m)}<br>l = ${num(state.l)}<br>u = ${vec(state.u)}`, note, 'al-state');
  const step = (title, text, visual, equation = '') => ({title, text, visual, equation});
  let positionShift = 0, stateGated = true;
  let spec;
  function flashSpec() {
    return {
      title: 'FlashAttention：两个 KV 块，怎样得到同一个 softmax 输出？',
      intro: '只展开一个 Q 的一行。4 个可见位置、V 的维度为 2、每块 2 行；分数已包含 QK 的缩放。真实 Qwen3-8B 的 head 维度为 128。这个小算例解释在线更新，不代表 GPU 时间线。',
      foot: '省掉的是完整 S/P 分数与概率表在 HBM 中的物化和往返；引入分块、片上状态 m/l/u 和重标定。所有 4 行 K/V 仍参与计算；prefill 时再让多个 Q 行共享同一 KV tile。屏蔽位置的分数置为 −∞；全屏蔽行需显式约定，本教学计算器采用零输出和 LSE=−∞。',
      steps: [
        step('先看普通路径的中间表', '普通分解先算 S，再做 softmax 得到 P，最后乘 V。这里 S 和 P 各有 4 个元素；长 prefill 中每 head 的两张表都扩成 N×N。', flow(box('HBM：Q / K / V', '1 行 Q · 4 行 K/V', '输入仍然需要'), arrow('QK / √d'), box('如果物化：完整 S → 完整 P', '[0, ln 3, ln 2, ln 4] → [0.1, 0.3, 0.2, 0.4]', '这两张完整中间表是要省掉的对象', 'al-discard'), arrow('PV'), box('最终 O', '[7.4, 3.4]', '输出仍要保存', 'al-output')), 'O = (1·[2,0] + 3·[8,2] + 2·[4,6] + 4·[10,4]) / 10'),
        step('初始化：只保留一行的归约状态', 'Q 留在片上，K/V 暂时还在 HBM。m 是已见分数的最大值，l 是以 m 为基准的指数和，u 是同一基准下的加权 V 和。', columns(box('HBM：V 共 4 行', cellRows([] , true), 'K 也按相同行范围加载'), stateBox('片上初始状态', {m: -Infinity, l: 0, u: [0, 0]}, 'u 还没有除以 l；不要把 u 当作 O')), 'm = −∞；l = 0；u = [0,0]'),
        step('加载块 A：位置 0、1', 'K/V 的前两行进入片上。Q 与这两行 K 计算得到 [0, ln 3]；这张小分数表用完就可释放，无需写回 HBM。', columns(box('HBM → 片上：V tile A', cellRows([0, 1], true)), flow(box('片上 QK tile', '[0, ln 3]', 'shape [1, 2]', 'al-active'), arrow('局部最大值'), box('m_new = ln 3', num(first.m), '第一次更新，不需要保留旧状态的贡献', 'al-state'))), 'exp(S_A − ln 3) = [1/3, 1]'),
        step('块 A 更新：得到 m、l、u', '指数以 ln 3 为基准，避免直接对大分数取 exp。把两个指数权重加入 l，把对应加权 V 加入 u。此刻只能得到“只看前两行”的临时输出。', columns(box('tile A 指数权重', vec(first.weights), '不是完整 softmax 的最终概率', 'al-active'), stateBox('片上累计状态', first, `临时 O_A = ${vec(first.output)}`)), 'l_A = 1/3 + 1 = 4/3；u_A = [2,0]/3 + [8,2] = [26/3,2]'),
        step('加载块 B：最大值变了，先统一标尺', '后两行产生 [ln 2, ln 4]。新的最大值为 ln 4，旧累计量原来以 ln 3 为基准，必须同时乘 α=exp(ln 3−ln 4)=3/4，再与新块相加。', columns(stateBox('旧状态（块 A 后）', first), flow(box('V tile B → 片上', cellRows([2, 3], true)), arrow('QK → 新基准'), box('重标定系数 α', '0.75', '旧 l 和旧 u 都乘 0.75', 'al-active'))), 'm_new = max(m_old, max S_B)；α = exp(m_old − m_new) = 0.75'),
        step('合并块 B：缩放旧量，再加新量', '块 B 的指数权重是 [0.5,1]。旧 l 变成 1，旧 u 变成 [6.5,1.5]；加上块 B 的 l=1.5 与 u=[12,7]。这一步没有把旧块数据读回来。', columns(box('旧量 × α', `l = ${num(second.previous.l * second.alpha)}<br>u = ${vec(second.previous.u.map(x => x * second.alpha))}`, '保留历史的贡献', 'al-state'), box('新块贡献', `l = 1.5<br>u = ${vec(second.contribution)}`, '权重 [0.5, 1]', 'al-active'), stateBox('合并后的片上状态', second)), 'l_new = α·l_old + Σ exp(S_B−m_new)；u_new = α·u_old + Σ exp(S_B−m_new)·V_B'),
        step('收尾：只写最终输出', '所有块处理完后，再把 u 除以 l。输出与直接对 4 个分数做 softmax 一致（忽略浮点舍入次序）；全程没有在 HBM 中保存完整 S 或 P。', flow(stateBox('最终片上状态', second), arrow('逐元素除以 l = 2.5'), box('写回 HBM：O', vec(online.output), 'u/l = [18.5, 8.5]/2.5', 'al-output')), 'O = [7.4,3.4]；需要时还可保存 LSE = m + ln l = ln 10')
      ]
    };
  }
  function decodeSpec() {
    return {
      title: 'Flash-Decoding：切开 KV 轴，让一个 Q 也有足够的并行任务',
      intro: '仍用上面的 4 行数据，拆成两个 partition。动画先分别算，再展示归约；图上左右两条支路表示可并行任务，不表示真实 GPU 的执行顺序。',
      foot: '引入额外 partition 任务、partial O / LSE 缓冲及合并归约；KV 总扫描集合没有变小。长上下文、小 batch 可能受益，短上下文或并行度已足够时额外成本可能不划算。',
      steps: [
        step('decode 的 Q 只有一行', 'prefill 可以沿许多 Q 行派发工作；decode 每个请求通常只新增一个 Q。把一整条长 KV 串行交给一个任务，可能无法占满设备。', flow(box('当前 Q', '[1, 1, d]', '以单请求单 head 为例'), arrow('KV 轴切成两个不重叠区间'), columns(box('任务 A', '位置 0、1', '读 K_A、V_A'), box('任务 B', '位置 2、3', '读 K_B、V_B'))), '所有 partition 的并集仍是完整可见 KV'),
        step('各分区独立算局部 attention', '每个任务可在内部用在线 softmax，得到自己的归一化输出及 LSE。局部输出的分母不同，不能直接等权平均。', columns(box('partition A：局部输出', vec(split.partials[0].output), `LSE_A = ln 4 = ${num(split.partials[0].lse)}`, 'al-active'), box('partition B：局部输出', vec(split.partials[1].output), `LSE_B = ln 6 = ${num(split.partials[1].lse)}`, 'al-active')), 'O_A = [6.5,1.5]；O_B = [8,14/3]；LSE_j = log Σ exp(S_j)'),
        step('合并前：用 LSE 恢复各分区的相对质量', '先减去最大的 LSE 再取 exp，既能得到正确相对权重，也能避免大分数导致溢出。注意 LSE 不是位置数，也不是局部最大值 m。', flow(columns(box('A 的未归一化质量', 'exp(ln 4 − ln 6) = 2/3', '', 'al-active'), box('B 的未归一化质量', 'exp(ln 6 − ln 6) = 1', '', 'al-active')), arrow('除以质量总和 5/3'), box('最终归约权重', vec(split.weights), 'A 占 0.4，B 占 0.6', 'al-state')), 'w_j = exp(LSE_j−LSE_max) / Σ_r exp(LSE_r−LSE_max)'),
        step('加权合并：得到与完整 attention 一样的结果', 'A 的局部输出乘 0.4，B 的局部输出乘 0.6，再相加。若直接算两者的均值，会得到错误的 [7.25,3.083333]。', flow(columns(box('A 的贡献', vec(split.partials[0].output.map(x => x * split.weights[0]))), box('B 的贡献', vec(split.partials[1].output.map(x => x * split.weights[1])))), arrow('跨 partition 归约'), box('最终 O', vec(split.output), '与串行在线 softmax / 普通 softmax 相同', 'al-output')), 'O = 0.4·[6.5,1.5] + 0.6·[8,14/3] = [7.4,3.4]'),
        step('放回真实 decode shape', 'Qwen3-8B 单请求：Q=[1,32,1,128]，K/V 各为 [1,8,N,128]。每个任务还要正确处理 4 个 Q head 共享一个 KV head；partition 数是调度选择，不改变模型 head 数。', flow(box('同一 GQA 缓存', 'K/V 各 [1, 8, N, 128]', '全历史仍然存在并参与计算'), arrow('沿 N 拆 P 个分区'), box('部分结果（逻辑形状）', 'O_part [1, 32, P, 128]<br>LSE_part [1, 32, P]', '有额外的存储和归约成本', 'al-state'), arrow('按 LSE 合并 P'), box('输出', '[1, 32, 1, 128]', '维度与未切分时一样', 'al-output')), '优化的是任务并行度与访存利用率，不是把 O(Nd) 扫描变成 O(1)')
      ]
    };
  }
  function ropeSpec() {
    const p = 1000 + positionShift, n = 500 + positionShift, q = AttentionLabMath.rope([1, 2], p, 0.001), k = AttentionLabMath.rope([2, 1], n, 0.001);
    const dot = q.output.reduce((sum, x, i) => sum + x * k.output[i], 0);
    const circle = (pair, transformed, label) => {
      const point = a => [90 + a[0] * 25, 90 - a[1] * 25];
      const a = point(pair), b = point(transformed);
      return `<svg class="al-rotation" viewBox="0 0 180 180" role="img" aria-label="${label} 旋转前后：灰色为原向量，绿色为旋转后向量"><circle cx="90" cy="90" r="56" fill="none" stroke="#c8d6c5" stroke-dasharray="4 4"/><path d="M15 90H165M90 15V165" fill="none" stroke="#b0bcae"/><line x1="90" y1="90" x2="${a[0]}" y2="${a[1]}" stroke="#8b9287" stroke-width="2"/><circle cx="${a[0]}" cy="${a[1]}" r="4" fill="#8b9287"/><line x1="90" y1="90" x2="${b[0]}" y2="${b[1]}" stroke="#38674c" stroke-width="3"/><circle cx="${b[0]}" cy="${b[1]}" r="5" fill="#38674c"/><text x="13" y="18" font-size="11" fill="#365344">${label}</text></svg>`;
    };
    return {
      title: 'RoPE：同一对通道，在不同位置旋转不同角度',
      intro: 'Qwen3-8B 的 d_head=128、θ=1,000,000；按 split-half 配对，第 i=32 对是通道 (32,96)，ω=θ^(−2i/128)=0.001。这里 Q=(1,2)、K=(2,1) 是 head norm 后的单 pair 教学输入，不是模型实测输出。',
      foot: '每个 pair 使用不同频率，完整 Q/K 对全部 64 对分别旋转。K 在写入缓存前使用自己的位置；历史 K 已旋转，不因当前 Q 的位置变化而重转。V 不做 RoPE；RoPE 不缩小 KV cache，也不减少可见位置。',
      controls: '<label class="al-extra-label">共同平移 Q / K 的位置<select data-al-shift aria-label="Q 与 K 位置共同平移"><option value="0">+0：p=1000，n=500</option><option value="100">+100：p=1100，n=600</option><option value="500">+500：p=1500，n=1000</option></select></label>',
      steps: [
        step('选出一对通道，计算频率', 'split-half 配对把前 64 维和后 64 维一一配对。当前只观察通道 32 与 96，其余 63 对同时执行相同结构、不同频率的计算。', flow(box('head norm 之后', 'Q_pair = [1, 2] · K_pair = [2, 1]', '通道 (32, 96)'), arrow('由 pair 索引决定频率'), box('频率 ω_32', '0.001 rad / position', 'θ=10⁶，i=32，d=128', 'al-state')), 'ω_i = θ^(−2i/d)；ω_32 = (10⁶)^(−64/128) = 0.001'),
        step('位置乘频率，得到两个角度', 'Q 使用当前查询位置 p；K 使用它对应 token 的位置 n。位置不直接相加到激活上，而是决定旋转角。可在上方把两个位置一起平移。', columns(box('Q 的旋转角', `${p} × 0.001 = ${num(q.angle)} rad`, `cos = ${num(q.cos)}；sin = ${num(q.sin)}`, 'al-active'), box('K 的旋转角', `${n} × 0.001 = ${num(k.angle)} rad`, `cos = ${num(k.cos)}；sin = ${num(k.sin)}`, 'al-active')), `α_Q = ${num(q.angle)}；α_K = ${num(k.angle)}；α_K−α_Q = −0.5 rad`),
        step('两次乘加完成一个 pair 的旋转', '每个向量把两个通道一起旋转。右侧向量图中，灰色为旋转前、绿色为旋转后；向量长度保持不变，但它们相对于坐标轴的方向改变。', columns(box('Q_pair 旋转', circle([1, 2], q.output, 'Q') + vec(q.output), `x′ = 1·${num(q.cos)} − 2·${num(q.sin)}<br>y′ = 1·${num(q.sin)} + 2·${num(q.cos)}`, 'al-active'), box('K_pair 旋转', circle([2, 1], k.output, 'K') + vec(k.output), `x′ = 2·${num(k.cos)} − 1·${num(k.sin)}<br>y′ = 2·${num(k.sin)} + 1·${num(k.cos)}`, 'al-active')), '[x′,y′] = [x cos α − y sin α, x sin α + y cos α]'),
        step('点积感知的是相对位置', 'Q 与 K 同时平移相同的距离，两根向量一起多转同一个角，内积保持不变。当前这对通道对 QK 的贡献如下；完整 attention 会把 64 对的贡献相加，再缩放。', flow(columns(box('旋转后 Q', vec(q.output)), box('旋转后 K', vec(k.output))), arrow('对应通道乘积相加'), box('这一对的内积贡献', num(dot), 'p−n 始终为 500，共同平移后不变', 'al-output')), '(R(pω)q)ᵀ(R(nω)k) = qᵀR((n−p)ω)k = 4 cos(−0.5) + 3 sin(−0.5) ≈ ' + num(dot)),
        step('放回缓存与 attention 数据流', '同一个当前 token 产生的新 Q_p 和新 K_p 都使用位置 p。前面数例中的 K_n 是较早位置 n 的历史 key，早已旋转并写入缓存；它不是本步待 append 的新 K。缓存中的 V 不做 RoPE。', flow(columns(flow(box('当前 hidden_p → 投影 → Q/K head norm', '新 Q_p [1,32,1,128]<br>新 K_p [1,8,1,128]', `同一个当前 token，位置都是 p=${p}`), arrow(`Q_p 与 K_p 都按 p=${p} 旋转`), box('当前 Q_p 与新缓存条目 K_p', `RoPE(Q_p,p)<br>RoPE(K_p,p)`, '将新 K_p append 到缓存；保留当前 Q_p 用于查询', 'al-active')), flow(box('已有缓存：历史 K_n', `位置 n=${n}，早先已按 n 旋转`, '前面 K_pair=[2,1] 的数值例属于这一路', 'al-state'), arrow('从 cache 读取，无需再次旋转'), box('历史 RoPE(K_n,n)', '与新 K_p 一起成为可见的 key', '历史 key 保留自身的位置', 'al-state'))), arrow('当前旋转后 Q_p × 所有可见的旋转后 K'), box('softmax → 加权未旋转的 V', '[1,32,1,128]', '包括历史位置 n 与当前新追加位置 p', 'al-output')), '新 Q_p / 新 K_p 都按 p 做 RoPE；旧 K_n 早已按 n 做 RoPE。append 新 K_p 后，用 Q_p 扫描可见 K/V。')
      ]
    };
  }
  function headsSpec() {
    const headMap = kvHeads => `<div class="al-head-map">${Array.from({length: 32}, (_, h) => `<span class="al-qhead al-group-${Math.floor(h / (32 / kvHeads)) % 4}">Q${h}<small>KV${Math.floor(h / (32 / kvHeads))}</small></span>`).join('')}</div>`;
    const scene = (name, kvHeads, extra = '') => flow(box(`${name}：32 个 Q head 映射到 ${kvHeads} 个 KV head`, headMap(kvHeads), '相同 KV 标签表示共享存储，Q 仍各有自己的查询'), arrow('扫描每个 KV head 的全部 4096 行'), box('K、V 各自的逻辑 shape', `[1, ${kvHeads}, 4096, 128]`, `BF16，K+V 共 ${kvHeads * 2} MiB；本步每个请求写入 ${kvHeads * 512} B 新 KV`, 'al-state'), extra || box('QK + PV', '67,108,864 FLOPs', '按 1 FMA=2 FLOPs；32 个 Q head 并未减少', 'al-output'));
    return {
      title: 'MHA → MQA / GQA：共享的是历史 K/V，查询仍然各不相同',
      intro: '固定 B=1、N=4096、Q head=32、d=128、BF16。GQA8 是 Qwen3-8B 的配置；MHA32 与 MQA1 是保持这些 Q 维度不变的对照模型。颜色仅辅助分组；每个格子中的 KV 编号给出准确映射。',
      foot: '这是模型结构选择，不能把已训练 MHA 的 cache 随手合并就得到等价 GQA。缓存字节是逻辑容量及理想一次扫描量；实际 HBM 流量受分块、复用、cache 和并行调度影响。',
      steps: [
        step('MHA：每个 Q head 独占一组 KV', '表达空间较充分，但长上下文中每层要保留 32 组历史 K/V。每生成一个新 token，都要继续读这些历史数据。', scene('MHA', 32), '2 × 1 × 32 × 4096 × 128 × 2 B = 64 MiB'),
        step('MQA：所有 Q head 共用一组 KV', 'K/V 的投影输出与缓存缩到一组，容量降到 MHA 的 1/32。但把所有 head 的 K/V 表征共享给一组，是更强的结构约束，需要模型训练来适应。', scene('MQA', 1), '2 × 1 × 1 × 4096 × 128 × 2 B = 2 MiB；QK+PV 的 head 数仍为 32'),
        step('GQA：4 个 Q head 组成一组，共用 KV', '8 组 KV 在 MHA 的独立表征与 MQA 的紧凑缓存之间折中。组内 4 个 Q 可以复用一个 KV tile，但有各自的分数、softmax 和输出。', scene('GQA', 8), '2 × 1 × 8 × 4096 × 128 × 2 B = 16 MiB；容量是 MHA 的 1/4'),
        step('GQA + FlashAttention：叠加两个不同方向的节省', 'GQA 缩窄缓存的 head 维；FlashAttention 改变完整 attention 的执行顺序，消除完整 S/P 的 HBM 物化。它们可组合，但都没有删掉历史位置。', scene('GQA + Flash', 8, flow(arrow('读一个 KV tile，服务同组 4 个 Q'), columns(box('减少 KV 容量', 'GQA：64 → 16 MiB', 'head 共享'), box('减少 S/P 中间表 I/O', 'Flash：片上分块 + 在线状态', '分数和概率不全量写回')), box('仍然处理全部历史位置', 'N = 4096', '不是 Top-K 或窗口 attention', 'al-output'))), 'GQA 改结构；Flash 改执行。QK + PV 的 67,108,864 FLOPs 不因 KV head 共享自动下降。')
      ]
    };
  }
  function mlaSpec() {
    const strip = (tone = '') => `<div class="al-mla-strip ${tone}" aria-hidden="true">${Array.from({length: 8}, (_, i) => `<i>${i === 6 ? '…' : ''}</i>`).join('')}</div>`;
    const tensor = (name, shape, axes, tone = '') => `<div class="al-mla-tensor ${tone}"><span class="al-mla-name">${name}</span><code>${shape}</code>${strip(tone)}<small>${axes}</small></div>`;
    const link = label => `<div class="al-mla-link"><i aria-hidden="true"></i><span>${label}</span></div>`;
    const chain = (...items) => `<div class="al-mla-chain">${items.join('')}</div>`;
    const pair = (...items) => `<div class="al-mla-pair">${items.join('')}</div>`;
    const note = text => `<p class="al-mla-note">${text}</p>`;
    const frame = (focus, body, takeaway = '') => `<div class="al-mla-frame"><p class="al-mla-focus">现在追踪：${focus}</p>${body}${takeaway ? `<p class="al-mla-takeaway">${takeaway}</p>` : ''}</div>`;
    const lane = (title, body, tone = '') => `<section class="al-mla-lane ${tone}"><h6>${title}</h6>${body}</section>`;
    const compare = (left, right) => `${note('对照范围：同一 MLA 模型、同一个 head、同一组权重；只改变计算顺序。')}${pair(lane('A · 先展开历史，再计算', left, 'al-mla-expanded'), lane('B · 直接使用压缩缓存', right, 'al-mla-direct'))}`;
    const cache = (next = false) => {
      const last = next ? 4096 : 4095;
      return `<div class="al-mla-cache"><div class="al-mla-cache-head"><span>位置 n ↓</span><span>压缩 KV 向量：512 通道 →</span><span>位置 K：64 →</span></div>${[0, 1, '…', last].map(n => `<div class="al-mla-cache-row ${n === last ? 'al-mla-new' : ''}"><span>${n}${n === last ? '<small>本步新增</small>' : ''}</span><div>${n === '…' ? '<b>…</b>' : strip()}<small>${n === '…' ? '中间位置仍保留' : `c${n === last ? 'ₜ' : 'ₙ'} [512]`}</small></div><div>${n === '…' ? '<b>…</b>' : strip('al-mla-position')}<small>${n === '…' ? '…' : 'kᴿ [64]'}</small></div></div>`).join('')}<p>C [${last + 1},512] ＋ Kᴿ [${last + 1},64]<br><span>两个 shape 的第一轴都表示可见 token 数</span></p></div>`;
    };
    return {
      title: '跟着一个 token 看 MLA：缓存什么，怎样打分，怎样得到输出？',
      intro: '以 DeepSeek-V2 的一层、一个请求、一次 decode 为例；本步处理 1 个新 token，加入后共可见 4096 个位置。图中的 shape 都标明轴含义；通道色块是示意，512 等宽度来自这个模型的配置。',
      foot: '这里展示 MLA 的逻辑数据流与紧凑缓存执行方式，具体实现可以分块、融合，无需把每个中间量写入 HBM。MLA 需要对应的模型结构与训练；全量 MLA 仍访问所有可见位置。',
      steps: [
        step('当前 token 先生成一份压缩 KV 向量', 'MLA 为每个 token 生成一个供各个 head 共同使用的压缩 KV 向量，记作 c；后面会从它得到各 head 需要的 K 内容和 V。DeepSeek-V2 把 c 的宽度配置为 512，这个数字不是 MLA 的通用常数。', frame('当前 token 的输入 → 压缩 KV 向量 c', chain(tensor('进入 Attention 的 xₜ', '[1,5120]', '1 个 token × 5120 个隐藏通道；已做层输入 RMSNorm'), link('线性投影：5120 → 512，再对这 512 维做 RMSNorm'), tensor('当前 token 的压缩 KV 向量 cₜ', '[1,512]', '1 个 token × 512 个压缩通道', 'al-mla-content')), '先记住 c 的用途：用一份向量，表示这个 token 的各个 head 所需的 K 内容与 V。'), 'cₜ = RMSNorm(xₜ W_DKV)；W_DKV 的 shape 为 [5120,512]。'),
        step('共享 c，为什么仍能得到不同 head 的 K 和 V？', '每个 head 有自己的一组 K、V 映射权重，因此同一份 c 可以产生不同的 K 内容和 V。下面只展开 head 0、head 1；这个模型共 128 个 head，K 的位置部分稍后加入。', frame('同一个 cₜ → 不同 head 的 K 内容与 V', chain(tensor('所有 head 共用这一份 cₜ', '[1,512]', '1 个 token × 512 个压缩通道', 'al-mla-content'), `<div class="al-mla-fork">${lane('head 0', chain(link('c 分别经过 head 0 的 K、V 映射（两路并行）'), tensor('K 的内容部分 k₀ᶜ', '[1,128]', '1 个 token × 128 个内容通道'), tensor('V₀', '[1,128]', '1 个 token × 128 个 value 通道')))}${lane('head 1', chain(link('c 分别经过 head 1 的 K、V 映射（两路并行）'), tensor('K 的内容部分 k₁ᶜ', '[1,128]', '1 个 token × 128 个内容通道'), tensor('V₁', '[1,128]', '1 个 token × 128 个 value 通道')))}</div>`), '共享的是输入 c；各 head 的映射权重不同，得到的 K 内容与 V 也可以不同。'), '每个 head i：kᶜᵢ = cₜ A_K,i；vᵢ = cₜ A_V,i。A_K,i 与 A_V,i 的 shape 都是 [512,128]，但权重不同。'),
        step('真正存入历史：512 维 c，加 64 维位置 K', '同一个输入 xₜ 还会投影出 64 维位置 K，按当前位置 t 做 RoPE；它与 cₜ 一起追加到历史，已有行保持不变。每个位置只保存 512＋64 个数，供所有 head 使用。', frame('当前 token 的两段数据 → 追加一行历史', chain(pair(tensor('第 1 步得到的 cₜ', '[1,512]', '512 个压缩通道；不做 RoPE', 'al-mla-content'), tensor('xₜ → 64 维投影 → RoPE(t)', '[1,64]', '64 个位置通道；所有 head 共享', 'al-mla-position')), link('追加到当前层的缓存：4095 行 → 4096 行'), cache()), '绿色区域保存 c，蓝色区域保存位置 K；最下面一行是本步新增的 token。'), '单层、单请求、BF16：4096 × (512+64) × 2 B = 4.5 MiB；只计这两张缓存，不含分页等元数据。'),
        step('当前 Q：每个 head 分成内容和位置两部分', '当前输入还会生成 128 个查询头，每个头含 128 维内容 Q 和 64 维位置 Q；只有位置 Q 做 RoPE。Q 只用于本步查询，不写入历史缓存。', frame('当前 token 的输入 → 各 head 的 Q', chain(tensor('当前输入 xₜ', '[1,5120]', '1 个 token × 5120 个隐藏通道'), link('Q 投影 → reshape 为 128 个查询头'), pair(tensor('内容查询 Qᶜ', '[128,128]', '128 个 head × 每头 128 个内容通道', 'al-mla-content'), tensor('位置查询 Qᴿ，已做 RoPE(t)', '[128,64]', '128 个 head × 每头 64 个位置通道', 'al-mla-position'))), '完整 Q/K 的每头宽度是 128＋64＝192；head 数也恰好是 128，二者含义不同。') + note('Q 投影的实现细节：5120 → 1536 → RMSNorm → 128×192。1536 是 Q 的中间宽度，与缓存 c 的 512 维无关。'), '当前 Q 按 t 旋转；历史位置 K 已在写入时按各自位置 n 旋转，本步不重转旧行。'),
        step('为什么把 RoPE 留在独立的位置分支？', '下一步要把 K 的映射移到当前 Q 一侧，内容分支因此需要对所有历史位置使用同一套映射。若在展开的内容 K 上加入随位置变化的旋转，这个映射通常就不能直接移过去。', frame('两条分支各自负责什么', pair(lane('内容分支 · 不旋转', chain(tensor('每个位置保存的 cₙ', '[512]', '512 个压缩通道', 'al-mla-content'), link('该 head 的 K 映射：所有位置相同'), tensor('该 head 的 K 内容', '[128]', '128 个内容通道；不插入 RoPE', 'al-mla-content'))), lane('位置分支 · 各自旋转', chain(tensor('当前 Qᴿ 与历史 Kᴿ', '[64] 与 [64]', '两边各有 64 个位置通道', 'al-mla-position'), link('Q 使用当前位置 t；K 使用历史位置 n'), tensor('位置点积', '1 个分数', '为这个 head 对位置 n 的分数贡献位置关系', 'al-mla-position')))), '内容与位置分别计算点积，稍后把两个分数相加，仍只得到一套 attention 权重。'), '内容分数：qᶜᵢ · (cₙ A_K,i)；位置分数：qᴿᵢ · kᴿₙ。先相加，再一起归一化。'),
        step('K 路：把映射移到当前 Q，省掉历史 K 的展开', '左侧先为 4096 个位置生成这个 head 的 K 内容，右侧只变换当前的一条 Q，直接与缓存 C 点积。两边得到相同的 4096 个内容分数，右侧省掉整段历史 K 的恢复与物化。', frame('同一个 head 的内容分数如何计算', compare(chain(tensor('压缩缓存 C', '[4096,512]', '4096 个位置 × 每位置 512 通道', 'al-mla-content'), link('每行乘该 head 的 A_K'), tensor('展开后的 K 内容', '[4096,128]', '4096 个位置 × 每位置 128 通道'), link('与当前 qᶜ [128] 点积'), tensor('内容分数 Sᶜᵢ', '[4096]', '每个历史位置一个分数', 'al-mla-result')), chain(tensor('当前 qᶜᵢ', '[128]', '这个 head 的 128 个内容通道'), link('乘 A_K 的转置；只处理当前 Q'), tensor('变换后的查询 q̃ᵢ', '[512]', '512 通道，与 c 的宽度一致', 'al-mla-content'), link('与 C 的全部 4096 行点积'), tensor('相同的内容分数 Sᶜᵢ', '[4096]', '每个历史位置一个分数', 'al-mla-result'))), '这叫 K 的“吸收”：把一侧的线性映射改放到另一侧，不是删除历史位置。'), 'qᶜᵢ (C A_K,i)ᵀ = (qᶜᵢ A_K,iᵀ) Cᵀ。等价关系按实数运算成立，浮点舍入次序可能不同。'),
        step('内容分数＋位置分数，再做同一次 softmax', '每个 head 都得到 4096 个内容分数和 4096 个位置分数，逐位置相加后，使用模型原有的 scale、mask，再做一次 softmax。吸收后点积宽度成为 512＋64＝576，但不能因此把 scale 改成 1/√576。', frame('同一个 head，对每个可见位置产生一个权重', chain(pair(tensor('内容分数 Sᶜᵢ', '[4096]', 'q̃ᵢ[512] 与每行 cₙ[512] 点积', 'al-mla-content'), tensor('位置分数 Sᴿᵢ', '[4096]', 'qᴿᵢ[64] 与每行 kᴿₙ[64] 点积', 'al-mla-position')), `<div class="al-mla-merge"><span aria-hidden="true">＋</span><b>同一位置的两个分数相加</b></div>`, link('原有 scale → mask → 沿 4096 个位置做一次 softmax'), tensor('这个 head 的 attention 权重 Pᵢ', '[4096]', '4096 个位置各有一个权重；合计为 1', 'al-mla-result')), '原始每头 Q/K：192 维。直接查询缓存时：576 维。计算顺序改变，原模型的分数与缩放规则保持不变。'), '基础 scale 依据原始宽度 128+64；实际仍须保留 checkpoint 的 YaRN 等修正。逻辑上全部 head 的 P 为 [128 heads,4096 positions]。'),
        step('V 路：先加权压缩缓存，再恢复每头输出', '左侧先为每个位置生成 V，再按 attention 权重加权；右侧先对 c 加权，最后只做一次 V 映射。两边得到相同的 128 维 head 输出，右侧省掉 4096 行 V 的展开。', frame('同一个 head，用第 7 步的权重 Pᵢ 取值', compare(chain(tensor('压缩缓存 C', '[4096,512]', '4096 个位置 × 每位置 512 通道', 'al-mla-content'), link('每行乘这个 head 的 A_V'), tensor('展开后的 V', '[4096,128]', '4096 个位置 × 每位置 128 通道'), link('用 Pᵢ[4096] 对所有位置加权求和'), tensor('这个 head 的输出 oᵢ', '[128]', '128 个 value 通道', 'al-mla-result')), chain(tensor('同一份压缩缓存 C', '[4096,512]', '所有 head 读 C，各有自己的权重 Pᵢ', 'al-mla-content'), link('先用 Pᵢ 对所有位置加权求和'), tensor('本步临时结果 zᵢ', '[512]', '512 个压缩通道；不写入历史', 'al-mla-content'), link('再乘这个 head 的 A_V'), tensor('相同的 head 输出 oᵢ', '[128]', '128 个 value 通道', 'al-mla-result'))), '512 是加权时的中间宽度，最终每头输出仍是 128 维。'), '(Pᵢ C) A_V,i = Pᵢ (C A_V,i)。这条路径仍要加权全部 4096 个位置。'),
        step('拼接 128 个 head，回到模型的隐藏维度', '每个 head 得到 128 维输出，拼接后是 16384 维，再经输出投影回到 5120 维。该结果接回残差与后续 FFN/MoE。', frame('各 head 的输出 → 当前 token 的 attention 输出', chain(tensor('128 个 head 的输出', '[128,128]', '128 个 head × 每头 128 个 value 通道', 'al-mla-result'), link('按 head 拼接：128 × 128 = 16384'), tensor('当前 token 的拼接结果', '[1,16384]', '1 个 token × 16384 个拼接通道'), link('输出投影 W_O：[16384,5120]'), tensor('本层 attention 输出', '[1,5120]', '1 个 token × 5120 个隐藏通道', 'al-mla-result')), '压缩缓存的 512 维、每头输出的 128 维、网络隐藏层的 5120 维，承担不同角色。'), '实现可以融合部分投影；融合不改变这里的输入、输出与缓存语义。'),
        step('这一轮结束：哪些留下，哪些不进入缓存？', '当前 Q、attention 权重和各 head 的临时结果只服务本步；第 3 步写入的 C 与位置 K 留给下一次 decode。下一 token 会从自己的输入生成新 c 和位置 K，再追加一行，全量 MLA 仍访问所有可见行。', frame('本步临时数据，与跨步保留的历史', pair(lane('本步临时 · 用完可释放', chain(tensor('当前 Q 与 attention 权重', 'Q · P', '用于当前 token 查询历史'), tensor('加权结果与 head 输出', 'Z · O_heads', '用于产生当前 token 的 attention 输出'), note('本步输出交给后续网络；这些临时量不追加到 KV cache。'))), lane('历史缓存 · 第 3 步已写入', chain(cache(), link('下一 token 生成自己的 c 和位置 K，再追加'), tensor('下一步可见缓存', 'C [4097,512] ＋ Kᴿ [4097,64]', '4097 个位置；每位置仍保存 512＋64 个数', 'al-mla-content')))), 'MLA 缩小的是每个位置保存的数据；历史位置数仍随上下文增长。'), '主线：当前输入 → c 与位置 K 入缓存 → 当前 Q 查询历史 → 两路分数一起 softmax → 加权 C → 每头输出 → 拼接与输出投影。')
      ]
    };
  }
  function sparseSpec() {
    const index = [0.1, 0.8, 0.3, 0.2, 0.9, 0.4, 0.6, 0.5], picked = [4, 1];
    const rows = (phase) => `<div class="al-sparse-rows">${index.map((v, i) => `<div class="${phase > 0 && picked.includes(i) ? 'al-selected' : ''}"><span>历史行 ${i}</span><code>${phase > 0 ? `索引分数 ${num(v)}` : 'latent + index key'}</code><small>${phase > 1 ? (picked.includes(i) ? 'gather → 主 attention' : '仍保留，当前未读取主 latent') : '缓存仍存在'}</small></div>`).join('')}</div>`;
    const sparseOutput = AttentionLabMath.onlineAttention([Math.log(2), Math.log(3)], [[4, 6], [8, 2]]).output;
    return {
      title: '稀疏 attention：先找位置，再对选中的内容重算 attention',
      intro: '教学例共 8 个历史位置，indexer 选 Top-2。索引分数是人为给定的小数，主 attention 分数另外设为 [ln 2, ln 3]；它们不是同一张表。这里只演示 DSA 类选择路径，不复现某个模型的具体 indexer 数值。',
      foot: '省掉的是未选位置进入主 attention 的重计算和主 latent 读取；引入 index key / 权重、索引评分、Top-K、gather 及间接访问。完整缓存通常仍保留；索引器本身也要处理历史信息，所以不应声称总工作变成纯 O(k)。',
      steps: [
        step('问题：缓存紧凑了，N 仍在增长', 'MLA 缩小每位置表示，但完整 attention 仍需扫描 N 个位置。若只让少量候选进入昂贵的主 attention，需要先决定保留谁。', box('全部历史行仍存储', rows(0), '本步可见 N=8；教学 Top-k=2'), '缓存容量与本步主 attention 的访问量是两件事'),
        step('indexer：用更便宜的索引表征打分', '索引器对候选历史位置产生相关性分数。它的目标是找到值得交给主 attention 的位置，不是直接产生最终的 softmax 概率。', box('索引分数', rows(1), '最高两项为行 4 的 0.9、行 1 的 0.8', 'al-active'), 'index scores = [0.1,0.8,0.3,0.2,0.9,0.4,0.6,0.5]'),
        step('Top-K → gather：访问集合开始变小', '选择得到行号 [4,1]，据此 gather 主 attention 需要的 latent / key。其余 6 行没有从缓存中删除，只是本步不参加主 attention。', flow(box('Top-2 行号', '[4, 1]', '稀疏访问通常不连续', 'al-active'), arrow('间接地址 gather'), box('保留缓存，选择访问', rows(2))), '存储 8 行 ≠ 本步主 attention 读取 8 行；Top-K 自身也有代价'),
        step('主 attention：重新打分，再归一化', '对选中的行计算主模型分数。示例中行 4 的主分数为 ln 2，行 1 为 ln 3；尽管行 4 的索引分数更高，主 attention 仍给行 1 更高权重。', flow(columns(box('选中行 4', '主分数 ln 2 → 权重 0.4', 'V=[4,6]'), box('选中行 1', '主分数 ln 3 → 权重 0.6', 'V=[8,2]')), arrow('仅在选中集合内做 softmax / 加权'), box('稀疏输出', vec(sparseOutput), '是这个稀疏模型的结果，不保证等于全量 8 行 attention', 'al-output')), 'O_sparse = 0.4·[4,6] + 0.6·[8,2] = [6.4,3.6]'),
        step('算清净收益，不能只数被省掉的行', '真实性能取决于 N、选中 k、indexer 代价、Top-K 实现和 gather 的连续性。若 k 接近 N 或 N 很短，选择与间接访问的额外成本可能抵消收益。', columns(box('节省', '主 attention：N → k', '减少主 latent 读取与重打分', 'al-output'), box('引入', 'indexer + Top-K + gather', '额外计算、缓存和不规则访存', 'al-state'), box('语义变化', '只对选中集合归一化', '需训练/验证质量；不是 Flash 的精确执行重排')), '完整历史缓存、索引扫描、主 attention 扫描：三个边界要分别记账')
      ]
    };
  }
  function stateSpec() {
    const old = [[1, 0], [0, 1]], alpha = stateGated ? [0.5, 1] : [1, 1];
    const forgotten = AttentionLabMath.gateState(old, alpha);
    const next = AttentionLabMath.deltaStep(forgotten, [1, 0], [3, 4], 0.5, [0, 1]);
    const nextQuery = next.state[0];
    const matBox = (label, s, note, tone = '') => box(label, `<span class="al-matrix">${s.map(row => row.map(x => `<span>${num(x)}</span>`).join('')).join('')}</span>`, note, tone);
    return {
      title: 'Delta / KDA 状态：先遗忘，再预测误差，最后读出',
      intro: '教学状态 S=[2,2]，行对应 key 维、列对应 value 维。已有状态 S_old=I；本步 k=[1,0]、v=[3,4]、β=0.5、q=[0,1]。切换无遗忘 Delta 与通道遗忘示例，观察同一次写入如何改变历史。不是 softmax attention 的等价改写。',
      controls: '<label class="al-extra-label">状态更新方式<select data-al-gate aria-label="状态更新是否先遗忘"><option value="gated">KDA 教学：α=[0.5,1]，先遗忘</option><option value="delta">Delta 教学：α=[1,1]，不遗忘</option></select></label>',
      foot: '状态尺寸固定时，容量不随历史长度 N 增长；每 token 仍要读写状态矩阵。KDA 还有实际的门控参数化、投影、归一化与短卷积状态，本图只展开核心矩阵递推。有限状态会混合/覆盖历史，不能任意取回某个 token 的完整 K/V。',
      steps: [
        step('已有记忆 + 本步的新关联', '状态不是空白：I 矩阵代表此前写入的历史摘要。本步将 k=[1,0] 对应的 value 更新向 [3,4]；没有为新 token 另加一行缓存。', columns(matBox('历史 S_old', old, '始终是 [d_k,d_v]=[2,2]', 'al-state'), box('当前 token', 'k=[1,0] · v=[3,4]<br>β=0.5 · q=[0,1]', 'key 为单位长度；β 控制误差写入强度', 'al-active')), '输入旧状态 → 可选通道遗忘 → 预测 → 误差 → 写入 → Q 读取'),
        step('先遗忘：按 key 通道缩放旧状态的行', stateGated ? 'α=[0.5,1]：第一行历史减半，第二行保留。遗忘必须先发生，后续预测使用缩放后的 S_bar，不能先计算旧预测再补乘门控。' : 'α=[1,1]：两行历史均保留，这是本例不遗忘的 Delta 路径。把上方切到 KDA 教学，可观察先衰减第一行带来的变化。', flow(columns(matBox('旧 S_old', old, ''), box('当前通道保留系数 α', vec(alpha), stateGated ? '第 1 个 key 通道保留一半' : '各通道完整保留', 'al-active')), arrow('S_bar = diag(α) S_old'), matBox('预测使用的 S_bar', forgotten, '先遗忘，再预测', 'al-state')), `S_bar = diag(${vec(alpha)})·I = ${matrix(forgotten)}`),
        step('用 key 读取：当前记忆已经预测了什么？', 'k=[1,0] 读取 S_bar 的第一行。这不是当前 q 的最终输出，而是用来判断新 value 还差多少的预测。', flow(columns(matBox('先前得到的 S_bar', forgotten, '读取的是遗忘后的状态', 'al-state'), box('写入 key', '[1,0]', '选择当前要修正的关联')), arrow('prediction = kᵀS_bar'), box('已有预测', vec(next.prediction), '与目标 v=[3,4] 比较', 'al-active')), `prediction = [1,0] × S_bar = ${vec(next.prediction)}`),
        step('误差与外积：只写需要修正的部分', '目标 value 减去预测得到 residual。将误差乘 β=0.5，再沿 key 方向形成外积。当前 key 的第二维为 0，所以第二行不被这次写入改变。', columns(box('residual = v − prediction', vec(next.residual), `[3,4] − ${vec(next.prediction)}`, 'al-active'), matBox('ΔS = β·k⊗residual', next.update, '第一行写入，第二行为零', 'al-active')), `ΔS = 0.5·[1,0]ᵀ·${vec(next.residual)} = ${matrix(next.update)}`),
        step('写入新状态：形状保持不变', '将误差更新加到 S_bar。注意加法的基底是遗忘后的状态，而非原始 S_old；把遗忘与写入的次序颠倒，会得到另一个结果。', flow(columns(matBox('基底 S_bar', forgotten, '', 'al-state'), matBox('误差写入 ΔS', next.update, '', 'al-active')), arrow('S_new = S_bar + ΔS'), matBox('新的历史摘要 S_new', next.state, '仍为 [2,2]，没有累积 token 行', 'al-state')), `S_new = ${matrix(forgotten)} + ${matrix(next.update)} = ${matrix(next.state)}`),
        step('当前 Q 读出：这次刚好看不出第一行变化', '本步 q=[0,1] 读取第二行，结果在两种模式下都是 [0,1]。不能只看这一次输出就断言状态没有变化：被改写的第一行已经留下不同的记忆。', flow(matBox('新 S_new', next.state, '第一行随遗忘模式而不同', 'al-state'), arrow('o = qᵀS_new；q=[0,1]'), box('当前输出', vec(next.output), '两种模式均为 [0,1]', 'al-output')), 'q=[0,1] 只读第二行；当前输出相同不代表整个状态相同'),
        step('后续查询不同方向，就会读出不同的记忆', '为隔离这一差异，先不做下一次写入，直接用另一个 probe q=[1,0] 读取同一状态。无遗忘模式读出 [2,2]，通道遗忘模式读出 [1.75,2]。真实后续 token 还会继续执行自身更新。', flow(columns(matBox('保留下来的 S_new', next.state, '有限状态中的历史摘要', 'al-state'), box('诊断用 probe q', '[1,0]', '此处只读，不做新的 token 更新')), arrow('读取第一行'), box('probe 输出', vec(nextQuery), stateGated ? 'KDA 教学：先遗忘后写入' : 'Delta 教学：直接误差写入', 'al-output')), '固定状态省掉随 N 增长的逐 token cache，但引入遗忘、覆盖与历史压缩；需按此记忆规则训练模型')
      ]
    };
  }
  const factories = {flash: flashSpec, decode: decodeSpec, rope: ropeSpec, heads: headsSpec, mla: mlaSpec, sparse: sparseSpec, state: stateSpec};
  spec = factories[kind]();
  let current = 0, timer = null;
  root.classList.add('attention-lab');
  root.tabIndex = 0;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', spec.title);
  root.innerHTML = `<header class="al-header"><span class="al-eyebrow">FOLLOW THE DATA · STEP BY STEP</span><h4>${spec.title}</h4><p>${spec.intro}</p></header><div class="al-controls"><div class="al-buttons"><button type="button" data-al-action="previous" aria-label="上一步">← 上一步</button><button type="button" data-al-action="next" aria-label="下一步">下一步 →</button><button type="button" data-al-action="play" aria-pressed="false">播放</button><button type="button" data-al-action="reset">重置</button></div><span class="al-counter" data-al-counter aria-live="polite"></span>${spec.controls || ''}<small>逐步看数据；可用 ← / → 键切换，Home / End 跳到首尾。播放只由你手动启动。</small></div><div class="al-progress" data-al-progress aria-label="计算步骤"></div><section class="al-scene" data-al-scene aria-live="off"></section><div class="al-print" data-al-print></div><p class="al-footnote">${spec.foot}</p>`;
  const select = key => root.querySelector(`[data-al-${key}]`);
  const action = key => root.querySelector(`[data-al-action="${key}"]`);
  function pause() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    root.dataset.playing = 'false';
    action('play').textContent = '播放';
    action('play').setAttribute('aria-pressed', 'false');
  }
  function render() {
    const item = spec.steps[current];
    root.dataset.step = String(current);
    select('counter').textContent = `${current + 1} / ${spec.steps.length} · ${item.title}`;
    select('progress').innerHTML = spec.steps.map((s, i) => `<button type="button" data-al-goto="${i}"${i === current ? ' aria-current="step"' : ''} aria-label="第 ${i + 1} 步：${s.title}">${i + 1}</button>`).join('');
    select('scene').innerHTML = `<h5>${item.title}</h5><p>${item.text}</p><div class="al-visual">${item.visual}</div>${item.equation ? `<p class="al-equation"><code>${item.equation}</code></p>` : ''}`;
    action('previous').disabled = current === 0;
    action('next').disabled = current === spec.steps.length - 1;
    if (current === spec.steps.length - 1) pause();
  }
  function renderPrint() {
    const last = spec.steps[spec.steps.length - 1];
    select('print').innerHTML = `<h5>完整计算步骤（打印版）</h5><ol>${spec.steps.map(item => `<li><strong>${item.title}</strong><p>${item.text}</p>${item.equation ? `<code>${item.equation}</code>` : ''}</li>`).join('')}</ol><div class="al-visual">${last.visual}</div>`;
  }
  function go(next) { pause(); current = Math.max(0, Math.min(spec.steps.length - 1, next)); render(); }
  function play() {
    if (timer !== null) { pause(); return; }
    if (current === spec.steps.length - 1) current = 0;
    render();
    root.dataset.playing = 'true';
    action('play').textContent = '暂停';
    action('play').setAttribute('aria-pressed', 'true');
    timer = window.setInterval(() => {
      if (!root.isConnected || document.hidden || root.getClientRects().length === 0) { pause(); return; }
      current = Math.min(spec.steps.length - 1, current + 1);
      render();
    }, 2600);
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.alGoto !== undefined) go(Number(button.dataset.alGoto));
    if (button.dataset.alAction === 'previous') go(current - 1);
    if (button.dataset.alAction === 'next') go(current + 1);
    if (button.dataset.alAction === 'reset') go(0);
    if (button.dataset.alAction === 'play') play();
  });
  root.addEventListener('keydown', event => {
    if (event.target.matches('input,select,textarea,button,a')) return;
    const targets = {ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: spec.steps.length - 1};
    if (Object.hasOwn(targets, event.key)) { event.preventDefault(); go(targets[event.key]); }
    if (event.key === ' ') { event.preventDefault(); play(); }
  });
  if (kind === 'rope') root.querySelector('[data-al-shift]').addEventListener('change', event => {
    pause(); positionShift = Number(event.target.value); spec = ropeSpec(); render(); renderPrint();
  });
  if (kind === 'state') root.querySelector('[data-al-gate]').addEventListener('change', event => {
    pause(); stateGated = event.target.value === 'gated'; spec = stateSpec(); render(); renderPrint();
  });
  const visibility = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { if (entries.some(entry => !entry.isIntersecting)) pause(); }) : null;
  if (visibility) visibility.observe(root);
  AttentionLabRuntime.register({root, pause: () => { pause(); if (!root.isConnected && visibility) visibility.disconnect(); }});
  render();
  renderPrint();
}
