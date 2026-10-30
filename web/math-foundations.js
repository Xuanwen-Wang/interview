'use strict';

// Small CPU teaching models. These are not GPU kernels or production samplers.
const MathFoundations = (() => {
  const sum = xs => xs.reduce((a,b)=>a+b,0);
  const dot = (a,b) => sum(a.map((x,i)=>x*b[i]));
  const sigmoid = x => x>=0 ? 1/(1+Math.exp(-x)) : Math.exp(x)/(1+Math.exp(x));
  const softplus = x => Math.max(x,0)+Math.log1p(Math.exp(-Math.abs(x)));
  const silu = x => x*sigmoid(x);
  function softmax(xs, temperature=1) {
    if (!(temperature>0) || !xs.length || xs.some(x=>Number.isNaN(x)||x===Infinity)) throw new RangeError('Invalid scores');
    const m=Math.max(...xs);
    if(m===-Infinity) throw new RangeError('All positions are masked');
    const e=xs.map(x=>Math.exp((x-m)/temperature)), z=sum(e);
    return e.map(x=>x/z);
  }
  function norm(xs, kind='rms', eps=1e-5) {
    if(!xs.length||xs.some(x=>!Number.isFinite(x))||eps<0||!['rms','layer'].includes(kind))throw new RangeError('Invalid norm');
    const mean=sum(xs)/xs.length, centered=kind==='layer'?xs.map(x=>x-mean):xs;
    const denominator=Math.sqrt(dot(centered,centered)/xs.length+eps);
    return {mean,denominator,values:centered.map(x=>denominator?x/denominator:0)};
  }
  function route(scores, k, bias=scores.map(()=>0), scale=1) {
    if(!Number.isInteger(k)||k<1||k>scores.length||scores.some(x=>x<0||!Number.isFinite(x)))throw new RangeError('Invalid route');
    // Explicit educational tie policy: smaller index wins. Production APIs may differ.
    const indices=scores.map((_,i)=>i).sort((a,b)=>(scores[b]+bias[b])-(scores[a]+bias[a])||a-b).slice(0,k);
    const denominator=sum(indices.map(i=>scores[i]));
    if(!(denominator>0))throw new RangeError('Zero route mass');
    return {indices,weights:scores.map((x,i)=>indices.includes(i)?scale*x/denominator:0)};
  }
  function nucleus(probabilities, threshold) {
    if(!(threshold>0&&threshold<=1))throw new RangeError('Invalid threshold');
    const sorted=probabilities.map((_,i)=>i).sort((a,b)=>probabilities[b]-probabilities[a]||a-b);
    const indices=[];let mass=0;
    for(const i of sorted){indices.push(i);mass+=probabilities[i];if(mass>=threshold)break;}
    return {indices,weights:probabilities.map((x,i)=>indices.includes(i)?x/mass:0)};
  }
  function attention(q, keys, values, masked=[]) {
    const scores=keys.map((k,i)=>masked.includes(i)?-Infinity:dot(q,k)/Math.sqrt(q.length));
    const probabilities=softmax(scores);
    return {scores,probabilities,output:values[0].map((_,j)=>sum(values.map((v,i)=>probabilities[i]*v[j])))};
  }
  const rotate = (v, angle) => [Math.cos(angle)*v[0]-Math.sin(angle)*v[1],Math.sin(angle)*v[0]+Math.cos(angle)*v[1]];
  function online(scores, values, blockSize) {
    if(!Number.isInteger(blockSize)||blockSize<1)throw new RangeError('Invalid block size');
    let m=-Infinity,l=0,u=values[0].map(()=>0);
    for(let start=0;start<scores.length;start+=blockSize){
      const block=scores.slice(start,start+blockSize), next=Math.max(m,...block);
      if(next===-Infinity)continue;
      const alpha=Math.exp(m-next), e=block.map(s=>Math.exp(s-next));
      u=u.map((x,j)=>alpha*x+sum(e.map((p,i)=>p*values[start+i][j])));
      l=alpha*l+sum(e);m=next;
    }
    if(l===0)throw new RangeError('All positions are masked');
    return u.map(x=>x/l);
  }
  function sinkhorn(matrix, iterations) {
    let a=matrix.map(row=>row.slice());
    for(let i=0;i<iterations;i++){
      a=a.map(row=>{const z=sum(row);return row.map(x=>x/z);});
      const cols=a[0].map((_,j)=>sum(a.map(row=>row[j])));
      a=a.map(row=>row.map((x,j)=>x/cols[j]));
    }
    return a;
  }
  return {sum,dot,sigmoid,softplus,silu,softmax,norm,route,nucleus,attention,rotate,online,sinkhorn};
})();

