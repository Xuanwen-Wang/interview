'use strict';

// Dedicated diagrams consume recorded observations or explicit byte geometry.
// Step selection never interpolates missing hardware signals.
var CycleSpecialDiagrams = (() => {
  const P = Object.freeze({ink: '#243d36', muted: '#5c7168', border: '#becdc2',
    paper: '#f8faf5', white: '#fffef9', pale: '#e8eee6', green: '#34775f',
    greenPale: '#dcecdf', blue: '#316a8b', bluePale: '#dce9f1',
    orange: '#a95831', orangePale: '#f4e4d7', gray: '#e0e5de'});
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const text = (x, y, value, size = 16, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(value)}</text>`;
  const rect = (x, y, w, h, fill = P.white, stroke = P.border, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${stroke}" ${extra}/>`;
  const line = (x1, y1, x2, y2, color = P.border, extra = '') => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" fill="none" ${extra}/>`;
  const active = yes => yes ? P.greenPale : P.white;
  const phaseOf = (frame, step, max) => Math.max(0, Math.min(max, Number.isInteger(frame?.diagramPhase) ? frame.diagramPhase : Number.isInteger(frame?.node) ? frame.node : step));
  function wrap(value, max = 92) {
    const lines = ['']; let units = 0;
    for (const char of String(value ?? '')) {
      const cost = char.codePointAt(0) > 127 ? 2 : 1;
      if (units + cost > max) { lines.push(''); units = 0; }
      lines[lines.length - 1] += char; units += cost;
    }
    return lines;
  }
  function svg(c, kind, height, body, description) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 ${height}" role="img" aria-label="${escape((c.title || 'CycleSim 案例') + '：' + description)}" data-cycle-special="${kind}"><title>${escape(c.title || 'CycleSim 案例')}</title><desc>${escape(description)}</desc><rect width="880" height="${height}" rx="10" fill="${P.paper}"/><g font-family="sans-serif" fill="${P.ink}">${body}</g></svg>`;
  }
  function stages(labels, phase, y) {
    return labels.map((label, i) => rect(24 + i * 210, y, 202, 54, active(i === phase), i === phase ? P.green : P.border) + text(125 + i * 210, y + 33, `${i + 1}  ${label}`, 16, 'text-anchor="middle"')).join('');
  }
  function int4(c, step, frame) {
    const frames = c.int4.frames;
    if (!Array.isArray(frames) || !frames.length) return null;
    const exact = frames.find(f => f.cycle === frame?.cycle);
    const f = exact || frames[Math.max(0, Math.min(step, frames.length - 1))];
    const pins = f.pins || {}, count = f.cumulative_including_this_edge || {};
    const value = name => pins[name] === 0 || pins[name] === 1 ? pins[name] : '?';
    const pair = (v, r) => value(v) === 1 && value(r) === 1;
    const waiting = value('activation_valid') === 1 && value('activation_ready') === 0;
    const blocked = value('output_valid') === 1 && value('output_handshake') === 0;
    const shape = wrap(c.shape || 'FP8 activation × INT4 weight → FP32 output；shape 见案例配置', 94);
    let body = text(24, 32, `冻结 RTL 锚点 · cycle ${f.cycle}`, 21) + text(856, 32, '400 MHz · pre-edge', 15, 'text-anchor="end"');
    shape.forEach((s, i) => { body += text(24, 59 + i * 21, s, 15); });
    const top = 81 + shape.length * 21;
    body += text(24, top - 8, '下列是本拍信号值；左右连线只表示数据通路，不表示额外时延。', 15, `fill="${P.muted}"`);
    const panels = [24, 310, 596];
    panels.forEach((x, i) => { body += rect(x, top + 9, 260, 293, P.white, (i === 1 && waiting) || (i === 2 && blocked) ? P.orange : P.border); });
    body += text(40, top + 40, '供数与装载', 19) + text(326, top + 40, 'Activation / ALU', 19) + text(612, top + 40, '输出与串行化', 19);
    [284, 570].forEach(x => { body += line(x + 3, top + 41, x + 22, top + 41, P.muted, 'stroke-width="2"') + `<path d="M${x + 17} ${top + 36} l5 5 l-5 5" stroke="${P.muted}" fill="none"/>`; });
    const pin = (x, y, name) => text(x, y, name, 14) + rect(x + 198, y - 17, 28, 24, value(name) === 1 ? P.greenPale : P.pale, P.border) + text(x + 212, y, value(name), 16, 'text-anchor="middle"');
    ['weight_valid', 'weight_ready', 'scale_valid', 'scale_ready', 'activation_word', 'activation_flag'].forEach((n, i) => { body += pin(40, top + 75 + i * 30, n); });
    body += text(40, top + 272, 'weight / scale：valid ∧ ready', 13, `fill="${P.muted}"`);
    ['activation_valid', 'activation_ready'].forEach((n, i) => { body += pin(326, top + 75 + i * 30, n); });
    const macStatus = pair('activation_valid', 'activation_ready') ? '本拍发生 MAC 握手' : waiting ? 'activation 本拍等待' : '本拍没有 MAC 握手';
    body += rect(326, top + 130, 228, 62, waiting ? P.orangePale : pair('activation_valid', 'activation_ready') ? P.greenPale : P.pale, waiting ? P.orange : P.border);
    body += text(440, top + 167, macStatus, 16, 'text-anchor="middle"');
    if (waiting && value('weight_valid') === 0) {
      body += text(326, top + 224, '同时 weight_valid = 0', 14) + text(326, top + 246, '这里只确认两者同时出现；', 14) + text(326, top + 268, '隐藏队列的原因仍未知。', 14);
    } else {
      body += text(326, top + 224, '计数只在握手边沿增加；', 14) + text(326, top + 246, '没有握手不等于整个 PE', 14) + text(326, top + 268, '或其他硬件单元都空闲。', 14);
    }
    ['output_valid', 'output_handshake', 'transfer_valid'].forEach((n, i) => { body += pin(612, top + 75 + i * 30, n); });
    const outStatus = blocked ? '有效输出本拍未被接收' : value('output_handshake') === 1 ? '本拍接收一个输出 token' : '本拍没有输出握手';
    body += rect(612, top + 159, 228, 54, blocked ? P.orangePale : value('output_handshake') === 1 ? P.greenPale : P.pale, blocked ? P.orange : P.border) + text(726, top + 192, outStatus, 15, 'text-anchor="middle"');
    body += text(612, top + 240, 'output_handshake = valid ∧ ready', 12) + text(612, top + 263, '它不是原始 ready 信号。', 14) + text(612, top + 284, 'transfer：组内输出子字', 14);
    const cy = top + 339;
    body += text(24, cy - 10, '截至本边沿的累计事件（包含本拍）', 18);
    const counters = [
      ['权重握手', 'weight_handshakes'], ['UScale 握手', 'scale_handshakes'], ['MAC 握手', 'mac_handshakes'], ['输出握手', 'output_handshakes'],
      ['Activation words', 'activation_words'], ['Activation flags', 'activation_flags'], ['串行输出子字', 'serialized_dt_subwords'], ['Credit 寄存器', null]
    ];
    counters.forEach(([label, key], i) => {
      const x = 24 + (i % 4) * 210, y = cy + Math.floor(i / 4) * 82;
      body += rect(x, y, 202, 72, key ? P.white : P.pale) + text(x + 12, y + 24, label, 14) + text(x + 12, y + 56, key ? (count[key] ?? '?') : '未知 / 未采样', key ? 24 : 18);
    });
    body += text(24, cy + 182, '图例：绿信号格＝实测值 1；灰信号格＝实测值 0；橙色状态框＝已观察到的等待。', 15);
    body += text(24, cy + 206, '锚点之间没有补画波形；这 11 列不含 credit，不能由本图恢复隐藏队列占用。', 15);
    body += text(24, cy + 230, 'transfer 属于 PE 输出串行化路径，不能等同独立 DT 单元；trace done 也不在这 11 列中。', 14, `fill="${P.muted}"`);
    return svg(c, 'int4', cy + 251, body, `真实信号锚点 cycle ${f.cycle}，11 个 pin 和累计事件；不插值，credit 未采样。`);
  }
  function dtGeometry(c, step, frame) {
    const {H, W, C, blockW, blockC} = c.dtGeometry;
    // This picture depicts the recorded partial-C case, not arbitrary layouts.
    if (H !== 16 || W !== 8 || C !== 20 || blockW !== 8 || blockC !== 16) return null;
    const phase = phaseOf(frame, step, 3);
    let body = text(24, 32, 'DT 尾块：按每一块较慢的一侧计工作量', 21) + text(24, 60, 'BF16 · 输入 N×H×W×C = 1×16×8×20 · order 4 · 每拍 32 B = 16 元素', 15);
    body += stages(['看切块', '完整 C 块', '尾部 C 块', '16 个 H 平面'], phase, 80);
    body += text(24, 167, '一个 H 平面：W×C = 8×20', 18);
    const gx = 76, gy = 214, cell = 20;
    body += text(gx + 200, 190, 'C：0 … 15 为完整块；16 … 19 为尾块', 14, 'text-anchor="middle"');
    [0, 16, 20].forEach(v => { body += text(gx + v * cell, 208, v, 13, 'text-anchor="middle"'); });
    body += text(24, gy + 72, 'W', 15) + text(57, gy + 12, '0', 13, 'text-anchor="end"') + text(57, gy + 160, '8', 13, 'text-anchor="end"');
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 20; col++) {
        const tail = col >= 16, lit = phase === 0 || phase === 3 || (phase === 1 && !tail) || (phase === 2 && tail);
        body += `<rect x="${gx + col * cell}" y="${gy + row * cell}" width="${cell}" height="${cell}" fill="${lit ? tail ? P.orangePale : P.bluePale : P.pale}" stroke="${tail ? P.orange : P.blue}" stroke-opacity=".35"/>`;
      }
    }
    body += text(gx + 160, gy + 83, '8 × 16', 24, 'text-anchor="middle"') + text(gx + 360, gy + 83, '8 × 4', 19, 'text-anchor="middle"');
    body += text(24, 405, '每格 = 一个 BF16 元素；矩形按元素数等比例。', 14);
    body += text(24, 428, 'fill / drain 是工作拍数，不是本图中的绝对时刻。', 14, `fill="${P.muted}"`);
    const costBox = (y, title, fill, drain, selected) => {
      let b = rect(522, y, 334, 126, active(selected), selected ? P.green : P.border) + text(538, y + 27, title, 17);
      [['fill', fill, P.blue], ['drain', drain, P.orange]].forEach(([label, count, color], i) => {
        const yy = y + 44 + i * 28;
        b += text(538, yy + 15, label, 14) + `<rect x="590" y="${yy}" width="${count * 12}" height="18" rx="3" fill="${color}"/>` + text(802, yy + 15, `${count} 拍`, 14);
      });
      return b + text(538, y + 113, `本块计 max(${fill}, ${drain}) = ${Math.max(fill, drain)} 拍`, 15);
    };
    body += costBox(157, '完整块 8×16：drain 较慢', 8, 16, phase === 1) + costBox(299, '尾块 8×4：fill 较慢', 8, 4, phase === 2);
    body += text(24, 468, '每个 H：max(8,16) + max(8,4) = 16 + 8 = 24 拍', 19);
    for (let h = 0; h < 16; h++) {
      const x = 24 + h * 52;
      body += rect(x, 487, 46, 52, phase === 3 ? P.greenPale : P.pale) + text(x + 23, 507, `H${h}`, 12, 'text-anchor="middle"') + text(x + 23, 528, '24', 17, 'text-anchor="middle"');
    }
    body += text(24, 573, '流式工作 XFER = 16 × 24 = 384 拍', 22);
    body += text(24, 604, '总账：384 + 32 次换向 + 4（Bl）+ 9 读延迟 + 2 写延迟 + 2 = 433 拍', 17);
    body += text(24, 632, 'Bl = min(首个 fill=8, 最后 drain=4) = 4：由尾部 C 块决定的一次性边界项。', 15);
    body += text(24, 657, '433 为 inst_start→inst_done；命令末字→done 另加 3 拍，得到 436。', 15);
    body += text(24, 684, '这里呈现解析式的工作量分解，没有保存块级波形；各块高亮不代表真实执行时刻。', 14, `fill="${P.muted}"`);
    body += text(24, 707, '冻结描述符的目标 surface 仍是 [1,16,8,20]；这条计时记录不验证紧凑 NCHW 数值布局。', 14, `fill="${P.muted}"`);
    return svg(c, 'dt-geometry', 730, body, '8×16 和 8×4 的 fill/drain 计数，每个 H 为 24 拍，16 个 H 为 384 拍；解析式而非块级波形。');
  }
  function partial(c, step, frame) {
    if (typeof CycleCaseModel === 'undefined') return null;
    const g = c.geometry, result = CycleCaseModel.geometry(g), beat = g.beatBytes || 128;
    const phase = phaseOf(frame, step, 3), shown = result.rows.slice(0, 4);
    const phaseText = ['绿色标出本次覆盖的字节；灰色表示本次没有覆盖。', '只对 partial beat 读取完整旧行；完整覆盖的 beat 不需要读旧值。', '在 byte-enable 为 1 的位置换入新字节，其余位置保留旧字节。', '合并后写回完整行；蓝色字节被保留，绿色字节是新写入的数据。'][phase];
    let body = text(24, 32, 'Partial ST：沿字节覆盖关系走完读改写', 21) + text(24, 60, `${g.rows} 行 × ${g.rowBytes} B 有效数据；行距 ${g.stride} B；起点偏移 ${g.address % beat} B`, 16);
    body += stages(['被覆盖字节', '读取旧行', '按掩码合并', '完整写回'], phase, 80);
    body += text(24, 164, phaseText, 16);
    body += text(24, 192, `横轴：每框 ${beat} B，框内左端 0 → 右端 ${beat}；纵轴：原 descriptor 的行。`, 14, `fill="${P.muted}"`);
    shown.forEach((row, i) => {
      const y = 221 + i * 79;
      body += text(24, y + 19, `第 ${i} 行`, 16) + text(24, y + 43, `起点 mod ${beat} = ${row.start % beat}`, 13);
      row.words.slice(0, 3).forEach((word, j) => {
        const x = 244 + j * 204, width = 190, scale = width / beat, partialBeat = word.hi - word.lo < beat;
        const oldColor = phase >= 1 && partialBeat ? P.bluePale : P.gray;
        body += `<rect x="${x}" y="${y}" width="${width}" height="30" fill="${oldColor}" stroke="${phase === 3 ? P.orange : P.border}" stroke-width="${phase === 3 ? 2 : 1}"/>`;
        body += `<rect x="${x + word.lo * scale}" y="${y}" width="${(word.hi - word.lo) * scale}" height="30" fill="${phase === 1 && partialBeat ? 'none' : P.green}" stroke="${P.green}" ${phase === 1 && partialBeat ? 'stroke-width="2" stroke-dasharray="4 3"' : ''}/>`;
        if (phase === 3) body += line(x, y + 35, x + width, y + 35, P.orange, 'stroke-width="2"');
        body += text(x + width / 2, y + 55, `${word.hi - word.lo} B 新 / ${beat - word.hi + word.lo} B 保留`, 13, 'text-anchor="middle"');
      });
      if (row.words.length > 3) body += text(858, y + 22, '…', 17, 'text-anchor="end"');
    });
    const end = 226 + shown.length * 79;
    body += text(24, end, `只显示前 ${shown.length} 行、每行最多 3 个 beat；下方统计覆盖全部 ${g.rows} 行。`, 14, `fill="${P.muted}"`);
    const items = [['有效新字节', `${result.useful} B`], ['读旧行工作量', `${result.partial} × ${beat} B`], ['完整写工作量', `${result.beats} × ${beat} B`]];
    items.forEach(([label, val], i) => {
      const x = 24 + i * 280;
      body += rect(x, end + 18, 272, 77, (phase === 1 && i === 1) || (phase === 3 && i === 2) ? P.greenPale : P.white) + text(x + 14, end + 44, label, 15) + text(x + 14, end + 78, val, 22);
    });
    body += text(24, end + 124, '图例：绿＝新字节；蓝＝旧行数据；绿虚框＝待替换范围；橙边＝整行写回。', 15);
    body += text(24, end + 149, '这是静态地址几何与因果步进，没有时间轴，也不把这四步解释为四拍。', 15);
    body += text(24, end + 174, '完整业务到达时刻与服务周期未知；字节工作量不能替代 RTL latency 或 DRAM 实测流量。', 14, `fill="${P.muted}"`);
    return svg(c, 'partial', end + 198, body, `读改写因果步骤 ${phase + 1}；${result.partial} 个 partial beat 读旧，${result.beats} 个完整 beat 写回；不计拍。`);
  }
  function concurrency(c, step, frame) {
    const {n, dt0, wideRate} = c.concurrency;
    if (![1, 2, 4].includes(n) || !Number.isFinite(dt0) || !Number.isFinite(wideRate) || wideRate < 0 || wideRate > 1) return null;
    const phase = phaseOf(frame, step, 3), approx = Math.round(wideRate * 1000);
    let body = text(24, 32, `${n} 个 DT 实例共享 L2：看请求几何和观测汇总`, 21) + text(24, 60, 'BF16 · tile 1×8×16×32 · source C=256 · order 0 · 同时发命令的独立台架', 15);
    body += stages(['源 pitch', '共享 macro', 'DT0 时长', '宽口统计'], phase, 80);
    for (let i = 0; i < 4; i++) {
      const x = 24 + i * 210, enabled = i < n;
      body += rect(x, 157, 202, 97, enabled ? (phase === 1 ? P.orangePale : P.greenPale) : P.pale, enabled ? P.green : P.border);
      body += text(x + 14, 184, `DT${i} · ${enabled ? '参与本次记录' : '未启用'}`, 16);
      body += text(x + 14, 211, enabled ? '源起始 macro 相位 = 0' : '没有本实例的事件', 13);
      body += text(x + 14, 235, enabled ? '目标起始 macro 相位 = 16' : '不补画执行条', 13);
    }
    body += text(24, 288, '源 pitch = 256 × 2 B = 512 B；以 16 B 字交错，macro 相位每次加 32', 17);
    body += text(24, 315, '前 8 个源请求的起始相位：0 → 32 → 64 → 96 → 0 → 32 → 64 → 96', 16);
    body += text(24, 344, '128 macro 起始索引（16 B 是交错粒度）', 16);
    const gx = 24, gy = 365, cw = 30, ch = 24;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 16; col++) {
        const id = row * 16 + col, source = id % 32 === 0, target = id === 16;
        const fill = source ? phase <= 1 ? P.orangePale : P.greenPale : target ? P.bluePale : P.pale;
        body += `<rect x="${gx + col * cw}" y="${gy + row * ch}" width="${cw - 2}" height="${ch - 2}" rx="2" fill="${fill}" stroke="${source ? P.orange : target ? P.blue : P.border}"/>`;
        if (source || target || col === 15) body += text(gx + col * cw + 14, gy + row * ch + 15, id, 11, 'text-anchor="middle"');
      }
    }
    body += text(24, 584, '每行 16 格；色格只标起始相位，不表示 macro 容量。', 14);
    body += rect(532, 343, 324, 242, phase === 2 ? P.greenPale : P.white, phase === 2 ? P.green : P.border);
    body += text(550, 374, '冻结记录：只有 DT0 的时长', 18) + text(550, 425, dt0, 42) + text(680, 421, 'core cycle', 16);
    body += text(550, 457, 'inst_start → inst_done', 16) + text(550, 487, '其余 DT 的起止时间未保存在 TSV。', 14) + text(550, 512, '地址相位相同增加共享资源压力；', 14) + text(550, 537, '本图没有逐拍 grant 记录。', 14) + text(550, 562, '不能据此恢复全体 DT 的 makespan。', 14);
    body += text(24, 623, `宽口 accepted 比率：${wideRate.toFixed(5)} ≈ 每 1000 个窗口周期接收 ${approx} 次`, 18);
    body += text(24, 649, '宽口为 PE read master 上的合成流量；它不是完整 PE 计算。', 15);
    const meterX = 24, meterY = 669, meterW = 832;
    body += `<rect x="${meterX}" y="${meterY}" width="${meterW}" height="31" rx="4" fill="${P.gray}" stroke="${P.border}"/><rect x="${meterX}" y="${meterY}" width="${meterW * wideRate}" height="31" rx="4" fill="${phase === 3 ? P.green : P.blue}"/>`;
    [0, 250, 500, 750, 1000].forEach(v => { const x = meterX + v / 1000 * meterW; body += line(x, meterY + 33, x, meterY + 40, P.muted) + text(x, meterY + 58, v, 13, `text-anchor="${v === 0 ? 'start' : v === 1000 ? 'end' : 'middle'}"`); });
    body += text(24, 758, '这是归一化统计尺，左侧色块不表示这些接收集中在时间窗前半段。', 15);
    body += text(24, 783, '比率分母是“任一 DT 活跃”的台架统计窗口（寄存后有一拍边界偏移），不是 DT0 时长。', 14);
    body += text(24, 808, '图例：橙＝源请求相位；蓝格＝目标基址相位；宽条色块＝accepted 比例；不推造仲裁波形。', 14, `fill="${P.muted}"`);
    return svg(c, 'concurrency', 833, body, `${n} 个真实 DT 实例的共享 L2 地址几何，DT0 实测 ${dt0} 拍，宽口统计 accepted 比率 ${wideRate}；无逐拍 grant 波形。`);
  }
  return Object.freeze({int4, dtGeometry, partial, concurrency});
})();

