/* Dimension and state models for the public DeepSeek architecture guides. */
const DeepSeekArchitectureModel = (() => {
  const configs = Object.freeze({flash:{layers:43,heads:64,selected:512,hidden:4096},pro:{layers:61,heads:128,selected:1024,hidden:7168}});
  function mla({batch=1,tokens=32768}={}) {
    if (!Number.isInteger(batch)||batch<1||!Number.isInteger(tokens)||tokens<1) throw new RangeError('Positive integer batch and tokens required');
    const latent=512,rope=64,heads=128,keyContent=128,value=128,layers=61;
    const compressedElements=latent+rope,expandedElements=heads*(keyContent+rope+value);
    return {batch,tokens,layers,compressedElements,expandedElements,compressedBytes:batch*tokens*compressedElements*2,expandedBytes:batch*tokens*expandedElements*2,allLayerBytes:batch*tokens*compressedElements*2*layers};
  }
  function cache({variant='flash',tokens=32768}={}) {
    if (!configs[variant]||!Number.isInteger(tokens)||tokens<128||tokens%128) throw new RangeError('Known variant and prefix aligned to 128 required');
    const c=configs[variant],csaEntries=tokens/4,hcaEntries=tokens/128,window=128;
    return {variant,tokens,...c,csaEntries,hcaEntries,window,csaRead:Math.min(csaEntries,c.selected),hcaRead:hcaEntries};
  }
  function mhc({alpha=.5,depth=1}={}) {
    if (!Number.isFinite(alpha)||alpha<0||alpha>1||!Number.isInteger(depth)||depth<1||depth>64) throw new RangeError('Invalid matrix parameters');
    const matrix=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>(i===j?1-alpha:0)+(j===(i+1)%4?alpha:0)));
    let output=[1,2,3,4];
    for(let k=0;k<depth;k++) output=matrix.map(row=>row.reduce((s,w,j)=>s+w*output[j],0));
    return {matrix,output,alpha,depth,gain:1.2**depth};
  }
  return {mla,cache,mhc};
})();
if (typeof module !== 'undefined' && module.exports) module.exports=DeepSeekArchitectureModel;
function initDeepSeekArchitectureLabs() {
  const f=(x,d=2)=>Number(x).toLocaleString('en-US',{maximumFractionDigits:d}),gb=x=>`${f(x/2**30,3)} GiB`;
  const box=(x,y,w,h,title,line,color='#e6efe5')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${color}" stroke="#6b8b76"/><text x="${x+w/2}" y="${y+29}" text-anchor="middle" font-size="17" font-weight="600">${title}</text><text x="${x+w/2}" y="${y+54}" text-anchor="middle" font-size="15">${line}</text>`;
  const arrow=(x1,y1,x2,y2)=>`<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="#51715d" stroke-width="2" marker-end="url(#ds-lab-arrow)"/>`;
  const svg=(body,label)=>`<svg viewBox="0 0 900 390" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ds-lab-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="#51715d"/></marker></defs><rect width="900" height="390" rx="12" fill="#f6f8f0"/><g font-family="sans-serif" fill="#233e31">${body}</g></svg>`;
  document.querySelectorAll('[data-deepseek-lab]').forEach(root=>{
    root.classList.add('ds-lab');const kind=root.dataset.deepseekLab;
    if(kind==='v3-mla') {
      root.innerHTML=`<div class="ds-lab-controls"><label>请求数 B <select data-batch><option>1</option><option>8</option><option>32</option></select></label><label>历史长度 N（含当前 token） <select data-tokens><option value="4096">4,096</option><option value="32768" selected>32,768</option><option value="131072">131,072</option></select></label><label>计算步骤 <select data-step><option value="0">① 生成并缓存 latent</option><option value="1">② 吸收 key 上投影</option><option value="2">③ 在 latent 上求加权和</option><option value="3">④ value 上投影与输出</option></select></label></div><div class="ds-lab-stats"></div><div class="ds-lab-frame" aria-live="polite"></div><div class="ds-lab-drawing"></div><button type="button" data-zoom>放大当前数据流 ↗</button><p class="ds-lab-boundary">固定 V3 真实维度；下面是 BF16 逻辑缓存账，不含 allocator、分页、TP 复制和量化元数据。展开表示与吸收表示属于同一组 MLA 参数，不能称为两个模型的实测对比。</p>`;
      const q=s=>root.querySelector(s);
      const frames=[['先保存能还原 K/V 的共同来源','从 h[B,7168] 生成 cKV[B,512] 与位置 key[B,64]，追加进历史。两者跨 decode 步保留；本步 query 不写入 KV cache。'],['把 key 的上投影移到 query 一边','每个 head 的 qC[128] 乘 UKᵀ[128,512] 得 q̂[512]，再与全部历史 cKV[N,512] 点积；另加位置 Q·K 分数。联合分数为 (q̂·cKV + qR·kR) × 原定义 scale，再做一次 softmax。基础 scale 仍为 1/√192；长上下文参考路径可再含 YaRN 系数。'],['softmax 后在历史 latent 上归约','每个 head 用自己的 p[N] 对同一份 cKV[N,512] 求和，得到 u[512]。KV cache 共享，不等于各 head 的注意力分布或加权结果共享。'],['最后才恢复 value 与隐藏宽度','u[512] 乘 UV[512,128] 得该 head 的 out[128]；128 个 head 拼成 16,384 维，经输出投影回到 H=7,168。吸收省去历史 K/V 展开，也改变矩阵工作量位置。']];
      const render=()=>{const m=DeepSeekArchitectureModel.mla({batch:Number(q('[data-batch]').value),tokens:Number(q('[data-tokens]').value)}),s=Number(q('[data-step]').value);
        q('.ds-lab-stats').innerHTML=`<div><small>一层的 latent + 位置 key</small><strong>${gb(m.compressedBytes)}</strong><span>B × N × 576 × 2 B</span></div><div><small>同维度展开 K/V 表示</small><strong>${gb(m.expandedBytes)}</strong><span>B × N × 40,960 × 2 B</span></div><div><small>61 层逻辑压缩缓存</small><strong>${gb(m.allLayerBytes)}</strong><span>所有层均为 MLA</span></div>`;
        q('.ds-lab-frame').innerHTML=`<h4>${frames[s][0]}</h4><p>${frames[s][1]}</p>`;
        const c=idx=>s===idx?'#dcebe0':'#f4f4e9';let body=`<text x="24" y="32" font-size="19">V3 absorbed MLA · B=${m.batch}, N=${f(m.tokens,0)} · 按每个 head 解释</text>`;
        body+=box(25,65,245,80,'当前隐藏向量 h','B × 7,168',c(0))+box(330,65,245,80,'压缩缓存 cKV','B × N × 512',c(0))+box(635,65,240,80,'位置 key 缓存 kR','B × N × 64',c(0))+arrow(270,105,328,105)+`<path d="M300 105V48H755V63" fill="none" stroke="#51715d" stroke-width="2" marker-end="url(#ds-lab-arrow)"/>`;
        body+=box(25,205,245,85,'query 吸收 UKᵀ','q̂[512] + qR[64]',c(1))+box(330,205,245,85,'联合分数 → softmax','q̂·cKV + qR·kR',c(2))+box(635,205,240,85,'value / 输出投影','u[512] → out[128]',c(3))+arrow(270,247,328,247)+arrow(575,247,633,247)+arrow(147,145,147,203)+arrow(452,145,452,203)+arrow(755,145,570,203);
        body+='<text x="147" y="281" text-anchor="middle" font-size="14">qC[128] → q̂[512]</text><text x="452" y="281" text-anchor="middle" font-size="14">p[N]·cKV → u[512]</text><text x="28" y="340" font-size="15">箭头：数据依赖；绿色框：当前步骤。历史缓存始终存在，图为结构示意，非尺寸比例。</text><text x="28" y="367" font-size="15">位置 Q/K 分支单独保留；两个分数项必须进入同一个 softmax，不能拆成两个加权平均。</text>';
        q('.ds-lab-drawing').innerHTML=svg(body,'V3 MLA 压缩缓存与四个吸收计算步骤');
      };root.querySelectorAll('select').forEach(e=>e.onchange=render);render();q('[data-zoom]').onclick=()=>openFigureDialog(q('svg'),'V3 MLA 的同参数吸收计算与跨步缓存；结构示意。','deepseek-v3-mla');
    } else if(kind==='v4-cache') {
      root.innerHTML=`<div class="ds-lab-controls"><label>模型 <select data-variant><option value="flash">V4-Flash</option><option value="pro">V4-Pro</option></select></label><label>已完成前缀 N <select data-tokens><option value="1024">1,024</option><option value="4096">4,096</option><option value="8192">8,192</option><option value="32768">32,768</option><option value="65536">65,536</option><option value="1048576" selected>1,048,576</option></select></label></div><div class="ds-lab-stats"></div><div class="ds-lab-frame" aria-live="polite"></div><div class="ds-lab-drawing"></div><button type="button" data-zoom>放大条目账 ↗</button><p class="ds-lab-boundary">此为完整分组、边界对齐的逻辑条目模型：只计算长程压缩分支与最近 128 行窗口。未把 indexer、pooling state、未完成尾部、sink、页表、padding 与真实存储格式折成字节；不是完整 KV 显存或 HBM 读取量。CSA 的 Top-K 是压缩 KV 条目数，和 MoE 专家 Top-6 无关。</p>`;
      const q=s=>root.querySelector(s),render=()=>{const m=DeepSeekArchitectureModel.cache({variant:q('[data-variant]').value,tokens:Number(q('[data-tokens]').value)});
        q('.ds-lab-stats').innerHTML=`<div><small>CSA 完整压缩条目</small><strong>${f(m.csaEntries,0)}</strong><span>N / 4，候选池</span></div><div><small>CSA 单 query 选中条目</small><strong>${f(m.csaRead,0)} + 128</strong><span>压缩分支 + 局部窗口</span></div><div><small>HCA 单 query 压缩条目</small><strong>${f(m.hcaRead,0)} + 128</strong><span>N / 128 全部参与 + 窗口</span></div>`;
        q('.ds-lab-frame').innerHTML=`<h4>同一 N=${f(m.tokens,0)} 前缀，两种层各自怎样处理历史？</h4><p>CSA 每 4 个 token 产生一个压缩条目，再从 ${f(m.csaEntries,0)} 条候选中最多选 ${m.selected} 条；HCA 每 128 个 token 产生一条，直接对 ${f(m.hcaEntries,0)} 个压缩条目做注意力。它们各自都与本层局部窗口共同归一化。</p>`;
        const body=`<text x="24" y="32" font-size="19">V4-${m.variant==='flash'?'Flash':'Pro'} · 边界对齐的历史条目教学账</text>${box(25,65,250,85,'原始前缀',`N = ${f(m.tokens,0)} token`)}${box(330,65,245,85,'CSA · 压缩率 4',`${f(m.csaEntries,0)} 条候选`)}${box(630,65,245,85,'内容选择',`最多 ${f(m.csaRead,0)} 条`)}${arrow(275,107,328,107)}${arrow(575,107,628,107)}${box(25,210,250,85,'同样长的原始前缀',`N = ${f(m.tokens,0)} token`)}${box(330,210,245,85,'HCA · 压缩率 128',`${f(m.hcaEntries,0)} 条压缩条目`)}${box(630,210,245,85,'全部压缩条目参与',`共 ${f(m.hcaRead,0)} 条`)}${arrow(275,252,328,252)}${arrow(575,252,628,252)}<text x="28" y="338" font-size="15">两路各自再并入最近 128 行 SWA；图按逻辑计数，框大小不按条目数量比例绘制。</text><text x="28" y="365" font-size="15">CSA 与 HCA 是不同 Transformer 层中的两种 attention，不能画成先后必经的两级筛选。</text>`;
        q('.ds-lab-drawing').innerHTML=svg(body,'CSA 的内容选择与 HCA 全部压缩条目对照');
      };const defaultTokens=root.dataset.defaultTokens;if(defaultTokens&&Array.from(q('[data-tokens]').options).some(option=>option.value===defaultTokens))q('[data-tokens]').value=defaultTokens;root.querySelectorAll('select').forEach(e=>e.onchange=render);render();q('[data-zoom]').onclick=()=>openFigureDialog(q('svg'),'对齐前缀的压缩条目计数，排除尾部与元数据；非显存实测。','deepseek-v4-cache');
    } else if(kind==='v4-mhc') {
      root.innerHTML=`<div class="ds-lab-controls"><label>混合强度 α <select data-alpha><option value="0">0：恒等</option><option value="0.25">0.25</option><option value="0.5" selected>0.5</option><option value="1">1：循环置换</option></select></label><label>连续残差映射次数 <select data-depth><option value="1">1</option><option value="8">8</option><option value="32">32</option></select></label></div><div class="ds-lab-frame" aria-live="polite"></div><div class="ds-mhc-grid"><div data-matrix></div><div data-values></div></div><p class="ds-lab-boundary">4 个标量是四条 stream 的一个特征坐标，示例矩阵 B=(1−α)I+αP 是双随机的合成矩阵，不是 checkpoint 或动态 Sinkhorn 的真实输出。这里只验证残差混合的局部性质；完整网络还会加入子层计算及 pre/post 系数。</p>`;
      const q=s=>root.querySelector(s),render=()=>{const m=DeepSeekArchitectureModel.mhc({alpha:Number(q('[data-alpha]').value),depth:Number(q('[data-depth]').value)});q('.ds-lab-frame').innerHTML='<h4>双随机约束限制的是残差流之间的混合</h4><p>B 的每行、每列和为 1。下面的每个输出是输入的凸组合，常量向量和总和会被保留。pre / post 系数不受同一双随机约束。</p>';
        q('[data-matrix]').innerHTML=`<table><caption>残差混合 B · 行为输出流，列为输入流</caption><thead><tr><th></th><th>x₀</th><th>x₁</th><th>x₂</th><th>x₃</th><th>行和</th></tr></thead><tbody>${m.matrix.map((row,i)=>`<tr><th>y${i}</th>${row.map(x=>`<td>${f(x,2)}</td>`).join('')}<td>1</td></tr>`).join('')}<tr><th>列和</th><td>1</td><td>1</td><td>1</td><td>1</td><td></td></tr></tbody></table>`;
        q('[data-values]').innerHTML=`<p><b>输入：</b>[1, 2, 3, 4]</p><p><b>重复 ${m.depth} 次后：</b>[${m.output.map(x=>f(x,3)).join(', ')}]</p><p><b>输出总和：</b>${f(m.output.reduce((a,b)=>a+b,0),3)}</p><p>对照：无约束矩阵 1.2I 连乘 ${m.depth} 次，增益为 <b>${f(m.gain,2)}</b>。这是反例演示，不是任一模型的真实观测。</p>`;
      };root.querySelectorAll('select').forEach(e=>e.onchange=render);render();
    }
  });
}
