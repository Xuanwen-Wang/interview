'use strict';

// Teaching models: no GPU timing, cache simulation, or NCCL algorithm prediction.
const CudaGuideModel = (() => {
  function occupancy(threads, registers, sharedKiB) {
    if (![threads, registers, sharedKiB].every(Number.isFinite) ||
        threads < 32 || threads > 1024 || threads % 32 ||
        registers < 1 || registers > 255 || !Number.isInteger(registers) ||
        sharedKiB < 0 || sharedKiB > 227) throw new RangeError('Invalid CTA resources');
    const limits = {blocks: 32, threads: Math.floor(2048 / threads),
      registers: Math.floor(65536 / (threads * registers)),
      shared: sharedKiB ? Math.floor(228 / sharedKiB) : 32};
    const blocks = Math.min(...Object.values(limits));
    const warps = blocks * threads / 32;
    return {limits, blocks, warps, percent: warps / 64 * 100};
  }

  function ring(input) {
    const p = input.length;
    if (p < 2 || input.some(row => row.length !== p || row.some(v => !Number.isFinite(v))))
      throw new RangeError('Ring model expects p ranks and p scalar chunks');
    let cells = input.map((row, r) => row.map(value => ({value, owners: [r]})));
    const copy = value => JSON.parse(JSON.stringify(value));
    const states = [{phase: '输入',round: 0,cells: copy(cells),transfers: []}];
    for (const phase of ['ReduceScatter', 'AllGather']) {
      for (let round = 0; round < p - 1; round++) {
        // Snapshot every sender before applying any receive in this round.
        const transfers = cells.map((row, from) => {
          const chunk = (from - round - (phase === 'ReduceScatter' ? 1 : 0) + p) % p;
          return {from,to: (from + 1) % p,chunk,...copy(row[chunk])};
        });
        const next = copy(cells);
        for (const t of transfers) {
          const old = cells[t.to][t.chunk];
          next[t.to][t.chunk] = phase === 'ReduceScatter'
            ? {value: old.value + t.value, owners: [...old.owners,...t.owners].sort((a,b) => a-b)}
            : {value: t.value, owners: [...t.owners]};
        }
        cells = next;
        states.push({phase,round: round + 1,cells: copy(cells),transfers});
      }
    }
    return states;
  }

  function communication(p, bytes, alphaUs, gbps) {
    if (!Number.isInteger(p) || p < 2 || ![bytes,alphaUs,gbps].every(Number.isFinite) ||
        bytes <= 0 || alphaUs < 0 || gbps <= 0) throw new RangeError('Invalid communication inputs');
    const factor = 2 * (p - 1) / p;
    const sent = factor * bytes;
    const latencyUs = 2 * (p - 1) * alphaUs;
    const transferUs = sent / (gbps * 1e9) * 1e6;
    const totalUs = latencyUs + transferUs;
    return {factor,sent,latencyUs,transferUs,totalUs,algbw: bytes / (totalUs * 1e3),busbw: sent / (totalUs * 1e3)};
  }

  function onlineAttention(scores, values, chunkSize) {
    if (scores.length !== values.length || !Number.isInteger(chunkSize) || chunkSize < 1)
      throw new RangeError('Invalid attention inputs');
    let m = -Infinity, l = 0, o = 0;
    for (let start = 0; start < scores.length; start += chunkSize) {
      const end = Math.min(scores.length, start + chunkSize);
      const nextM = Math.max(m, ...scores.slice(start,end));
      if (nextM === -Infinity) continue;
      const scale = m === -Infinity ? 0 : Math.exp(m - nextM);
      l *= scale; o *= scale;
      for (let i = start; i < end; i++) {
        const w = Math.exp(scores[i] - nextM);
        l += w; o += w * values[i];
      }
      m = nextM;
    }
    return {m,l,o,value: l ? o / l : 0};
  }
  return {occupancy,ring,communication,onlineAttention};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CudaGuideModel;

function initCudaLabs() {
  const options = (values, selected) => values.map(([v,label]) =>
    `<option value="${v}"${v === selected ? ' selected' : ''}>${label}</option>`).join('');
  const select = (name,label,values,selected) => `<label>${label}<select data-control="${name}">${options(values,selected)}</select></label>`;
  const stat = (value,label) => `<div class="cuda-stat"><strong>${value}</strong><span>${label}</span></div>`;
  const fixed = n => n.toLocaleString('en-US',{maximumFractionDigits:3});
  const size = bytes => bytes >= 1048576 ? fixed(bytes / 1048576) + ' MiB' : fixed(bytes / 1024) + ' KiB';

  document.querySelectorAll('[data-cuda-lab]').forEach(root => {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true'; root.classList.add('cuda-lab');
    const kind = root.dataset.cudaLab;
    if (kind === 'occupancy') {
      root.innerHTML = `<div class="cuda-lab-heading"><span>RESOURCE LAB / 01</span><h4>一个 SM 可以住下多少 CTA？</h4><p>调整资源需求，观察哪项预算先耗尽。采用 Hopper 理论上限，忽略分配粒度、动态寄存器与 cluster。</p></div><div class="cuda-controls">${select('threads','每 CTA 线程数',[128,256,512].map(x=>[x,String(x)]),256)}${select('registers','每线程寄存器（32-bit）',[32,64,96,128].map(x=>[x,String(x)]),64)}${select('shared','每 CTA Shared',[32,64,96,128,192].map(x=>[x,x+' KiB']),64)}</div><div class="cuda-lab-output" aria-live="polite"></div>`;
      const render = () => {
        const read = name => Number(root.querySelector(`[data-control="${name}"]`).value);
        const t=read('threads'),r=read('registers'),s=read('shared'),result=CudaGuideModel.occupancy(t,r,s);
        const limits=result.limits;
        root.querySelector('.cuda-lab-output').innerHTML = `<p class="cuda-current">当前假设：${t} threads/CTA · ${r} registers/thread · ${s} KiB Shared/CTA</p><div class="cuda-stats">${stat(result.blocks,'CTA / SM 上界')}${stat(result.warps+' / 64','驻留 warp 上界')}${stat(fixed(result.percent)+'%','理论 occupancy')}</div><div class="cuda-warp-grid" role="img" aria-label="64 个 warp 槽位，${result.warps} 个在此上界下可驻留">${Array.from({length:64},(_,i)=>`<span class="${i<result.warps?'filled':''}">${i+1}</span>`).join('')}</div><p>每格 = 1 个 warp 槽位；实心格表示模型允许驻留，空心格表示剩余。</p><div class="cuda-equation">min(CTA ${limits.blocks}, threads ${limits.threads}, registers ${limits.registers}, Shared ${limits.shared}) = ${result.blocks}</div><p><strong>改变条件：</strong>保持 256 线程、64 registers，把 Shared 从 64 改为 96 KiB，上界从 3 CTA 降到 2。该结论只关乎驻留，无法单独判断哪个 kernel 更快。</p>`;
      };
      root.addEventListener('change',render); render();
    } else if (kind === 'ring') {
      const states=CudaGuideModel.ring(Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>10*r+c+1)));
      let step=0;
      root.innerHTML=`<div class="cuda-lab-heading"><span>COLLECTIVE LAB / 02</span><h4>四卡 Ring：每一步到底传哪一块？</h4><p>固定方向 r0 → r1 → r2 → r3 → r0。每 chunk 一个整数，完整贡献来自全部 4 ranks。</p><p>窄屏可左右滚动下方表格，查看全部 4 个 chunk。</p></div><div class="cuda-controls cuda-step-controls"><button type="button" data-action="prev">← 上一步</button><button type="button" data-action="next">下一步 →</button><button type="button" data-action="reset">重置</button><label>选择步骤<input aria-label="Ring 步骤" type="range" min="0" max="6" step="1" value="0"></label></div><div class="cuda-lab-output" aria-live="polite"></div>`;
      const matrix = cells => `<div class="cuda-matrix-wrap"><table class="cuda-matrix"><caption>行 = 当前持有数据的 rank；列 = 原逻辑 chunk；每格下行是已包含的贡献者。</caption><thead><tr><th>rank / chunk</th>${[0,1,2,3].map(c=>`<th>chunk ${c}</th>`).join('')}</tr></thead><tbody>${cells.map((row,r)=>`<tr><th>rank ${r}</th>${row.map(cell=>`<td class="${cell.owners.length===4?'complete':''}"><strong>${cell.value}</strong><small>{${cell.owners.map(x=>'r'+x).join(',')}}${cell.owners.length===4?' ✓':''}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      const render=()=>{
        const state=states[step];
        root.querySelector('[data-action="prev"]').disabled=step===0;
        root.querySelector('[data-action="next"]').disabled=step===6;
        root.querySelector('input').value=step;
        let explanation = step===0 ? '每个 rank 都有 4 个本地贡献；绿色完整块尚未出现。' : step<=3 ? '接收与本地同坐标值求和；只累加尚未包含的贡献。第 3 步之后，rank r 的 chunk r 完整。' : '只复制完整块，不再求和；第 6 步后所有 rank 都拥有全部完整结果。';
        root.querySelector('.cuda-lab-output').innerHTML=`<p class="cuda-step-label">步骤 ${step} / 6 · ${state.phase}${state.round?' · 第 '+state.round+' 轮':''}</p><p>${explanation}</p>${matrix(state.cells)}<p>带 ✓ 的绿色格 = 已归约全部 4 个贡献；其他格只是中间状态，不能当作最终值。</p>${step?`<div class="cuda-transfers">${state.transfers.map(t=>`<div><b>r${t.from} → r${t.to}</b><span>chunk ${t.chunk} · 发送 ${t.value}</span><small>来源 {${t.owners.map(x=>'r'+x).join(', ')}}</small></div>`).join('')}</div>`:'<p>点击“下一步”查看本轮四条同时发生的发送；每步都先读取旧状态，再统一接收。</p>'}<p class="cuda-current">最终 oracle：对输入按列求和，所有 rank 应为 [64, 68, 72, 76]。本演示不是 NCCL 实测时间线。</p><div class="cuda-print-only"><h4>打印补充：完整算法的末态</h4><p>步骤 1–3 归约并各留一块；步骤 4–6 交换完整块。每 rank 共发 6 个 scalar chunks。</p>${matrix(states[6].cells)}</div>`;
      };
      root.querySelector('input').addEventListener('input',e=>{step=Number(e.target.value);render();});
      root.addEventListener('click',e=>{
        const action=e.target.closest('button')?.dataset.action;
        if(!action)return;
        step=action==='reset'?0:Math.max(0,Math.min(6,step+(action==='next'?1:-1))); render();
      });render();
    } else if (kind === 'communication') {
      root.innerHTML=`<div class="cuda-lab-heading"><span>BYTE & LATENCY LAB / 03</span><h4>小消息等步骤，大消息看搬运</h4><p>标准双阶段 Ring 的教学模型；GB/s 是假设的有效单向 payload 带宽，不是产品标称总带宽。</p></div><div class="cuda-controls">${select('ranks','参与 rank 数',[2,4,8,16].map(x=>[x,String(x)]),4)}${select('size','每 rank 输入 S',[[64,'64 KiB'],[1024,'1 MiB'],[65536,'64 MiB']],64)}${select('alpha','每步 α',[[1,'1 μs'],[2,'2 μs'],[5,'5 μs'],[10,'10 μs']],2)}${select('bandwidth','有效单向带宽',[[25,'25 GB/s'],[50,'50 GB/s'],[100,'100 GB/s'],[200,'200 GB/s']],50)}</div><div class="cuda-lab-output" aria-live="polite"></div>`;
      const render=()=>{
        const read=name=>Number(root.querySelector(`[data-control="${name}"]`).value);
        const p=read('ranks'),bytes=read('size')*1024,a=read('alpha'),b=read('bandwidth');
        const result=CudaGuideModel.communication(p,bytes,a,b);
        const ratio=result.latencyUs/result.totalUs*100;
        root.querySelector('.cuda-lab-output').innerHTML=`<p class="cuda-current">当前假设：p=${p} · S=${size(bytes)} · α=${a} μs · B=${b} GB/s</p><div class="cuda-stats">${stat(size(result.sent),'每 rank 发送 payload')}${stat(fixed(result.totalUs)+' μs','模型总时间')}${stat(fixed(result.algbw)+' GB/s','模型 algbw')}</div><div class="cuda-budget-bar" role="img" aria-label="模型时间：步骤开销 ${fixed(result.latencyUs)} 微秒，传输 ${fixed(result.transferUs)} 微秒"><span style="width:${ratio}%" class="latency"></span><span style="width:${100-ratio}%" class="transfer"></span></div><div class="cuda-budget-legend"><span>■ 步骤开销 ${fixed(result.latencyUs)} μs</span><span>■ 传输 ${fixed(result.transferUs)} μs</span></div><div class="cuda-equation">T = 2 × (${p}−1) × ${a} μs + ${size(result.sent)} / ${b} GB/s<br>busbw = algbw × ${fixed(result.factor)} = ${fixed(result.busbw)} GB/s</div><p>条形宽度按本模型时间比例绘制；每 rank 接收量与发送相同，但这里没有把收发相加。忽略协议开销、分块流水、争用和 rank skew；实际 NCCL 也可能选择其他算法。</p>`;
      };
      root.addEventListener('change',render);render();
    }
  });
}
