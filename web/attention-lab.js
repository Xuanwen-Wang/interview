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
    return {
      title: 'MLA 完整一轮 decode：一个 token 怎样经过压缩、打分，再变回 hidden？',
      intro: '固定 DeepSeek-V2：B=1，本步只输入 1 个 token，hidden=5120，Q heads=128。下面省略固定的 batch 轴；[1,…] 的 1 表示本步 token。N=4096 包括刚追加的当前 token。1536、512、128、64 都是通道宽度，只有“128 个 Q heads”表示头数。权重按行向量乘法标 shape；这里展示论文紧凑缓存 / 吸收执行路径的逻辑示意，不代表某个 Hugging Face 参考实现已采用这种缓存或 kernel。',
      foot: 'MLA 训练出共享的低维 KV 表示，再用线性代数重排避免每步恢复整段历史的 K/V；不是任意 MHA checkpoint 的无损转换。每个位置仍缓存 512+64 个数，decode 仍扫描所有可见位置。图中的中间量是逻辑依赖，优化 kernel 可以分块、融合，并不要求每个框都写回 HBM。',
      steps: [
        step('先认维度：128 个头，不等于每头只有一个宽度', '本例有 128 个 Q head。每个 head 的内容 Q/K 是 128 维，位置 Q/K 是 64 维，所以数学上拼起来的 Q/K 是 192 维；每个 head 的 V 与最终 head 输出仍是 128 维。共享 KV latent 的 512 维是另一种存储坐标，不是把头数变成 512。', columns(flow(box('当前层的输入 hidden', 'x_t [1,5120]', '已经过该层 attention 之前的 RMSNorm'), arrow('进入两条投影支路'), box('当前 Q 支路', '128 个 head<br>每头 128 内容 + 64 位置', 'Q 只服务本步，不加入 KV cache', 'al-active')), flow(box('每个历史位置的紧凑记录', 'c_j [512] + k_jᴿ [64]', '一条记录由全部 Q heads 共同使用', 'al-state'), arrow('每个 head 有自己的内容 / 取值映射'), box('每个 head 的输出', 'o_i [128]', '拼 128 个头后是 16384 维，再映射回 5120', 'al-output'))), 'Q/K 每头：128+64=192；V 每头：128；KV latent：512；Q heads：128。这四件事分别记。'),
        step('Q 支路：先压到 1536，再生成 128 个查询头', '当前 hidden 先降维到 1536，做 RMSNorm，再上投影到 24576=128×192。reshape 后，每个 head 拆出 128 维内容查询 q_iᶜ，以及 64 维位置查询；只有后者按当前逻辑位置 t 做 RoPE。1536 是所有 Q heads 上投影前共同使用的中间宽度，不是 head_dim，也不写入历史缓存。', flow(box('当前 hidden x_t', '[1,5120]'), arrow('Q down：W_DQ [5120,1536]'), box('Q 的低秩中间量', '[1,1536] → RMSNorm → [1,1536]', '只对 Q 的 1536 个通道做此处的 Norm', 'al-active'), arrow('Q up：W_UQ [1536,24576] → reshape'), box('128 个查询头', '[128,192] = 每头 [128 内容 | 64 位置]'), arrow('沿每个 head 的通道轴拆分'), columns(box('内容查询 qᶜ', '[128,128]', '不做 RoPE', 'al-active'), flow(box('位置查询的原始通道', '[128,64]'), arrow('RoPE：使用当前位置 t'), box('位置查询 qᴿ', '[128,64]', '每个 head 各自的 Q 位置向量', 'al-active')))), '5120 → 1536 → Norm → 128×(128+64)。Q 低秩中间量与 KV latent 不是同一个 tensor。'),
        step('KV 支路：576 先拆开，512 做 Norm，64 做 RoPE', '同一个 hidden 的另一次投影生成 576 个数，先拆成两段。前 512 个数经过自己的 RMSNorm，成为当前 token 的联合 KV latent c_t；后 64 个数按 t 做 RoPE，成为全部 Q heads 共享的位置 key k_tᴿ。不要对全部 576 维一起做这个 KV RMSNorm，也不要给 c_t 的 512 维做 RoPE。', flow(box('同一个当前 hidden x_t', '[1,5120]'), arrow('KV down：W_DKV+R [5120,576]'), box('先得到两段原始通道', '[1,576] = [1,512] + [1,64]', '拆分后分别处理', 'al-active'), arrow('split'), columns(flow(box('KV 内容分支', '[1,512]'), arrow('KV RMSNorm，仅这 512 维'), box('当前 c_t', '[1,512]', '同一个 latent 同时支撑各头的 K 内容与 V', 'al-state')), flow(box('共享的位置 key 分支', '[1,64]'), arrow('RoPE：使用当前位置 t'), box('当前 k_tᴿ', '[1,64]', '只有一份，供所有 128 个 Q head 使用', 'al-state')))), 'c_t = RMSNorm(x_t W_DKV)；k_tᴿ = RoPE(x_t W_KR,t)。实现可把两个线性投影合成一个 576 维输出。'),
        step('追加缓存：历史每行只保存 512+64 个数', '将新 c_t 和新 k_tᴿ 分别追加到当前层的两张历史表。本例从 4095 行变成 4096 行；已有位置 key 早已按各自位置旋转，不随当前 t 再旋转。紧凑缓存里没有独立的完整 V 表，因为 V 能从同一份 C 通过各 head 的线性映射得到。', flow(columns(flow(box('内容历史：4095 行', 'C_old [4095,512]', '', 'al-state'), arrow('追加 c_t [1,512]'), box('本步可见的内容缓存', 'C [4096,512]', '所有 Q heads 共同读取', 'al-state')), flow(box('位置历史：4095 行', 'Kᴿ_old [4095,64]', '历史行已各自做过 RoPE', 'al-state'), arrow('追加 k_tᴿ [1,64]'), box('本步可见的位置缓存', 'Kᴿ [4096,64]', '共享 key，不按 128 个头复制', 'al-state'))), arrow('BF16 逻辑容量：只计算这两张缓存'), box('当前层 / 当前请求的 cache', '4096 × (512+64) × 2 B = 4.5 MiB', '每新增一个 token 再加 1152 B；未含分页元数据、量化 scale 等', 'al-output')), 'C 与 Kᴿ 是随 N 增长的持久缓存；Q 的 1536 维中间量和后续每头临时结果不属于 KV cache。'),
        step('为什么拆 RoPE：让内容投影能跨所有位置共用', '先想象未吸收的内容路径：每行 c_j 经该 head 的 A_K,i 得到 128 维内容 key，经 A_V,i 得到 128 维 value。若在这个展开的内容 key 后加入位置 j 的旋转，查询侧要吸收的变换也会跟着 j 变化，无法只算一次就与所有 C 行点积。MLA 因此保持内容支路不旋转，把位置影响放在独立的 64 维 Q/K 支路；这是模型设计的一部分。', columns(flow(box('内容支路：各 head 有自己的映射', 'c_j [512] × A_K,i [512,128]', '同一个 c_j，不同 head 可得到不同内容 key'), arrow('没有位置相关的旋转插入'), box('内容 key k_i,jᶜ', '[128]', '可以把 A_K,i 移到本步 Q 一侧', 'al-active')), flow(box('位置支路：已解耦', 'q_iᴿ [64] 与 k_jᴿ [64]', 'Q 按 t 旋转，K 按 j 旋转'), arrow('独立计算位置点积'), box('位置贡献', '每个 head、每个历史位置一个分数', '共享位置 K 不等于共享整个内容 K/V', 'al-state'))), '内容：q_iᶜ · (c_j A_K,i)；位置：RoPE(q_i,rawᴿ,t) · RoPE(k_j,rawᴿ,j)。两路最后加在同一个 logit 上。'),
        step('K 吸收：把 128 维 Q 变换成能直接查询 C 的 512 维 Q', '对一个固定 head，原来的做法是先把 N 行 C 都展开为内容 K，再与当前 q_iᶜ 点积。交换乘法的结合次序后，只需把这个 head 当前的 128 维 Q 乘 A_K,i 的转置，得到 512 维查询，再直接扫描 C。每个 head 仍有自己的查询；512 是直接与缓存点积时的通道宽度，未改变模型的 Q/K 缩放语义。', columns(flow(box('理解用：展开历史 K', 'C [4096,512] × A_K,i [512,128]'), arrow('先生成 4096 行内容 key'), box('K_iᶜ [4096,128]', '再与 q_iᶜ [1,128] 点积', '推理时希望省掉整段历史的恢复与物化', 'al-discard')), flow(box('吸收后：只变换当前 Q', 'q_iᶜ [1,128] × A_K,iᵀ [128,512]'), arrow('每个 head 做一次'), box('q̃_i [1,512]', '全部 head 合为 Q̃ [128,512]', '', 'al-active'), arrow('直接乘 Cᵀ [512,4096]'), box('内容分数 Sᶜ', '[128,4096]', '每个 head 对每个位置一个内容分数', 'al-output'))), 'q_iᶜ (C A_K,i)ᵀ = (q_iᶜ A_K,iᵀ) Cᵀ。这里相同的是同一个 MLA 模型的两种求值方式（忽略浮点舍入差异）。'),
        step('两路打分合在一起，只做一次 softmax', '内容分数来自 512 维 latent 点积，位置分数来自 64 维 RoPE 点积。先按 head 与历史位置逐项相加，再使用该模型的 scale 与 mask，最后沿 N 做同一个 softmax。不能各自 softmax 后相加，也不能因为吸收后出现 512+64 就把 scale 改成 1/√576。本例单 token decode 的 4096 个已可见位置都参与；padding 等无效位置仍需屏蔽。', flow(columns(box('内容路径', 'Q̃ [128,512] × Cᵀ [512,4096]<br>→ Sᶜ [128,4096]', '', 'al-active'), box('位置路径', 'Qᴿ [128,64] × (Kᴿ)ᵀ [64,4096]<br>→ Sᴿ [128,4096]', '', 'al-state')), arrow('逐项相加 → 模型 scale → mask → 沿 N 做一次 softmax'), box('唯一一张逻辑概率表 P', '[128,4096]', '每个 head 的 4096 个位置权重合计为 1', 'al-output')), 'P = softmax_N((Sᶜ+Sᴿ) × scale + mask)。基础 scale 来自原始每头 Q/K 宽度 128+64；实际必须保留 checkpoint 的 YaRN 等修正。'),
        step('先在 latent 空间取值：P 直接加权缓存 C', '普通路径会把每个位置的 latent 展开成该 head 的 V，再做加权和。由于 V 上投影是线性的，可以先用同一组 attention 权重对 C 的 512 个通道加权，得到该 head 的 512 维临时结果。所有 head 读同一张 C，但 P 的每一行通常不同，因此得到的 128 个临时结果也通常不同。', flow(columns(box('这个 head 的位置权重', 'P_i [1,4096]', '包含内容与位置两路共同决定的相关性', 'al-active'), box('共享内容历史', 'C [4096,512]', '无须在 HBM 存储另一张完整 V cache', 'al-state')), arrow('P_i × C：对 4096 个位置求加权和'), box('每个 head 的 latent 输出', 'z_i [1,512]<br>全部 head：Z [128,512]', '这是本步临时量；不会追加成新的历史 cache', 'al-output')), 'z_i = Σ_j P_ij c_j。完整 MLA 仍要读所有可见 C 行；这一步没有 Top-K、丢 token 或固定状态递推。'),
        step('V 上投影：512 维临时结果恢复成每头 128 维输出', '每个 head 用自己的 A_V,i，把刚才的 z_i 从 512 维映射到 128 维。加权平均与同一个线性映射可以交换次序，因此这条路径与“先展开这个 head 的所有 V，再加权”在实数运算中相同。省掉的是 N 行 V 的展开，代价包括 512 维的加权计算与这次 head 输出投影。', columns(flow(box('理解用：先为每个历史位置展开 V', 'V_i = C [4096,512] × A_V,i [512,128]', '得到 [4096,128] 再被 P_i 加权', 'al-discard'), arrow('P_i [1,4096] × V_i'), box('每头输出 o_i', '[1,128]', '', 'al-output')), flow(box('吸收路径：先加权 C', 'z_i = P_i C → [1,512]', '前一步已经算好', 'al-active'), arrow('z_i × A_V,i [512,128]'), box('同一个每头输出 o_i', '[1,128]', '全部 128 个 head：O_heads [128,128]', 'al-output'))), '(P_i C) A_V,i = P_i (C A_V,i)。A_K,i 与 A_V,i 是不同的权重；相同的是它们共同使用 C。'),
        step('拼接各头并输出：回到下一段网络需要的 5120 维', '将 128 个 head 各自的 128 维输出拼接为 16384 维，再乘输出矩阵得到当前 token 的 5120 维 attention 输出。这个输出接回模型的残差与后续 FFN/MoE 数据流。实现可进一步融合部分投影；无论怎样融合，缓存中长期留下的仍是 C 和 Kᴿ，而不是本步的 Q、P 或 Z。', columns(flow(box('各 head 的 value 输出', 'O_heads [128,128]', '每个 head 已从 latent 512 维恢复为 value 128 维'), arrow('concat heads：128 × 128 = 16384'), box('当前 token 的拼接结果', '[1,16384]', '这是多头拼接后的宽度', 'al-active'), arrow('输出投影 W_O [16384,5120]'), box('本层 attention 输出', '[1,5120]', '接回残差与后续网络', 'al-output')), flow(box('第 4 步追加后保留下来的历史', 'C [4096,512] + Kᴿ [4096,64]', '它们早已保存，不是由左侧输出投影生成', 'al-state'), arrow('等到下一 decode 步，复用旧行并追加下一行'), box('下一步可见的缓存', 'C [4097,512] + Kᴿ [4097,64]', '上下文继续增长；本步其他临时量可释放', 'al-state'))), 'MLA 的主线：每位置存 512+64 → 每头分别查询 → 两路分数共同归一化 → latent 加权 → 每头 128 → 拼接 / O 投影。')
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