function initMathFoundations(root=document) {
  const m=MathFoundations, fmt=x=>Number.isFinite(x)?x.toFixed(4):'−∞';
  const slider=(id,label,min,max,step,value)=>`<label for="${id}">${label}<input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output for="${id}"></output></label>`;
  const table=(heads,rows)=>`<table><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const bars=(values,labels)=>`<svg viewBox="0 0 760 260" role="img" aria-label="归一化权重柱状图，纵轴从零到一"><text x="15" y="23" font-size="16">权重（0 到 1）</text>${[0,.5,1].map(v=>`<path d="M45 ${220-v*170} H735" stroke="#cbd5df"/><text x="6" y="${225-v*170}" font-size="15">${v}</text>`).join('')}${values.map((v,i)=>{const x=65+i*660/values.length;return `<rect x="${x}" y="${220-v*170}" width="${Math.min(80,500/values.length)}" height="${Math.max(0,v*170)}" fill="#2965b0"/><text x="${x}" y="${208-v*170}" font-size="16">${fmt(v)}</text><text x="${x}" y="245" font-size="16">${labels[i]}</text>`;}).join('')}</svg>`;
  root.querySelectorAll('[data-math-lab]').forEach((host,index)=>{
    const kind=host.dataset.mathLab, prefix=`math-${kind}-${index}`;
    let controls='';
    if(kind==='softmax')controls=slider(`${prefix}-t`,'温度 τ',.25,3,.25,1)+slider(`${prefix}-c`,'共同偏移 c',-1000,1000,100,0);
    if(kind==='norm')controls=slider(`${prefix}-a`,'输入缩放 a',.5,3,.5,1)+slider(`${prefix}-c`,'输入偏移 c',-4,4,1,0);
    if(kind==='route')controls=slider(`${prefix}-k`,'保留专家数 K',1,4,1,2)+slider(`${prefix}-b`,'专家 0 的选择偏置',0,.9,.1,0);
    if(kind==='attention')controls=slider(`${prefix}-q`,'查询 q 的第 1 分量',-3,3,.5,1)+`<label for="${prefix}-mask"><input id="${prefix}-mask" type="checkbox">屏蔽第 3 个历史位置</label>`;
    if(kind==='activation')controls=slider(`${prefix}-x`,'输入 x',-5,5,.25,-1);
    host.innerHTML=`<div class="math-lab-heading">动手改变一个条件</div><div class="math-controls">${controls}<button type="button" data-math-reset>重置</button></div><div class="math-result" aria-live="polite"></div><p class="math-lab-note">教学算例；数值在本机浏览器计算。打印保留当前参数与结果。</p>`;
    const value=s=>Number(host.querySelector(`#${prefix}-${s}`).value);
    function render(){
      host.querySelectorAll('input[type=range]').forEach(input=>input.nextElementSibling.textContent=input.value);
      let html='';
      if(kind==='softmax'){
        const t=value('t'), c=value('c'), z=[0,1,2].map(x=>x+c), p=m.softmax(z,t), e=z.map(x=>Math.exp((x-Math.max(...z))/t));
        html=`<p>logits = [${z.join(', ')}]，τ = ${t}。先减最大值，再除温度；共同偏移不改变分布。</p>`+table(['位置','z','(z−max z)/τ','exp','概率'],z.map((x,i)=>[i,x,fmt((x-Math.max(...z))/t),fmt(e[i]),fmt(p[i])]))+bars(p,['位置 0','位置 1','位置 2']);
      } else if(kind==='norm'){
        const x=[1,2,3,4].map(v=>value('a')*v+value('c')), l=m.norm(x,'layer'), r=m.norm(x,'rms');
        html=`<p>x = [${x.join(', ')}]；γ = 1，β = 0，ε = 10⁻⁵。LayerNorm 均值 μ = ${fmt(l.mean)}。</p>`+table(['特征','输入','LayerNorm','RMSNorm'],x.map((v,i)=>[i,v,fmt(l.values[i]),fmt(r.values[i])]))+`<p>LayerNorm 分母 ${fmt(l.denominator)}；RMSNorm 分母 ${fmt(r.denominator)}。先改 c，再改 a，观察哪种变化被消去。</p>`;
      } else if(kind==='route'){
        const scores=[.1,.4,.8,.6], b=[value('b'),0,0,0], r=m.route(scores,value('k'),b);
        html=`<p>先按 s+b 选择，再按原始 s 归一化。选中专家：${r.indices.join(', ')}。教学并列规则：较小编号优先。</p>`+table(['专家','亲和分 s','选择分 s+b','合并权重'],scores.map((v,i)=>[i,v,fmt(v+b[i]),fmt(r.weights[i])]))+bars(r.weights,['专家 0','专家 1','专家 2','专家 3']);
      } else if(kind==='attention'){
        const q=[value('q'),1], keys=[[1,0],[0,1],[1,1]], values=[[2,0],[0,4],[2,4]], masked=host.querySelector(`#${prefix}-mask`).checked?[2]:[], a=m.attention(q,keys,values,masked);
        html=`<p>q = [${q.join(', ')}]；dₖ = 2；沿 3 个历史位置做 Softmax。</p>`+table(['位置','K','V','score','概率'],keys.map((k,i)=>[i,`[${k}]`,`[${values[i]}]`,fmt(a.scores[i]),fmt(a.probabilities[i])]))+bars(a.probabilities,['历史 0','历史 1','历史 2'])+`<p><strong>输出 = [${a.output.map(fmt).join(', ')}]</strong>。每个分量都是同一组概率对 V 对应分量的加权和。</p>`;
      } else if(kind==='activation'){
        const x=value('x');
        html=table(['输入 x','ReLU','Sigmoid','SiLU','Softplus','√Softplus'],[[x,fmt(Math.max(0,x)),fmt(m.sigmoid(x)),fmt(m.silu(x)),fmt(m.softplus(x)),fmt(Math.sqrt(m.softplus(x)))]])+`<p>Sigmoid 的输出在 0 与 1 之间；SiLU 是 x × Sigmoid(x)，因此可以为负。Softplus 与 √Softplus 为正，但没有 1 这个上界。</p>`;
      }
      host.querySelector('.math-result').innerHTML=html;
    }
    host.addEventListener('input',render);
    host.querySelector('[data-math-reset]').addEventListener('click',()=>{host.querySelectorAll('input').forEach(input=>{input.value=input.defaultValue;input.checked=input.defaultChecked;});render();});
    render();
  });
}
if(typeof module!=='undefined')module.exports=MathFoundations;