function cycleSpecialDrawing(c, step, frame) {
  if (c.int4) return CycleSpecialDiagrams.int4(c, step, frame);
  if (c.dtGeometry) return CycleSpecialDiagrams.dtGeometry(c, step, frame);
  if (c.geometry) return CycleSpecialDiagrams.partial(c, step, frame);
  if (c.concurrency) return CycleSpecialDiagrams.concurrency(c, step, frame);
  return null;
}

// These diagrams are recomputed from descriptor geometry, never RTL duration.
function cycleLsuDrawing(c, step) {
  const m=CycleCaseModel.lsu(c.lsuModel), tx=(x,y,s,size=17,more='')=>`<text x="${x}" y="${y}" font-size="${size}" ${more}>${esc(s)}</text>`;
  let b='',height=450;
  const palette=['#326b8c','#43816c','#b36b3d','#8d709f','#b29842','#6f8f96','#7f836b','#976666'];
  if(step<2) {
    b+=tx(24,32,'从descriptor生成的全局地址段',21);
    b+=tx(24,61,`collapse mode ${m.mode} · ${m.runs.length} run · 有效 ${m.useful} B · 传输拍容量 ${m.transferBytes} B`,16);
    m.runs.slice(0,4).forEach((r,i)=>{
      const y=100+i*62;
      b+=tx(24,y,`run ${i}: a=${r.address}`,16)+tx(24,y+24,`${r.bytes} B / ${r.beats} beat`,14);
      const end=r.address+r.bytes,first=Math.floor(r.address/128)*128;
      for(let j=0;j<Math.min(3,r.beats);j++) {
        const a=first+j*128,lo=Math.max(0,r.address-a),hi=Math.min(128,end-a),xx=270+j*178;
        b+=`<rect x="${xx}" y="${y-15}" width="166" height="29" fill="#dfe5dd" stroke="#becbc1"/><rect x="${xx+lo/128*166}" y="${y-15}" width="${(hi-lo)/128*166}" height="29" fill="#3b7c64"/>`;
        b+=tx(xx+83,y+33,`${hi-lo}/128 B覆盖`,13,'text-anchor="middle"');
      }
      if(r.beats>3)b+=tx(821,y+4,'…',22);
    });
    b+=tx(24,381,`总计 B=${m.beats}，J=${m.bursts}；P=${m.partialBeats}，Q=${m.partialBursts}；R=${m.primingRuns}`,18);
    b+=tx(24,412,'只展开前4段、每段前3拍；绿色覆盖，灰色是padding或需保留旧字节。',15);
  } else if(step===2) {
    const terms=m.terms.filter(x=>x[1]);height=116+terms.length*53;
    b+=tx(24,32,`单条解析延迟 L = ${m.duration} core cycles`,21);
    b+=tx(24,59,'条长按贡献拍数同比例；这些项不是按实际发生顺序排列的录波。',15);
    const max=Math.max(...terms.map(x=>x[1]));
    terms.forEach(([name,n],i)=>{
      const y=82+i*53,w=n/max*520;
      b+=tx(24,y+19,name,17)+`<rect x="200" y="${y}" width="${Math.max(2,w)}" height="27" rx="4" fill="${palette[i%palette.length]}"/>`+tx(735,y+20,`${n} cycles`,16);
    });
  } else {
    height=490; const end=m.commands.at(-1).end,xx=t=>180+t/end*640;
    b+=tx(24,32,`六条全部就绪：L=${m.duration}，O=${m.occupancy}，D=${m.depth}`,21);
    b+=tx(24,60,`模型预约：深色至资源释放；淡色至done。槽hold=${m.hold}；非真实针脚。`,15);
    m.commands.forEach((cmd,i)=>{
      const y=89+i*53;
      b+=tx(24,y+21,`命令${i} / 槽${cmd.slot}`,16)+`<rect x="${xx(cmd.start)}" y="${y}" width="${xx(cmd.end)-xx(cmd.start)}" height="28" fill="#dce8df"/><rect x="${xx(cmd.start)}" y="${y+7}" width="${xx(cmd.release)-xx(cmd.start)}" height="14" fill="#34775f"/>`;
      b+=tx(xx(cmd.start),y-5,`${cmd.start} → ${cmd.end}`,13);
    });
    for(let i=0;i<=4;i++)b+=tx(xx(end*i/4),435,Math.round(end*i/4),14,'text-anchor="middle"');
    b+=tx(24,470,'横轴：从第一条模型start开始经过的core cycles；未计外部竞争或依赖。',15);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 ${height}" role="img" aria-label="${esc(c.title)}：模型计算第${step+1}步"><rect width="880" height="${height}" rx="10" fill="#f8faf5"/><g font-family="sans-serif" fill="#243d36">${b}</g></svg>`;
}
