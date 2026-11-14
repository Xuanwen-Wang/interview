'use strict';

// Fixed teaching profile: Weight[512,4096], FP8, normal KC, WBS=128,
// base=0, dual hub, splicing=1, bank-map=0xe4, low address bank.
const PEWeightLayout = (() => {
  function locate(co, ci) {
    if (!Number.isInteger(co) || co < 0 || co >= 512 || !Number.isInteger(ci) || ci < 0 || ci >= 4096) {
      throw new RangeError('Require CO in 0..511 and CI in 0..4095');
    }
    const q=Math.floor(co/128), t=Math.floor(ci/128), localCO=co%128, localCI=ci%128;
    const block=q*32+t, blockBase=block*16384, innerOffset=localCO*128+localCI;
    const group=Math.floor(localCO/16), alu=localCO%16, pe=Math.floor(localCI/16), lane=localCI%16;
    const round=Math.floor(alu/8), hub=Math.floor((alu%8)/4), mc=4*(alu%4)+Math.floor(pe/2);
    const mcByte=16*(pe%2)+lane, word=2*block+round;
    return {co,ci,q,t,localCO,localCI,block,blockBase,innerOffset,
      packedOffset:blockBase+innerOffset, rowMajorOffset:co*4096+ci,
      group,alu,pe,lane,round,hub,mc,mcByte,word,row:Math.floor(word/128),column:word%128};
  }
  function unpack(offset) {
    if (!Number.isInteger(offset) || offset < 0 || offset >= 2097152) throw new RangeError('Invalid packed offset');
    const block=Math.floor(offset/16384), within=offset%16384;
    return {co:Math.floor(block/32)*128+Math.floor(within/128), ci:(block%32)*128+within%128};
  }
  return Object.freeze({locate,unpack});
})();

let peWeightSelection={co:165,ci:1097};

function initPeWeightLayouts() {
  document.querySelectorAll('[data-pe-weight-layout]').forEach(root => {
    if (root.dataset.peWeightReady || !['packing','hardware'].includes(root.dataset.peWeightLayout)) return;
    root.dataset.peWeightReady='true';
    renderPeWeightLayout(root);
  });
}

