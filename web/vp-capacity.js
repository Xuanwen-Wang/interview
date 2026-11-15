'use strict';

// Conditional ordinary-tensor envelope; packet service and VP clocks are normalized.
const VPCapacity = (() => {
  function estimate({mode='wide',input='bf16',output='bf16',streams=1,units=1,mhz=400,ops=1}={}) {
    if(!['wide','pipe'].includes(mode)||!['bf16','fp32'].includes(input)||!['bf16','fp32'].includes(output)||![1,2].includes(streams)||![1,4].includes(units)||![1,2].includes(ops)||!Number.isFinite(mhz)||mhz<=0)throw new RangeError('Unsupported capacity contract');
    const inputBytes=input==='bf16'?2:4,outputBytes=output==='bf16'?2:4;
    const group=mode==='pipe'||input==='fp32'?32:64;
    const writes=Math.ceil(group*outputBytes/128),readRate=group/streams,writeRate=group/writes;
    const rate=Math.min(group,readRate,writeRate),gElements=rate*mhz*units/1000;
    return {mode,input,output,streams,units,mhz,ops,group,writes,readRate,writeRate,rate,gElements,tops:gElements*ops/1000,inputValid:group*inputBytes,outputValid:group*outputBytes};
  }
  return {estimate};
})();
function initVpCapacity(chapter) {
  if(chapter.id!=='hw-vp-architecture')return;
  document.querySelectorAll('[data-vp-capacity]').forEach(root=>{
    const controls=document.createElement('div');controls.className='vp-capacity-controls';
    const fields=[['mode','引擎连接',[['wide','wide · A/B 并行'],['pipe','pipe · A→B 级联']]],['input','输入类型',[['bf16','BF16'],['fp32','FP32']]],['output','输出类型',[['bf16','BF16'],['fp32','FP32']]],['streams','逐元素读流',[[1,'1 路 X'],[2,'2 路 X/Y']]],['units','统计范围',[[1,'单 VP'],[4,'一个 Core · 4 VP']]],['ops','每结果基础运算',[[1,'1 次 · MUL'],[2,'2 次 · MUL + ADD']]]];
    controls.innerHTML=fields.map(([key,label,values])=>`<label>${label}<select name="${key}">${values.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`).join('')+'<label>假设频率 / MHz<input name="mhz" type="number" min="1" max="2000" step="1" value="400"></label>';
    const view=document.createElement('div');view.className='vp-capacity-view';root.prepend(controls,view);root.dataset.ready='true';
    const draw=()=>{
      const config=Object.fromEntries([...controls.querySelectorAll('select,input')].map(el=>[el.name,['streams','units','ops','mhz'].includes(el.name)?Number(el.value):el.value]));
      if(!Number.isFinite(config.mhz)||config.mhz<=0){view.textContent='请输入大于零的假设频率。';return;}
      const s=VPCapacity.estimate(config),fp=s.output==='fp32';
      const lane=(x,y,label,active)=>`<g><rect x="${x}" y="${y}" width="290" height="68" rx="8" fill="${active?'#e1eee9':'#f2f3f0'}" stroke="${active?'#5d9382':'#c8d0ca'}"/><text x="${x+14}" y="${y+27}" font-size="18" fill="#234c40">${label}</text>${Array.from({length:16},(_,i)=>`<rect x="${x+14+i*16}" y="${y+40}" width="12" height="13" fill="${active?'#6f9e8c':'#d6ded8'}"/>`).join('')}</g>`;
      const path=s.mode==='pipe'?'M275 170 V179 M420 215 H500':'M420 137 H460 V177 H500'+(s.group===64?' M105 137 H117 V215 H128 M420 215 H460 V177':'');
      view.innerHTML=`<div class="vp-capacity-metrics"><div><small>单 VP 连续结果上界</small><strong>${s.rate} 元素 / 归一化拍</strong><span>读组 ${s.group}/${s.streams}；写组 ${s.group}/${s.writes}</span></div><div><small>${s.units===1?'单 VP':'4 VP 条件总和'} · ${s.mhz} MHz</small><strong>${s.gElements.toFixed(2)} G元素/s</strong><span>每结果计 ${s.ops} 次基本算术</span></div><div><small>按该计数折算</small><strong>${s.tops.toFixed(4)} TOPS</strong><span>FP32 浮点算术也写作 TFLOPS</span></div></div>
      <svg viewBox="0 0 1020 310" role="img" aria-label="输入组经过A/B引擎到写口的吞吐限制"><title>输入组、计算宽度与写出节拍</title><defs><marker id="vp-capacity-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#568375"/></marker></defs><g font-family="sans-serif" fill="#264b40"><text x="20" y="30" font-size="20">一组 ${s.group} 个元素：${s.mode==='pipe'?'同一组依次经过 A、B':'A/B 处理不同位置'}</text><text x="20" y="62" font-size="16">每个小格示意 2 lane；主流是 FP32。未使用的 lane 不计入有效吞吐。</text><text x="20" y="120" font-size="17">读侧</text><text x="20" y="152" font-size="17">${s.streams} 个读包</text><text x="20" y="183" font-size="15">${s.inputValid} B/包</text>${lane(130,100,'A · 32 lane',true)}${lane(130,181,'B · 32 lane',s.mode==='pipe'||s.group===64)}<path d="M105 137 H128 ${path}" fill="none" stroke="#568375" stroke-width="2" marker-end="url(#vp-capacity-arrow)"/><rect x="510" y="108" width="210" height="140" rx="8" fill="#eaf0f9" stroke="#8da6c4"/><text x="526" y="137" font-size="18">PostCal / P2S</text><text x="526" y="170" font-size="17">${s.group} × ${fp?32:16} bit</text><text x="526" y="202" font-size="17">${s.outputValid} B 有效结果</text><text x="526" y="230" font-size="15">${s.writes===2?'分两次发送 FP32 半组':'无跨计算组紧凑拼包'}</text><path d="M724 178 H774" fill="none" stroke="#568375" stroke-width="2" marker-end="url(#vp-capacity-arrow)"/><text x="790" y="120" font-size="18">1024-bit 写口</text>${Array.from({length:s.writes},(_,beat)=>`<rect x="790" y="${140+beat*40}" width="200" height="30" fill="#f0f2ef" stroke="#bbc8bf"/><rect x="790" y="${140+beat*40}" width="${200*Math.min(128,s.outputValid-beat*128)/128}" height="30" fill="#aacbbc"/><text x="800" y="${161+beat*40}" font-size="15">${Math.min(128,s.outputValid-beat*128)} B 有效 / 128 B</text>`).join('')}<text x="20" y="290" font-size="16">${s.mode==='pipe'&&s.output==='bf16'?'pipe BF16：单组写出 32 个结果，64 B 有效；半载荷由 strobe 标记。':'FP32 输出口最多容纳 32 元素/次；接口容量不能单独证明算法吞吐。'}</text></g></svg>
      <p class="vp-capacity-contract">条件：连续普通 tensor、满有效组、所选配方可持续接受一组/VP 拍；读口每拍服务一个包、写口每拍服务一个载荷，暂按同速归一化。实际 core_clk / vp_clk、L2 仲裁、FIFO 等待、装表、尾块和同步会降低结果率。4 VP 数字是各口都获服务时的条件总和。MUL + ADD 计两次，既不宣称融合 FMA，也不计 EXP/PRG 为一次等价浮点操作。</p>`;
    };
    controls.addEventListener('input',draw);draw();
  });
}
if(typeof module!=='undefined')module.exports=VPCapacity;
