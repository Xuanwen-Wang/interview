/* DeepSeek V4 routing laboratory. All scores and table rows are teaching inputs. */
function initDeepSeekMoeLabs() {
  document.querySelectorAll('[data-deepseek-moe-lab]').forEach(root => {
    root.classList.add('ds4-lab');
    root.innerHTML = `<div class="ds4-controls"><label>路由方式 <select data-mode><option value="score">后续层：分数 + bias 选择</option><option value="hash">前 3 层：token ID 查表</option></select></label><label>隐藏向量 <select data-variant><option value="a">上下文 A</option><option value="b">上下文 B</option></select></label><label>权重缩放 <select data-scale><option value="1.5">Flash：1.5</option><option value="2.5">Pro：2.5</option></select></label></div><div class="ds4-controls"><button type="button" data-prev>← 上一步</button><button type="button" data-next>下一步 →</button><button type="button" data-reset>重置</button><strong data-step></strong></div><div data-explain class="ds4-step" aria-live="polite"></div><p data-description></p><div data-bars class="ds4-bars" aria-label="专家分数与选中状态"></div><div data-result></div><div class="ds4-print"><b>打印示例：普通层、上下文 A、Flash 缩放 1.5。</b> 依次计算 √softplus 分数；加 bias 后选专家 5、3、1；从原始分数计算权重分别约 0.404、0.499、0.598（显示值四舍五入）。最后执行这三个专家并加上 shared。</div><p class="caption">同一虚构 token ID 在上下文 A/B 的 Hash 表项固定，但向量不同会改变分数和权重；这里没有加载真实 checkpoint 表。</p>`;
    const q = s => root.querySelector(s), modes=q('[data-mode]'), variant=q('[data-variant]'), scale=q('[data-scale]');
    let step=0; const logits={a:[1.4,1,.7,.4,.1,-.2,-.5,-.9],b:[-.2,.2,1,-.4,1.6,.6,-.1,.9]}, bias=[-.5,0,0,.35,0,.55,.1,0], hash=[0,3,6];
    function render() {
      const raw=logits[variant.value].map(x=>Math.sqrt(Math.log1p(Math.exp(x))));
      const val=raw.map((v,i)=>v+(modes.value==='score'?bias[i]:0));
      const ids=modes.value==='hash'?hash:val.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v||a.i-b.i).slice(0,3).map(o=>o.i);
      const sum=ids.reduce((s,i)=>s+raw[i],0), sc=Number(scale.value), max=Math.max(...(step===0?raw:val),1);
      const labels=['计算亲和分数','确定专家身份','计算合并权重','执行专家并合并'];
      const descriptions=['由当前隐藏向量产生 logit，再计算 √softplus(logit)。此时尚未选择专家。',modes.value==='hash'?'查表取出固定专家 0、3、6；条形是原始亲和分数，查表并不按条形排序。':'对原始分数加 bias 后选最高的 3 个；条形显示加偏置的选择分数。','仅取选中专家的原始分数，归一化后乘以所选模型的缩放系数。','每个被选专家对 token 执行 SwiGLU，按权重合并，最后加上始终执行的 shared expert。'];
      q('[data-step]').textContent=`步骤 ${step+1} / 4`; q('[data-explain]').textContent=labels[step]; q('[data-description]').textContent=descriptions[step];
      q('[data-bars]').innerHTML=raw.map((v,i)=>{const selected=step>=1&&ids.includes(i), displayed=step===0?v:val[i]; return `<div class="ds4-row ${selected?'selected':''}"><strong>专家 ${i}${selected?' ✓':''}</strong><span class="ds4-track"><span style="width:${Math.max(0,displayed)/max*100}%"></span></span><span>${displayed.toFixed(3)}${selected?' · 选中':''}</span></div>`}).join('');
      q('[data-result]').innerHTML=step>=2?`<p><b>选中专家的权重</b>（原始分数归一化 × ${sc}）：</p><div class="ds4-weights">${ids.map(i=>`<span>专家 ${i}: ${(sc*raw[i]/sum).toFixed(3)}</span>`).join('')}<span>权重总和 ${sc.toFixed(1)}</span></div>${step===3?'<p><b>输出：</b>Σ(专家输出 × 对应权重) + shared 输出 → 这个 token 的 MoE 输出向量。</p>':''}`:'';
      q('[data-prev]').disabled=step===0; q('[data-next]').disabled=step===3;
    }
    q('[data-prev]').onclick=()=>{step=Math.max(0,step-1);render()};q('[data-next]').onclick=()=>{step=Math.min(3,step+1);render()};q('[data-reset]').onclick=()=>{step=0;render()};[modes,variant,scale].forEach(e=>e.addEventListener('change',render));render();
  });
}
