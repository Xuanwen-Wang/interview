'use strict';

// Deterministic teaching states. No device execution or hardware timing is inferred.
const CommunicationModel = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  function collective(op, p=4) {
    if (!Number.isInteger(p) || p<2 || p>8) throw new RangeError('Invalid rank count');
    const cell=(r,c)=>({value:10*r+c+1,origins:[{rank:r,index:c}]});
    const input=Array.from({length:p},(_,r)=>Array.from({length:op==='allgather'?1:p},(_,c)=>cell(r,c)));
    const sum=c=>({value:input.reduce((v,row)=>v+row[c].value,0),origins:input.flatMap(row=>row[c].origins)});
    let output;
    if(op==='allreduce') output=Array.from({length:p},()=>Array.from({length:p},(_,c)=>sum(c)));
    else if(op==='reducescatter') output=Array.from({length:p},(_,r)=>[sum(r)]);
    else if(op==='allgather') output=Array.from({length:p},()=>input.map(row=>clone(row[0])));
    else if(op==='alltoall') output=Array.from({length:p},(_,d)=>input.map(row=>clone(row[d])));
    else if(op==='broadcast') {
      output=Array.from({length:p},()=>clone(input[0]));
      for(let r=1;r<p;r++)input[r]=Array(p).fill(null);
    } else throw new RangeError('Unknown collective');
    return {input,output};
  }

  function tp(tokens, p=4) {
    if(!Number.isInteger(tokens)||tokens<1||![2,4,8].includes(p))throw new RangeError('Invalid TP configuration');
    const hidden=4096,intermediate=12288,elementBytes=2;
    const payload=tokens*hidden*elementBytes;
    return {tokens,p,hidden,intermediate,localI:intermediate/p,payload,ringSent:2*(p-1)*payload/p};
  }

  function moe(pattern='balanced') {
    if(!['balanced','hotspot','local'].includes(pattern))throw new RangeError('Invalid route pattern');
    const routes=[];
    for(let source=0;source<4;source++)for(let token=0;token<8;token++) {
      const experts=pattern==='local'?[2*source,2*source+1]:pattern==='hotspot'?[6,7]:[(token+source)%8,(token+source+3)%8];
      experts.forEach((expert,slot)=>routes.push({source,token,slot,expert,destination:Math.floor(expert/2),weight:slot===0?.6:.4}));
    }
    const counts=Array.from({length:4},()=>Array(4).fill(0));
    const loads=Array(8).fill(0),offsets=Array.from({length:4},()=>Array(4).fill(0));
    for(const r of routes){counts[r.source][r.destination]++;loads[r.expert]++;}
    for(let s=0;s<4;s++)for(let d=1;d<4;d++)offsets[s][d]=offsets[s][d-1]+counts[s][d-1];
    const used=Array.from({length:4},()=>Array(4).fill(0));
    for(const r of routes)r.packedIndex=offsets[r.source][r.destination]+used[r.source][r.destination]++;
    const remote=routes.filter(r=>r.source!==r.destination).length;
    const uniqueRemote=new Set(routes.filter(r=>r.source!==r.destination).map(r=>`${r.source}:${r.token}:${r.destination}`)).size;
    return {routes,counts,offsets,loads,remote,uniqueRemote,expandedBytes:remote*4096*2,deduplicatedBytes:uniqueRemote*4096*2};
  }

  function buckets(capacity=2, alpha=2, bandwidth=50) {
    if(![1,2,4].includes(capacity)||alpha<0||bandwidth<=0)throw new RangeError('Invalid bucket model');
    // Four equal 64 KiB gradients become ready after consecutive 4 us compute tasks.
    const ready=[4,8,12,16],bytes=65536,events=[];
    let networkEnd=0;
    for(let i=0;i<4;i+=capacity){
      const release=ready[i+capacity-1],duration=alpha+capacity*bytes/(bandwidth*1e3);
      const start=Math.max(release,networkEnd);networkEnd=start+duration;
      events.push({first:i,last:i+capacity-1,release,start,end:networkEnd,bytes:capacity*bytes});
    }
    const computeEnd=ready.at(-1),serial=computeEnd+events.reduce((v,e)=>v+e.end-e.start,0);
    return {events,computeEnd,end:Math.max(computeEnd,networkEnd),serial};
  }

  function handshake(mode='correct') {
    const base=[
      {title:'准备',payload:0,flag:0,expected:1,safe:false,description:'接收方 payload=0、flag=0。发送方准备写入 42。'},
      {title:'put',payload:0,flag:0,expected:1,safe:false,description:'数据写入已发起；这个状态还没有完成保证，不能据此读取。'},
      {title:'quiet',payload:42,flag:0,expected:1,safe:false,description:'发送方此前的 put 已完成，但接收方尚未观察到可消费的通知。'},
      {title:'signal',payload:42,flag:1,expected:1,safe:false,description:'发送方发布本轮通知。接收方还需要使用库定义的 wait。'},
      {title:'wait → read',payload:42,flag:1,expected:1,safe:true,description:'wait 成立并建立相应一致性保证，消费者现在可以读取 42。'}
    ];
    if(mode==='correct')return base;
    if(mode==='stale')return [
      {title:'第二轮开始',payload:42,flag:1,expected:1,safe:false,description:'上一轮留下 payload=42、flag=1。新一轮准备写入 99，却仍等待 flag==1。'},
      {title:'旧 flag 已满足',payload:42,flag:1,expected:1,safe:false,description:'等待条件立即满足，但它证明的是上一轮；这里可读到旧值 42，不能证明新值 99 已到达。'},
      {title:'本轮数据稍后到达',payload:99,flag:1,expected:1,safe:false,description:'稍后到达 99 无法修复先前的过早消费。需要明确的轮次协议或安全重置。'}
    ];
    if(mode==='generation')return [
      {title:'第二轮开始',payload:42,flag:1,expected:2,safe:false,description:'发送方准备 99，接收方等待本轮序号 2；旧的 flag=1 无法满足条件。'},
      {title:'put → quiet',payload:99,flag:1,expected:2,safe:false,description:'新 payload 完成写入，旧 flag 仍为 1，接收方继续等待。'},
      {title:'signal(2)',payload:99,flag:2,expected:2,safe:false,description:'新通知发布。这里只考虑两轮交接，buffer 复用还必须等待上一轮消费结束。'},
      {title:'wait → read',payload:99,flag:2,expected:2,safe:true,description:'观察到本轮通知后读取 99。轮次解决旧通知问题，不能替代 buffer 的消费完成协议。'}
    ];
    throw new RangeError('Invalid handshake mode');
  }
  return {collective,tp,moe,buckets,handshake};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CommunicationModel;

