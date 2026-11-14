'use strict';

let peArchitectureFigureId=0;

// A static route selector; it does not simulate transfers or clock cycles.
function initPEArchitecture(scope=document) {
  const figures=[...scope.querySelectorAll('figure.pe-architecture-figure')];
  if(scope.matches?.('figure.pe-architecture-figure'))figures.unshift(scope);
  for(const figure of figures) {
    if(figure.dataset.peArchitectureReady)continue;
    const svg=figure.querySelector('svg');
    if(!svg||!svg.querySelector('[data-pe-flow]'))continue;
    figure.dataset.peArchitectureReady='true';
    svg.classList.add('pe-architecture-svg');
    const uid=`pe-architecture-${++peArchitectureFigureId}`;
    if(!svg.id)svg.id=uid+'-diagram';
    const tools=document.createElement('div');
    tools.className='pe-architecture-tools';
    tools.setAttribute('role','group');
    tools.setAttribute('aria-label','选择要查看的数据通路');
    const label=document.createElement('span');label.textContent='查看通路';tools.append(label);
    const explanation=document.createElement('p');
    explanation.className='pe-architecture-explanation';explanation.id=uid+'-explanation';
    explanation.setAttribute('role','status');explanation.setAttribute('aria-live','polite');
    const choices=[['all','完整通路'],['act','Act'],['weight','Weight'],['out','Out']];
    const descriptions={
      all:'实线看数据去向，虚线看控制关系。Act 与 Weight 在 PE 内参与乘加，Out 沿局部累加与归约通路写回。',
      act:'Act 从 L2 进入各 PE 的 AL1，再送到乘加单元；同一个输入分片可供当前 PE 内的多个 ALU 使用。',
      weight:'Weight 沿 MC 返回通路，经 hub 与 WL1 的 formatter / FIFO 送入 PE。LDG 表示 Weight 存储域；读请求由 WL1 控制侧发出。',
      out:'各 PE 内的 OL1 保存局部部分和。完整 CI 结束后，normal KC 沿 group 内的归约通路形成 Out，再写回。'
    };
    const flowNodes=[...svg.querySelectorAll('[data-pe-flow]')];
    const buttons=choices.map(([path,title])=>{
      const button=document.createElement('button');button.type='button';button.textContent=title;
      button.dataset.pePath=path;button.setAttribute('aria-controls',svg.id);button.setAttribute('aria-describedby',explanation.id);
      tools.append(button);return button;
    });
    function select(path) {
      svg.dataset.pePath=path;
      for(const node of flowNodes) {
        const routes=node.dataset.peFlow.split(/\s+/);
        const active=path==='all'||routes.includes(path)||routes.includes('compute');
        node.dataset.peFlowActive=String(active);
      }
      for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.pePath===path));
      explanation.textContent=descriptions[path];
    }
    buttons.forEach((button,index)=>{
      button.addEventListener('click',()=>select(button.dataset.pePath));
      button.addEventListener('keydown',event=>{
        let next;
        if(event.key==='ArrowRight')next=(index+1)%buttons.length;
        else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=buttons.length-1;
        else return;
        event.preventDefault();buttons[next].focus();select(buttons[next].dataset.pePath);
      });
    });
    figure.insertBefore(tools,svg);figure.insertBefore(explanation,svg);
    const zoom=figure.querySelector(':scope > .figure-open');
    if(zoom)tools.append(zoom);
    select('all');
  }
}
