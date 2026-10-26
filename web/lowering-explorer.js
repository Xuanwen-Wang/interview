'use strict';

// This walkthrough explains contracts; it does not emulate compiler output.
const LOWERING_STEPS = [
  {name:'Triton / TTIR', title:'先确定算什么，以及哪些元素有效', added:'张量运算、元素类型、mask、program instance 的语义。', carried:'教学计算 Y=max(X+2,0)，X/Y 为 BF16 [6,32]；每块处理 [4,32]。', decision:'第二块从行索引 4（从 0 计）开始，只有 2 行有效。mask 是语义，不能在换 IR 时丢掉。', sketch:'logical domain: [6,32]\nblock: [4,32], row start: 4\nvalid rows: [4,6)'},
  {name:'Linalg / MemRef', title:'把算术与存储对象分别表达', added:'结构化迭代、buffer、view、shape 与 stride 的关系。', carried:'同一计算与有效域继续存在；共享底层存储的 view 仍然可能别名。', decision:'形成可分析的存储对象，还没有替所有 buffer 选定硬件物理地址。', sketch:'X/Y: memref<6x32xbf16>\nview: rows [4,6), columns [0,32)\noperation: load → add → max → store'},
  {name:'ZeusHigh', title:'让计算适配执行单元和描述符', added:'硬件维度规整、执行单元选择、fmap/weight 描述、边界约束。', carried:'示例 fmap tensor shape 为 [1,1,6,32]；补维不改变原来的元素数量。', decision:'区分完整张量、请求的块和本次有效块。weight 有自己的布局与语义，不套用同一维度名称。', sketch:'tensor: [1,1,6,32]\nrequested tile: [1,1,4,32]\nvalid tile: [1,1,2,32]'},
  {name:'布局与分配', title:'在有限片上空间中选择合法布局', added:'buffer 的物理区间、生命周期与中端并行规划。', carried:'逻辑上不同的两个值，可能在不同时间使用同一段物理空间。', decision:'复用节省容量，也可能引入额外等待。地址分配的性能偏好不能替代后端正确性证明。', sketch:'buffer identity + byte interval\nlifetime + parallel planning\ncapacity ↔ reuse ↔ overlap'},
  {name:'ZeusLow / CFG', title:'显式表达配置、命令与控制流', added:'BReg 配置、执行命令、标量与跳转操作、基本块边及实际执行器归属。', carried:'物理区间和描述符来源必须随 lowering 保留，供后续依赖分析使用。', decision:'当前路径先把 SCF 展开为 CFG，再做同步注入。发出了命令不代表异步单元已经完成。', sketch:'descriptor setup\nbranch / block arguments\nasync unit command'},
  {name:'InjectSync', title:'为必须成立的执行顺序生成协议', added:'资源读写、完成事件、等待关系、mailbox 调度及验证。', carried:'保留合法的并行；配置快照与数据完成有不同的时点。', decision:'同步面对的是硬件资源和动态执行次数，不只是 SSA def-use。完整推导放在独立同步篇。', sketch:'effect → conflict → obligation\nplan → verify → emit\nRAW / WAR / WAW + FIFO capacity'},
  {name:'RegAlloc / 选择', title:'把虚拟资源落实到目标指令', added:'物理寄存器、phi 边复制与指令选择；随后 peephole 与最终取指合法化。', carried:'同步阶段建立的资源与时序合同必须被后续展开保留。', decision:'当前使用自有目标后端；直接生成机器码仍然需要指令选择、寄存器分配与合法化。', sketch:'virtual registers → physical registers\noperations → target instruction sequences\ncheck final instruction constraints'},
  {name:'zbin / 装载', title:'交付运行时真正能够装载的程序', added:'指令字、常量、运行时地址修补位置和容器中的程序信息。', carried:'最终二进制仍要与调用参数、运行时 ABI 和原始计算保持一致。', decision:'IR verifier、功能仿真、VCS 和硬件性能各验证不同层次；生成文件不是全部验收。', sketch:'instructions + constants\nruntime patch positions\ncontainer / runtime ABI\nload → execute → validate'}
];

function initLoweringExplorers() {
  document.querySelectorAll('[data-lowering-explorer]').forEach(root => {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    root.classList.add('lowering-explorer');
    root.innerHTML = `<div class="lowering-explorer-head"><strong>跟着同一个计算，逐层补齐信息</strong><p>教学表示，不是实际编译日志。选择任一阶段，观察它新增的信息与仍需作出的决定。</p></div><div class="lowering-steps" aria-label="选择下降阶段">${LOWERING_STEPS.map((s,i)=>`<button type="button" data-lowering-step="${i}" aria-pressed="${i===0}"><small>${String(i+1).padStart(2,'0')}</small>${s.name}</button>`).join('')}</div><div class="lowering-panels" aria-live="polite">${LOWERING_STEPS.map((s,i)=>`<section class="lowering-panel" data-lowering-panel="${i}" ${i?'hidden':''}><h4>${i+1}. ${s.title}</h4><dl><dt>新增信息</dt><dd>${s.added}</dd><dt>一直保留的语义</dt><dd>${s.carried}</dd><dt>架构上的决定</dt><dd>${s.decision}</dd></dl><pre><code>${s.sketch.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</code></pre></section>`).join('')}</div><div class="lowering-controls"><button type="button" data-lowering-prev disabled>← 上一层</button><span data-lowering-position>1 / ${LOWERING_STEPS.length}</span><button type="button" data-lowering-next>下一层 →</button></div>`;
    let selected = 0;
    const select = index => {
      selected = Math.max(0, Math.min(LOWERING_STEPS.length-1, index));
      root.querySelectorAll('[data-lowering-step]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===selected)));
      root.querySelectorAll('[data-lowering-panel]').forEach((panel,i)=>{panel.hidden=i!==selected;});
      root.querySelector('[data-lowering-prev]').disabled = selected===0;
      root.querySelector('[data-lowering-next]').disabled = selected===LOWERING_STEPS.length-1;
      root.querySelector('[data-lowering-position]').textContent = `${selected+1} / ${LOWERING_STEPS.length}`;
    };
    root.addEventListener('click', event => {
      const button=event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-lowering-step')) select(Number(button.dataset.loweringStep));
      else if (button.hasAttribute('data-lowering-prev')) select(selected-1);
      else if (button.hasAttribute('data-lowering-next')) select(selected+1);
    });
    root.querySelector('.lowering-steps').addEventListener('keydown',event=>{
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index=event.key==='Home'?0:event.key==='End'?LOWERING_STEPS.length-1:selected+(event.key==='ArrowRight'?1:-1);
      select(index);
      root.querySelector(`[data-lowering-step="${selected}"]`).focus();
    });
  });
}