function initCommunicationLabs() {
  const colors=['#3565ce','#168363','#c78128','#8058bb'],fills=['#eaf1ff','#e8f7ef','#fff4dc','#f1eaff'];
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:2});
  const bytes=n=>n>=1048576?fmt(n/1048576)+' MiB':fmt(n/1024)+' KiB';
  const select=(key,label,values,initial)=>`<label>${label}<select data-comm-control="${key}">${values.map(([v,t])=>`<option value="${v}"${String(v)===String(initial)?' selected':''}>${t}</option>`).join('')}</select></label>`;
  const stat=(n,label)=>`<div class="comm-stat"><strong>${n}</strong><span>${label}</span></div>`;
  const header=(tag,title,note)=>`<header class="comm-lab-head"><span>${tag}</span><h4>${title}</h4><p>${note}</p></header>`;
  const txt=(x,y,t,size=18,color='#17283f',anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${escape(t)}</text>`;
  const svg=(body,h,label)=>`<svg viewBox="0 0 900 ${h}" role="img" aria-label="${escape(label)}"><g font-family="system-ui,sans-serif">${body}</g></svg>`;
  const rect=(x,y,w,h,fill,stroke='#d7e0eb')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.7"/>`;
  const stepControls=(max)=>`<div class="comm-controls"><button type="button" data-step="prev">← 上一步</button><button type="button" data-step="next">下一步 →</button><button type="button" data-step="reset">重置</button><label>步骤<input type="range" min="0" max="${max}" value="0" step="1" data-step-range aria-label="实验步骤"></label></div>`;

  document.querySelectorAll('[data-communication-lab]').forEach(root=>{
    if(root.dataset.ready)return;
    root.dataset.ready='true';root.classList.add('comm-lab');
    const kind=root.dataset.communicationLab;
    const read=name=>root.querySelector(`[data-comm-control="${name}"]`).value;
    const output=html=>{root.querySelector('.comm-output').innerHTML=html;};
    const init=(head,controls)=>{root.innerHTML=head+`<div class="comm-controls">${controls}</div><div class="comm-output" aria-live="polite"></div>`;};
    if(kind==='collectives') {
      const names={allreduce:'AllReduce / SUM',broadcast:'Broadcast / root=0',allgather:'AllGather',reducescatter:'ReduceScatter / SUM',alltoall:'All-to-All'};
      init(header('01 / DATA OWNERSHIP','选中一个输出，追溯它来自哪里','固定 4 ranks；一个小格代表一个整数。颜色和 r 编号表示来源，连线语义与物理执行顺序分开。'),select('operation','操作',Object.entries(names),'allreduce')+select('rank','观察输出 rank',[0,1,2,3].map(r=>[r,'rank '+r]),2)+select('chunk','观察输出位置',[0,1,2,3].map(c=>[c,'位置 '+c]),0));
      const render=()=>{
        const op=read('operation'),r=+read('rank'),data=CommunicationModel.collective(op),control=root.querySelector('[data-comm-control="chunk"]');
        control.disabled=op==='reducescatter';if(control.disabled)control.value='0';const c=+control.value,target=data.output[r][c];
        const sourceSet=new Set(target.origins.map(o=>`${o.rank}:${o.index}`));
        let drawing=txt(32,31,'输入 · 每行一个 rank',22)+txt(515,31,'输出 · 每行一个 rank',22);
        for(const side of ['input','output']) {
          const x=side==='input'?32:515,rows=data[side];
          for(let rank=0;rank<4;rank++) {
            const y=69+rank*77;drawing+=txt(x,y+29,'r'+rank,19);
            rows[rank].forEach((cell,col)=>{
              const bx=x+46+col*78,active=side==='input'?sourceSet.has(`${rank}:${col}`):rank===r&&col===c;
              const source=cell?.origins.length===1?cell.origins[0].rank:0;
              drawing+=rect(bx,y,69,57,active?fills[source]:'#f6f8fb',active?colors[source]:'#dfe6ef');
              drawing+=txt(bx+34.5,y+25,cell?cell.value:'∅',21,active?'#17283f':'#8390a2','middle');
              drawing+=txt(bx+34.5,y+45,cell?(cell.origins.length===1?'r'+cell.origins[0].rank+'·c'+cell.origins[0].index:'Σ 4 ranks'):'无输入',10,active?'#52667f':'#9aa7b7','middle');
            });
          }
        }
        drawing+=txt(456,175,['allreduce','reducescatter'].includes(op)?'Σ':'→',32,'#168363','middle');
        drawing+=txt(456,204,'逻辑操作',12,'#60718a','middle');
        const details=target.origins.map(o=>`r${o.rank} 的位置 ${o.index}`).join('、');
        const meaning=op==='alltoall'?`输出 r${r} 的位置 ${c} 来自输入 r${c} 的目的块 ${r}；数值没有相加。${r===c?'这是本地块。':''}`:op==='reducescatter'?`r${r} 只保留逻辑位置 ${r} 的完整和；输出位置 0 不是原逻辑位置 0。`:op==='broadcast'?'所有输出均来自 root=0；其他 rank 的原 buffer 内容不是本操作的贡献。':op==='allgather'?'来源 rank 决定拼接顺序，输入内容不被归约。':'各 rank 相同逻辑位置的贡献相加，完整结果复制给所有参与者。';
        output(svg(drawing,390,names[op]+' 输入输出追踪')+`<p class="comm-result"><strong>选中结果：${target.value}</strong> ← ${details}</p><p>${meaning}</p><p class="comm-footnote">原始整数按 10 × rank + 位置 + 1 生成。AllGather 每 rank 只取第一个整数；Broadcast 只有 root 的输入有效。</p>`);
      };root.addEventListener('change',render);render();
    } else if(kind==='ring') {
      let step=0;
      const states=CudaGuideModel.ring(Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>10*r+c+1)));
      root.innerHTML=header('02 / ALGORITHM','Ring：让数据块沿着环完成归约与分发','固定方向 r0 → r1 → r2 → r3 → r0。每步表示一轮逻辑传输；不代表全局 barrier，也不代表等长耗时。')+stepControls(6)+`<div class="comm-controls">${select('focus','高亮逻辑 chunk',[0,1,2,3].map(c=>[c,'chunk '+c]),0)}</div><div class="comm-output" aria-live="polite"></div>`;
      const matrix=state=>`<table class="comm-matrix"><caption>行：当前持有者；列：原逻辑位置。下行列出已经包含的贡献者。</caption><thead><tr><th>rank</th>${[0,1,2,3].map(c=>`<th>chunk ${c}</th>`).join('')}</tr></thead><tbody>${state.cells.map((row,r)=>`<tr><th>r${r}</th>${row.map((cell,c)=>`<td class="${cell.owners.length===4?'comm-complete':''} ${c===+read('focus')?'comm-focus':''}"><b>${cell.value}${cell.owners.length===4?' ✓':''}</b><small>{${cell.owners.map(o=>'r'+o).join(', ')}}</small></td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const render=()=>{
        const state=states[step],focus=+read('focus');
        root.querySelector('[data-step="prev"]').disabled=step===0;root.querySelector('[data-step="next"]').disabled=step===6;root.querySelector('[data-step-range]').value=step;
        const positions=[[102,52],[652,52],[652,225],[102,225]],paths=['M248 86H641','M725 126V215','M641 259H248','M175 215V126'];
        let drawing='<defs><marker id="comm-ring-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#7187a2"/></marker></defs>';
        positions.forEach(([x,y],r)=>{drawing+=rect(x,y,146,69,fills[r],colors[r])+txt(x+73,y+28,'rank '+r,21,colors[r],'middle')+txt(x+73,y+52,r===0?'→ r1':r===1?'↓ r2':r===2?'← r3':'↑ r0',15,'#60718a','middle');});
        paths.forEach((d,r)=>{const t=state.transfers.find(t=>t.from===r),active=t?.chunk===focus;drawing+=`<path d="${d}" fill="none" stroke="${active?colors[focus]:'#c3cfdd'}" stroke-width="${active?4:2}" marker-end="url(#comm-ring-arrow)"/>`;});
        const locations=[[450,65],[816,165],[450,293],[79,165]];
        state.transfers.forEach(t=>{const [x,y]=locations[t.from];drawing+=txt(x,y,`c${t.chunk} · ${t.value}`,17,t.chunk===focus?colors[focus]:'#718197','middle');});
        drawing+=txt(450,159,step===0?'每块只有本地贡献':state.phase,25,'#17283f','middle')+txt(450,191,step===0?'点击下一步开始':`第 ${state.round} 轮 · 每 rank 发 1 块`,17,'#60718a','middle');
        const message=step===0?'先按列手算答案：[64, 68, 72, 76]。':step<=3?'接收值与同坐标的本地值相加；第 3 轮后 rank r 的 chunk r 完整。':'传播已完成的块，保持数值和贡献集合；这一阶段不再求和。';
        output(`<p class="comm-step-label">${step} / 6 · ${state.phase}</p>`+svg(drawing,326,'Ring 当前传输方向与数值')+`<p>${message}</p><div class="comm-table-scroll">${matrix(state)}</div><p class="comm-footnote">当前每 rank 累计发送 ${step} 个标量块；输入为 4 块。✓ 表示恰好包含全部 4 个不同来源，不凭数值碰巧相等判断完成。</p><div class="comm-print-only"><p><strong>步骤 3：ReduceScatter 结束，各 rank 保留一块完整结果。</strong></p>${matrix(states[3])}<p><strong>步骤 6：AllGather 结束，所有 rank 持有全部完整结果。</strong></p>${matrix(states[6])}</div>`);
      };
      root.addEventListener('click',e=>{const action=e.target.closest('[data-step]')?.dataset.step;if(!action)return;step=action==='reset'?0:Math.max(0,Math.min(6,step+(action==='next'?1:-1)));render();});
      root.querySelector('[data-step-range]').addEventListener('input',e=>{step=+e.target.value;render();});root.addEventListener('change',render);render();
    } else if(kind==='tp') {
      init(header('03 / MODEL TO COLLECTIVE','同一个 FFN，改变 token 数与 TP 分片','Qwen3-8B 的 H=4096、I=12288；TP 数与 BF16 payload 是教学部署条件。输入 X 已在组内复制。'),select('tokens','本次参与 FFN 的 token 数',[[8,'8 · 短批次 decode 示例'],[128,'128 tokens'],[2048,'2048 · prefill 示例']],8)+select('ranks','TP ranks',[[2,2],[4,4],[8,8]],4));
      const render=()=>{const m=CommunicationModel.tp(+read('tokens'),+read('ranks'));output(`<div class="comm-stats">${stat(`[${m.tokens}, ${m.localI}]`,'每 rank 的 gate / up / Aᵣ')}${stat(`[${m.tokens}, 4096]`,'down 输出：同位置的部分和')}${stat(bytes(m.payload),'每 rank 的 AllReduce 输入')}</div><div class="comm-equation">Y[t,h] = Σᵣ Σⱼ∈分片r A[t,j] × Wdown[j,h]</div><p>每个 rank 覆盖 ${m.localI} 个中间特征 j，却都要计算全部 4096 个输出特征 h。因而 ${m.p} 份 down 输出必须沿 rank 求和。</p><p class="comm-result">理想 Ring：每 rank 发送 ${bytes(m.ringSent)}，接收同量。计数是 payload，未计协议、对齐和实际硬件事务。</p><p class="comm-footnote">T 表示本次 FFN 的 token 行数。这里不建模权重读取、GEMM 时间或服务吞吐；prefill / decode 标签只是输入场景。</p>`);};root.addEventListener('change',render);render();
    } else if(kind==='moe') {
      let step=0;
      root.innerHTML=header('04 / TOKEN JOURNEY','跟着一个 token 走完 dispatch 与 combine','教学模型：4 ranks × 每 rank 8 tokens，8 experts，Top-2，H=4096，BF16。每条路由单独打包；可选择对照的去重字节下界。')+`<div class="comm-controls">${select('pattern','路由模式',[['balanced','均匀轮转'],['hotspot','都去 expert 6 / 7'],['local','全部留在本 rank']],'balanced')}${select('source','来源 rank',[0,1,2,3].map(r=>[r,'rank '+r]),0)}${select('token','token ID',Array.from({length:8},(_,t)=>[t,String(t)]),3)}</div>`+stepControls(5)+`<div class="comm-output" aria-live="polite"></div>`;
      const stages=['选择专家','计数与打包','按目的地 dispatch','专家计算','返回与逆置换','应用权重并 combine'];
      const render=()=>{
        const m=CommunicationModel.moe(read('pattern')),source=+read('source'),token=+read('token'),chosen=m.routes.filter(r=>r.source===source&&r.token===token);
        root.querySelector('[data-step="prev"]').disabled=step===0;root.querySelector('[data-step="next"]').disabled=step===5;root.querySelector('[data-step-range]').value=step;
        const rows=chosen.map(r=>{const value=token+1+r.expert;return `<tr><td>slot ${r.slot}</td><td>expert ${r.expert} / r${r.destination}${r.source===r.destination?' · 本地':''}</td><td>${step>=1?r.packedIndex:'—'}</td><td>${step>=3?value:'—'}</td><td>${step>=5?r.weight:'尚未应用'}</td></tr>`;}).join('');
        let drawing='';chosen.forEach((r,i)=>{const y=30+i*94;const place=step<2?source:step<4?r.destination:source;drawing+=rect(25,y,220,65,fills[source],colors[source])+txt(135,y+27,`r${source} · token ${token}`,20,colors[source],'middle')+txt(135,y+51,`slot ${r.slot} · w=${r.weight}`,15,'#60718a','middle');drawing+=txt(320,y+40,step<4?'→':'←',30,'#60718a','middle')+rect(397,y,225,65,fills[r.destination],colors[r.destination])+txt(510,y+28,`expert ${r.expert} / r${r.destination}`,20,colors[r.destination],'middle')+txt(510,y+52,r.destination===source?'本地分支':'远端分支',15,'#60718a','middle')+txt(765,y+28,'当前数据位置',15,'#60718a','middle')+txt(765,y+54,'rank '+place,23,'#17283f','middle');});
        const combined=chosen.reduce((sum,r)=>sum+r.weight*(token+1+r.expert),0);
        output(`<p class="comm-step-label">${step} / 5 · ${stages[step]}</p>`+svg(drawing,219,'两条 MoE 路由的来源、专家与当前归属')+`<div class="comm-table-scroll"><table><thead><tr><th>路由</th><th>目的地</th><th>来源发送 buffer 位置</th><th>专家输出标量</th><th>权重</th></tr></thead><tbody>${rows}</tbody></table></div><p>${step===5?`按 (source, token, slot) 还原，结果 = ${chosen.map(r=>`${r.weight} × ${token+1+r.expert}`).join(' + ')} = ${fmt(combined)}。`:'示意专家函数 Fₑ(x)=x+e，取 x=token ID+1；只是为核对路由与加权，不模拟真实 FFN。'}</p><details class="comm-details"><summary>展开整个通信组的计数与字节账</summary><div class="comm-table-scroll"><table><caption>counts[source][destination]：每个元素是一条专家路由；行和恒为 16。</caption><thead><tr><th>来源 / 目的地</th>${[0,1,2,3].map(r=>`<th>r${r}</th>`).join('')}</tr></thead><tbody>${m.counts.map((row,r)=>`<tr><th>r${r}</th>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="comm-stats">${stat(m.remote+' / 64','跨 rank 的路由条数')}${stat(bytes(m.expandedBytes),'全组 dispatch payload · 不去重')}${stat(bytes(m.deduplicatedBytes),'按 token / 目的 rank 去重的对照')}</div><p>专家收到的路由条数：[${m.loads.join(', ')}]。去重只在接收方可向同 rank 多专家复用同一输入时成立；返回结果仍按专家区分。字节数未包含返回、权重、索引、padding 或网络协议。</p></details><div class="comm-print-only"><p>完整闭环：按目的地打包 → dispatch → 专家计算 → 按来源返回 → 用 token / slot 逆置换 → 只应用一次权重。此 token 的最终教学标量为 ${fmt(combined)}。</p></div>`);
      };
      root.addEventListener('click',e=>{const action=e.target.closest('[data-step]')?.dataset.step;if(!action)return;step=action==='reset'?0:Math.max(0,Math.min(5,step+(action==='next'?1:-1)));render();});root.querySelector('[data-step-range]').addEventListener('input',e=>{step=+e.target.value;render();});root.addEventListener('change',render);render();
    } else if(kind==='timeline') {
      init(header('05 / DEPENDENCY','梯度 bucket：少发几次，还是早点开始？','教学假设：4 个 64 KiB 梯度分别在 4、8、12、16 μs 就绪；单通信队列；计算与通信资源理想独立。'),select('capacity','每 bucket 梯度数',[[1,1],[2,2],[4,4]],2)+select('alpha','每次固定开销 α',[[1,'1 μs'],[2,'2 μs'],[6,'6 μs']],2));
      const render=()=>{
        const m=CommunicationModel.buckets(+read('capacity'),+read('alpha')),max=Math.max(m.serial,24),scale=680/max;let drawing='';
        const start=175;for(let t=0;t<=max;t+=4)drawing+=`<path d="M${start+t*scale} 48V253" stroke="#e2e8f0" stroke-dasharray="3 4"/>`+txt(start+t*scale,280,t,14,'#60718a','middle');
        drawing+=txt(20,91,'反向计算',18)+txt(20,159,'异步通信',18)+txt(20,228,'串行对照',18)+txt(860,309,'时间 / μs',15,'#60718a','end');
        for(let i=0;i<4;i++)drawing+=rect(start+i*4*scale,60,4*scale-3,46,fills[i],colors[i])+txt(start+(i*4+2)*scale,89,'g'+i,17,colors[i],'middle');
        for(const e of m.events)drawing+=rect(start+e.start*scale,128,(e.end-e.start)*scale,46,'#e8f7ef','#168363')+txt(start+(e.start+e.end)/2*scale,157,'B'+(e.first/+read('capacity')),14,'#168363','middle');
        drawing+=rect(start+16*scale,197,(m.serial-16)*scale,46,'#fff4dc','#c78128')+txt(start+(16+m.serial)/2*scale,226,'全部通信',14,'#8d5a1e','middle');
        output(svg(drawing,330,'梯度就绪、异步通信与串行对照的教学时间线')+`<div class="comm-stats">${stat(m.events.length,'通信调用次数')}${stat(fmt(m.end)+' μs','理想重叠的完成时刻')}${stat(fmt(m.serial)+' μs','先计算后通信的对照')}</div><p>每个 bucket 要等到其中最后一个梯度就绪。较大 bucket 减少固定开销，却推迟首次发送；通信队列前一个操作未结束时，后一个仍需排队。</p><p class="comm-footnote">每次通信时长 = α + bucket 字节数 / 50 GB/s；这是抽象消息模型，不是 NCCL AllReduce 性能公式。真实执行还要计入 SM / HBM / 链路争用和 rank 间就绪差异。</p>`);
      };root.addEventListener('change',render);render();
    } else if(kind==='handshake') {
      let step=0;
      root.innerHTML=header('06 / COMPLETION','payload 到了，与消费者能读，是两件事','使用库所定义的完成与通知语义。这里的逐步状态用于解释保证，不代表对 GPU 内存进行模拟。')+`<div class="comm-controls">${select('mode','场景',[['correct','第一轮：正确交接'],['stale','第二轮：误用旧 flag'],['generation','第二轮：等待新轮次']],'correct')}</div>`+stepControls(4)+`<div class="comm-output" aria-live="polite"></div>`;
      const render=()=>{
        const states=CommunicationModel.handshake(read('mode'));step=Math.min(step,states.length-1);const s=states[step];
        root.querySelector('[data-step-range]').max=states.length-1;root.querySelector('[data-step-range]').value=step;root.querySelector('[data-step="prev"]').disabled=step===0;root.querySelector('[data-step="next"]').disabled=step===states.length-1;
        output(`<p class="comm-step-label">${step} / ${states.length-1} · ${s.title}</p><div class="comm-stats">${stat(s.payload,'接收方 payload')}${stat(s.flag,`当前 flag · 本轮等待 ${s.expected}`)}${stat(s.safe?'可以消费':'尚无本轮消费保证','根据完整交接协议判断')}</div><p class="comm-result ${read('mode')==='stale'?'comm-warning':''}">${s.description}</p><ol class="comm-state-strip">${states.map((v,i)=>`<li class="${step===i?'active':''}">${v.title}</li>`).join('')}</ol><p class="comm-footnote">轮次方案还需要防止发送方覆盖接收方尚未消费完的数据；可通过确认、双缓冲或受约束的流水协议处理。</p><div class="comm-print-only"><ol>${states.map(v=>`<li><strong>${v.title}：</strong>${v.description}</li>`).join('')}</ol></div>`);
      };root.addEventListener('change',e=>{if(e.target.matches('select'))step=0;render();});root.addEventListener('click',e=>{const a=e.target.closest('[data-step]')?.dataset.step;if(!a)return;step=a==='reset'?0:Math.max(0,Math.min(CommunicationModel.handshake(read('mode')).length-1,step+(a==='next'?1:-1)));render();});root.querySelector('[data-step-range]').addEventListener('input',e=>{step=+e.target.value;render();});render();
    }
  });
}