function renderPeWeightLayout(root) {
  const hardware=root.dataset.peWeightLayout==='hardware';
  const hex=n=>'0x'+n.toString(16).toUpperCase();
  const range=(first,size)=>`${first}…${first+size-1}`;
  const count=n=>n.toLocaleString('en-US');
  root.classList.add('pe-weight-layout');
  root.innerHTML=`<header class="pe-weight-head"><p class="pe-weight-kicker">${hardware?'② 字节的硬件归属':'① 从矩阵坐标到聚合地址'}</p><h4>${hardware?'同一个权重字节，交给哪一路硬件？':'选一个 Weight，定位打包后的聚合地址'}</h4><p>Weight[CO,CI] = [512,4096]；每个 FP8 元素占 1 B。${hardware?'normal KC、WBS=128，':'每个基本块为128×128，'}基地址固定为 0。</p></header>
    <form class="pe-weight-controls"><label>输出通道 CO<input name="co" type="number" min="0" max="511" required aria-label="权重输出通道CO，0至511"></label><label>输入通道 CI<input name="ci" type="number" min="0" max="4095" required aria-label="权重输入通道CI，0至4095"></label><button type="submit">定位这个字节</button><span class="pe-weight-input-note">两处布局图同步选择</span></form>
    <div class="pe-weight-presets" aria-label="权重坐标样例"><span>试一试</span><button type="button" data-co="165" data-ci="1097">示例 [165,1097]</button><button type="button" data-co="165" data-ci="1151">当前块末 [165,1151]</button><button type="button" data-co="165" data-ci="1152">下一块首 [165,1152]</button></div>
    <p class="pe-weight-selection" aria-live="polite"></p><div class="pe-weight-body"></div>
    <p class="pe-weight-boundary">${hardware?'这里只定位字节的归属，不表示读取、返回或计算发生的先后时刻。MC word / row / column 限定 dual-hub、splicing=1、bank-map=0xe4 及本例低地址范围。lane 表示这个 ALU 的16项输入中第几项，不是 MAC 单元编号。':'这里展示聚合字节地址；单 MC 内的 word 地址与 formatter 后 PE 输入位置是另两层坐标。pack 保持元素值和逻辑坐标。128×128 是本例 FP8、WBS=128 的基本权重块；块号是存储位置，不是读取步号。'}</p>`;

  function blockGrid(v) {
    const x=138,y=52,cw=19,ch=31;
    let cells='',labels='';
    for(let q=0;q<4;q++) {
      labels+=`<text x="8" y="${y+q*ch+19}" class="pe-weight-svg-label">CO ${range(q*128,128)}</text>`;
      for(let t=0;t<32;t++) {
        const active=q===v.q&&t===v.t;
        cells+=`<rect x="${x+t*cw}" y="${y+q*ch}" width="${cw-2}" height="${ch-4}" rx="2" class="${active?'pe-weight-cell-active':'pe-weight-cell'}"/>`;
      }
    }
    for(const t of [0,8,16,24,31]) labels+=`<text x="${x+t*cw+8}" y="40" text-anchor="middle" class="pe-weight-svg-label">${t}</text>`;
    return `<svg viewBox="0 0 760 205" role="img" aria-label="Weight分成4行32列基本块，纵轴每128个CO，横轴每128个CI。选中CO块${v.q}、CI块${v.t}，块号${v.block}。"><text x="${x}" y="17" class="pe-weight-svg-title">CI 块编号 → 每格128个 CI</text>${labels}${cells}<text x="${x}" y="195" class="pe-weight-svg-label">每格 128 CO × 128 CI = 16 KiB；共4×32 = 128块</text></svg>`;
  }

  function byteStrip(v,mc=false) {
    const total=mc?32:16,selected=mc?v.mcByte:v.lane;
    return `<div class="pe-weight-byte-strip ${mc?'pe-weight-mc-bytes':''}">${Array.from({length:total},(_,i)=>`<span class="${i===selected?'is-active':''}"><small>${mc?'byte':'CI'}</small><b>${mc?i:v.pe*16+i}</b></span>`).join('')}</div>`;
  }

  function packing(v) {
    const rowBase=v.localCO*128;
    const nearRows=[v.localCO-1,v.localCO,v.localCO+1].filter(n=>n>=0&&n<128);
    let rowDiagram='';
    for(const localRow of nearRows) {
      rowDiagram+=`<div class="pe-weight-storage-row ${localRow===v.localCO?'is-selected':''}"><span>块内 CO ${localRow}</span><div>${Array.from({length:8},(_,j)=>`<span class="${localRow===v.localCO&&j===v.pe?'is-active':''}">${range(j*16,16)}</span>`).join('')}</div><small>${localRow===v.localCO?'← 选中行':'128 B'}</small></div>`;
    }
    return `<section class="pe-weight-stage"><h5><span>1</span>先找出它在哪个 128×128 块</h5><div class="pe-weight-block-grid">${blockGrid(v)}</div><div class="pe-weight-location"><span>CO ${v.co} = <b>${v.q}×128</b> + ${v.localCO}</span><span>CI ${v.ci} = <b>${v.t}×128</b> + ${v.localCI}</span><span>块号 = ${v.q}×32 + ${v.t} = <b>${v.block}</b></span></div><p>先放完 CO ${range(v.q*128,128)} 这一条带内的32块，再换下一条 CO 带。选中块覆盖 <strong>CO ${range(v.q*128,128)} × CI ${range(v.t*128,128)}</strong>。</p></section>
      <section class="pe-weight-stage"><h5><span>2</span>聚合地址视图：每行128 B，逐行排列</h5><p>下图按整核 packed 聚合地址展开选中行及其邻居。每段含16个 CI 字节，一行合计128 B；这些字节在 LDG 中分布于不同 MC。实际 MC 位置见下方硬件归属查询。</p><div class="pe-weight-row-axis">块内 CI 编号 →</div><div class="pe-weight-rows">${rowDiagram}</div><div class="pe-weight-byte-focus"><p>再放大选中行的 CI ${range(v.pe*16,16)}：每格1 B，选中块内 CI <strong>${v.localCI}</strong></p>${byteStrip(v)}</div><div class="pe-weight-equation">块内偏移 = <span>${v.localCO} 行 × 128 B</span> + <span>${v.localCI} B</span> = <strong>${hex(v.innerOffset)}</strong></div></section>
      <section class="pe-weight-stage pe-weight-address-stage"><h5><span>3</span>块起点 + 块内偏移 = packed 聚合地址</h5><div class="pe-weight-address-sum"><div><small>第 ${v.block} 块的起点</small><strong>${hex(v.blockBase)}</strong><span>${v.block} × 16 KiB</span></div><b>+</b><div><small>块内第 ${v.localCO} 行、第 ${v.localCI} 字节</small><strong>${hex(rowBase)} + ${hex(v.localCI)}</strong><span>${hex(v.innerOffset)} = ${count(v.innerOffset)} B</span></div><b>=</b><div class="is-result"><small>Weight[${v.co},${v.ci}] 的 packed 聚合地址</small><strong>${hex(v.packedOffset)}</strong><span>base 0 + ${count(v.packedOffset)} B</span></div></div><p class="pe-weight-source-address"><strong>普通 row-major 输入的地址不同：</strong>整张矩阵每行4096 B，输入偏移为 <code>${v.co}×4096+${v.ci} = ${hex(v.rowMajorOffset)}</code>。pack 后按基本块排列，选中元素移到 <code>${hex(v.packedOffset)}</code>；其逻辑坐标与数值不变。</p><details class="pe-weight-compare"><summary>跨越块边界时，相邻元素还相邻吗？</summary><p>点击“当前块末”再点“下一块首”：输入地址只加1 B，packed 地址却换到下一块。块内仍是128 B一行，没有再次转置；跨块的顺序发生了变化。</p></details></section>`;
  }

  function ownershipGrid(v) {
    let grid='<span class="pe-weight-grid-corner">group ↓<br>PE →</span>'+Array.from({length:8},(_,p)=>`<span class="pe-weight-grid-axis">${p}</span>`).join('');
    for(let g=0;g<8;g++) {
      grid+=`<span class="pe-weight-grid-axis">${g}</span>`;
      for(let p=0;p<8;p++) grid+=`<span class="pe-weight-owner-cell ${g===v.group?'is-group':''} ${g===v.group&&p===v.pe?'is-active':''}">${g===v.group&&p===v.pe?'选中':'256 B'}</span>`;
    }
    return `<div class="pe-weight-owner-grid">${grid}</div>`;
  }

  function hardwareView(v) {
    const peFirst=Math.floor(v.pe/2)*2;
    return `<section class="pe-weight-stage"><h5><span>1</span>16 KiB 块怎样分给 8 个 group × 8 个 PE</h5><p>每个 group 取16行 CO，在聚合地址中连续，共 <strong>16×128 B = 2 KiB</strong>；同一 group 的8个 PE 再按 CI 每16列分工，每个 PE 得到 <strong>16 CO×16 CI = 256 B</strong>。</p><div class="pe-weight-ownership"><div>${ownershipGrid(v)}<p class="pe-weight-caption">这是一个 miniblock 的分工图。每行对应16个 CO，每列对应16个 CI；同一行8格合计2 KiB。</p></div><div class="pe-weight-assignment"><div><span>group ${v.group}</span><strong>CO ${range(v.q*128+v.group*16,16)}</strong><small>选中这16个输出通道</small></div><div><span>PE ${v.pe}</span><strong>CI ${range(v.t*128+v.pe*16,16)}</strong><small>负责其中16个输入通道</small></div><div><span>ALU ${v.alu}</span><strong>CO ${v.co}</strong><small>选定一个输出通道</small></div><div><span>lane ${v.lane}</span><strong>CI ${v.ci}</strong><small>这16项中的第 ${v.lane} 项（从0编号）</small></div></div></div><div class="pe-weight-byte-focus"><p>放大 PE ${v.pe} / ALU ${v.alu} 的16个权重字节：下方编号为块内 CI</p>${byteStrip(v)}</div></section>
      <section class="pe-weight-stage"><h5><span>2</span>同一字节在 MC 返回中处于什么位置</h5><p>现在换成读取接口的视角：group ${v.group} 的2 KiB，按 <strong>2轮 × 2个hub × 16个MC × 32 B</strong> 组成。下图逐层展开包含选中字节的那一份。</p><div class="pe-weight-route-slices">${Array.from({length:4},(_,i)=>`<div class="${Math.floor(i/2)===v.round&&i%2===v.hub?'is-active':''}"><span>round ${Math.floor(i/2)} · hub ${i%2}</span><strong>512 B</strong><small>ALU ${range(Math.floor(i/2)*8+(i%2)*4,4)}</small></div>`).join('')}</div><p class="pe-weight-route-label">↓ 展开 round ${v.round} / hub ${v.hub}：16个 MC 各返回32 B</p><div class="pe-weight-mc-strip">${Array.from({length:16},(_,mc)=>`<span class="${mc===v.mc?'is-active':''}"><small>MC</small><b>${mc}</b></span>`).join('')}</div><p class="pe-weight-route-label">↓ 展开 MC ${v.mc} 的32 B：对应 ALU ${v.alu}，由相邻两个 PE 各占16 B</p><div class="pe-weight-mc-half-labels"><span>前16 B → PE ${peFirst}</span><span>后16 B → PE ${peFirst+1}</span></div>${byteStrip(v,true)}<div class="pe-weight-equation">选中字节：group ${v.group} → hub ${v.hub} → MC ${v.mc} → round ${v.round} → <strong>byte ${v.mcByte}</strong></div></section>
      <section class="pe-weight-stage pe-weight-address-stage"><h5><span>3</span>固定这个 MC，找到它的 word、row 和 column</h5><div class="pe-weight-mc-address"><div><small>每块在每个 MC 占两笔32 B</small><strong>word = 2×${v.block} + ${v.round} = ${v.word}</strong></div><div><small>本例每行有128个32 B word</small><strong>row ${v.row} · column ${v.column}</strong></div></div><p>全局 packed 地址 <strong>${hex(v.packedOffset)}</strong> 带着 group、hub、MC 和字节选择信息；剥离这些选择位后，本 MC 用 <strong>word ${v.word}</strong> 取回32 B，再在其中取 <strong>byte ${v.mcByte}</strong>。MC 的 row 不是矩阵的 CO 行。</p><details class="pe-weight-compare"><summary>展开当前坐标的完整换算</summary><pre>group = floor(${v.localCO}/16) = ${v.group}；ALU = ${v.localCO}%16 = ${v.alu}
PE = floor(${v.localCI}/16) = ${v.pe}；lane = ${v.localCI}%16 = ${v.lane}
round = floor(${v.alu}/8) = ${v.round}；hub = floor((${v.alu}%8)/4) = ${v.hub}
MC = 4×(${v.alu}%4) + floor(${v.pe}/2) = ${v.mc}
byte = 16×(${v.pe}%2) + ${v.lane} = ${v.mcByte}
word = 2×${v.block} + ${v.round} = ${v.word}
row = floor(${v.word}/128) = ${v.row}；column = ${v.word}%128 = ${v.column}
FP8 lane ${v.lane} → MAC ${Math.floor(v.lane/2)} 的${v.lane%2?'高':'低'}字节</pre></details></section>`;
  }

  root.peWeightRender=() => {
    const v=PEWeightLayout.locate(peWeightSelection.co,peWeightSelection.ci);
    root.querySelector('[name="co"]').value=v.co;
    root.querySelector('[name="ci"]').value=v.ci;
    root.querySelector('.pe-weight-selection').innerHTML=`<strong>Weight[${v.co},${v.ci}]</strong><span>块号 ${v.block} · 块内 (CO ${v.localCO}, CI ${v.localCI})</span><b>${hex(v.packedOffset)}</b>`;
    root.querySelector('.pe-weight-body').innerHTML=hardware?hardwareView(v):packing(v);
    root.querySelectorAll('[data-co]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.co)===v.co&&Number(button.dataset.ci)===v.ci)));
  };
  function select(co,ci) {
    PEWeightLayout.locate(co,ci);
    peWeightSelection={co,ci};
    document.querySelectorAll('[data-pe-weight-ready]').forEach(element=>element.peWeightRender?.());
  }
  root.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();
    if(event.currentTarget.reportValidity()) select(Number(root.querySelector('[name="co"]').value),Number(root.querySelector('[name="ci"]').value));
  });
  root.querySelectorAll('[data-co]').forEach(button=>button.addEventListener('click',()=>select(Number(button.dataset.co),Number(button.dataset.ci))));
  root.peWeightRender();
}

if (typeof module !== 'undefined' && module.exports) module.exports=PEWeightLayout;
