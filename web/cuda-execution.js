'use strict';

// Explicit teaching assumptions; this is not a simulator of NVIDIA RTL.
const CudaExecutionModel = (() => {
  function pipeline(warps, chains, width, depth) {
    if (![warps, chains, width, depth].every(Number.isInteger) ||
        warps < 1 || warps > 8 || ![1, 2, 4].includes(chains) ||
        ![8, 32].includes(width) || depth < 1 || depth > 16)
      throw new RangeError('Invalid pipeline assumptions');
    const batches = 32 / width, latency = depth + batches - 1;
    const ready = Array.from({length: warps}, () => Array(chains).fill(0));
    const heads = Array(warps).fill(0), instructions = [], cycles = [];
    let cursor = 0, unitFree = 0, completion = 0;
    for (let cycle = 0; cycle < 5000; cycle++) {
      const done = heads.every(n => n === 16);
      if (done && cycle >= completion) {
        cycles.push({cycle, selected:null, candidates:[], reason:'complete',
          complete:instructions.filter(i=>i.ready===cycle), pending:[]});
        break;
      }
      const candidates = heads.flatMap((n, warp) =>
        n < 16 && ready[warp][n % chains] <= cycle ? [warp] : []);
      let selected = null;
      if (cycle >= unitFree) {
        for (let offset = 0; offset < warps; offset++) {
          const warp = (cursor + offset) % warps;
          if (!candidates.includes(warp)) continue;
          const index = heads[warp]++, chain = index % chains;
          selected = {warp, index, chain, issue: cycle, ready: cycle + latency};
          instructions.push(selected);
          ready[warp][chain] = selected.ready;
          completion = Math.max(completion, selected.ready);
          unitFree = cycle + batches;
          cursor = (warp + 1) % warps;
          break;
        }
      }
      const reason = selected ? 'issue' : cycle < unitFree ? 'batch' : done ? 'drain' : 'dependency';
      cycles.push({cycle, selected, candidates, reason,
        complete: instructions.filter(i => i.ready === cycle),
        pending: instructions.filter(i => i.issue <= cycle && i.ready > cycle)});
    }
    const last = instructions.at(-1);
    if (!last || instructions.length !== warps * 16) throw new Error('Model did not finish');
    const issueWindow = last.issue + batches;
    return {warps, chains, width, depth, batches, latency, instructions, cycles,
      completion, issueWindow, utilization: instructions.length * batches / issueWindow};
  }

  function fragment(lane, operand) {
    if (!Number.isInteger(lane) || lane < 0 || lane > 31 || !['A','B','D'].includes(operand))
      throw new RangeError('Invalid MMA fragment');
    const g = lane >> 2, t = lane % 4;
    const n = operand === 'A' ? 8 : 4;
    return Array.from({length: n}, (_, i) => {
      if (operand === 'A') return [g + (Math.floor(i / 2) % 2) * 8, 2*t + i%2 + Math.floor(i/4)*8];
      if (operand === 'B') return [2*t + i%2 + Math.floor(i/2)*8, g];
      return [g + Math.floor(i/2)*8, 2*t + i%2];
    });
  }
  return {pipeline, fragment};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CudaExecutionModel;

function initCudaExecutionLabs() {
  document.querySelectorAll('[data-cuda-execution]').forEach(root => {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true'; root.classList.add('cuda-lab', 'cuda-execution-lab');
    const select = (name, label, values, chosen) => `<label>${label}<select data-execution-control="${name}">${values.map(([v,text])=>`<option value="${v}"${v===chosen?' selected':''}>${text}</option>`).join('')}</select></label>`;
    const values = ns => ns.map(n=>[n,String(n)]);
    root.innerHTML = `<div class="cuda-lab-heading"><span>WARP PIPELINE / 教学模型</span><h4>谁在这一拍发射，谁仍在流水线里？</h4><p>每 warp 按程序顺序执行 16 条 FMA；在所选的独立累加器之间轮换。单个算术入口、轮转选 warp；无访存、分支与寄存器端口冲突。改变 warp 数会改变总工作量，应比较入口利用率。</p></div><div class="cuda-controls">${select('warps','同一调度器的 warp 数',values([1,2,4,8]),1)}${select('chains','每 warp 独立累加器',values([1,2,4]),1)}${select('width','算术通路宽度',[[32,'32 lanes / cycle'],[8,'8 lanes / cycle（窄后端模型）']],32)}${select('depth','每批执行深度（假设周期）',values([4,8,12]),4)}</div><div class="cuda-controls"><button type="button" data-execution-action="prev">← 前一拍</button><button type="button" data-execution-action="next">后一拍 →</button><button type="button" data-execution-action="reset">回到 cycle 0</button><label>当前 cycle<input type="range" data-execution-step min="0" value="0" aria-label="执行流水线周期"></label></div><div data-execution-output aria-live="polite"></div>`;
    let step = 0, model;
    const render = () => {
      const c = model.cycles[step];
      root.querySelector('[data-execution-step]').value = step;
      root.querySelector('[data-execution-step]').max = model.cycles.length - 1;
      root.querySelector('[data-execution-action="prev"]').disabled = !step;
      root.querySelector('[data-execution-action="next"]').disabled = step === model.cycles.length - 1;
      const label = i => `W${i.warp} · I${i.index} · 累加器 ${i.chain}`;
      const reason = {complete:'全部算术结果已经就绪',issue:'本拍接纳一条新的 warp 指令', batch:'算术入口正在接纳上条指令的后续 lane 批次', dependency:'所有未结束 warp 的下一条指令都在等待自己的累加器', drain:'全部指令已发射，等待最后的结果就绪'}[c.reason];
      const shown = model.cycles.slice(Math.max(0,step-3), Math.min(model.cycles.length,step+5));
      root.querySelector('[data-execution-output]').innerHTML = `<p class="cuda-current">当前假设：${model.warps} warps · 每 warp ${model.chains} 条独立链 · 宽度 ${model.width} · 每批深度 ${model.depth}。输入已就绪，结果可在 ready 边界被消费。</p><div class="cuda-stats"><div class="cuda-stat"><strong>${model.batches} cycles</strong><span>接纳间隔 II</span></div><div class="cuda-stat"><strong>${model.latency} cycles</strong><span>完整 warp 结果延迟 L</span></div><div class="cuda-stat"><strong>${(model.utilization*100).toFixed(1)}%</strong><span>发射窗口内入口占用比例</span></div></div><h4>cycle ${step}：${reason}</h4><p>本拍可选：${c.candidates.map(w=>'W'+w).join('、')||'无'}；选中：${c.selected?label(c.selected):'无'}。本拍就绪：${c.complete.map(label).join('；')||'无'}。</p><div class="cuda-execution-pending">${c.pending.map(i=>`<div><b>${label(i)}</b><span>issue ${i.issue} → ready ${i.ready}</span><small>距完整结果就绪 ${i.ready-step} 拍</small></div>`).join('')||'<p>当前没有在途算术指令。</p>'}</div><div class="cuda-matrix-wrap"><table><caption>局部周期表；“接纳”是开始处理一条 warp 指令，“完成”是全 warp 结果就绪。</caption><thead><tr><th>cycle</th><th>接纳新指令</th><th>结果就绪</th><th>在途条数</th></tr></thead><tbody>${shown.map(x=>`<tr${x.cycle===step?' class="cuda-cycle-current"':''}><td>${x.cycle}${x.cycle===step?' ← 当前':''}</td><td>${x.selected?label(x.selected):{complete:'全部完成',batch:'继续 lane 批次',dependency:'等依赖',drain:'排空流水线'}[x.reason]}</td><td>${x.complete.map(label).join('；')||'—'}</td><td>${x.pending.length}</td></tr>`).join('')}</tbody></table></div><p>全程 ${model.instructions.length} 条 warp 指令；最后一次接纳从 cycle ${model.instructions.at(-1).issue} 开始，全部结果在 cycle ${model.completion} 就绪。入口占用比例 = ${model.instructions.length} × ${model.batches} / ${model.issueWindow}；分母含发射空洞，不含最后排空阶段。这不是 kernel 的 SM 利用率或设备性能预测。</p><div class="cuda-print-only"><p>本组假设的末态：cycle ${model.completion}，所有 ${model.instructions.length} 条指令的结果就绪，在途数 0；打印保留当前参数与完整过程的汇总。</p></div><p>试验顺序：先把累加器从 1 改为 4；再恢复 1，增加到 4 warps；最后切到 8-wide 并追踪 W0 的四个 lane 批次。本文静态周期图和该模型使用同一组边界约定。</p>`;
    };
    const configure = () => {
      const read = name => Number(root.querySelector(`[data-execution-control="${name}"]`).value);
      model = CudaExecutionModel.pipeline(read('warps'),read('chains'),read('width'),read('depth'));
      step = 0; render();
    };
    root.addEventListener('change', e => {if(e.target.matches('select')) configure();});
    root.querySelector('[data-execution-step]').addEventListener('input', e => {step=Number(e.target.value);render();});
    root.addEventListener('click', e => {
      const action=e.target.closest('button')?.dataset.executionAction;
      if (!action) return;
      step=action==='reset'?0:Math.max(0,Math.min(model.cycles.length-1,step+(action==='next'?1:-1)));render();
    });
    configure();
  });
}
