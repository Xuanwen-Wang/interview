'use strict';

// Teaching model: one channel, fixed local orders, legal sites, no capacity limit.
// This construction does not model CFG placement, epochs, or hardware timing.
function buildSyncStaircase(points) {
  const rows = points.map(([p, c]) => ({p, c})).sort((a, b) => a.p - b.p || a.c - b.c);
  let next = Infinity;
  for (let i = rows.length - 1; i >= 0; i--) rows[i].r = next = Math.min(next, rows[i].c);
  const uniqueSend = [];
  for (const row of rows) {
    if (uniqueSend.length && uniqueSend.at(-1).s === row.p) continue;
    uniqueSend.push({s: row.p, r: row.r});
  }
  const tokens = [];
  for (const token of uniqueSend) {
    if (tokens.length && tokens.at(-1).r === token.r) tokens[tokens.length - 1] = token;
    else tokens.push(token);
  }
  return {rows, tokens};
}

const SYNC_EXAMPLES = [
  {name: '四条依赖：中间交叉', points: [[1, 1], [2, 3], [3, 2], [4, 4]], note: '第 2 条依赖的 recv 必须提前；相同 recv 去重后，(3,2) 同时保护原来的 (2,3) 和 (3,2)。'},
  {name: '同序依赖：合并有代价', points: [[1, 1], [2, 2], [3, 3], [4, 4]], note: '四个消费者可以逐个放行。合成一个 token 后，第一个消费者也要等待 producer 4 的 release。'},
  {name: '完全逆序：一个通知足够', points: [[1, 4], [2, 3], [3, 2], [4, 1]], note: '第一个消费者本来就必须等待 producer 4。一个 (4,1) 已经表达全部必要等待，不再增加等待下界。'},
  {name: '重复站点：先去重再比较', points: [[1, 3], [1, 2], [3, 4], [3, 4]], note: '同一 producer 的最早 consumer 已保护更晚 consumer；同一指令上同一 channel 的收发位不能重复使用。'}
];

function initSyncExplorers() {
  document.querySelectorAll('[data-sync-explorer]').forEach(root => {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    root.classList.add('sync-explorer');
    let example = 0, step = 0;
    const stepNames = ['输入依赖', '后缀最小值', '去重得到阶梯', '与一个粗 token 比较'];
    root.innerHTML = `<div class="sync-controls"><label>教学输入 <select aria-label="选择同步教学输入">${SYNC_EXAMPLES.map((e, i) => `<option value="${i}">${e.name}</option>`).join('')}</select></label><div class="sync-step-buttons" aria-label="推导步骤">${stepNames.map((name, i) => `<button type="button" data-sync-step="${i}">${i + 1}. ${name}</button>`).join('')}</div></div><div class="sync-stage" aria-live="polite"></div><div class="sync-controls sync-navigation"><button type="button" data-sync-prev>← 上一步</button><button type="button" data-sync-reset>重置本例</button><button type="button" data-sync-next>下一步 →</button></div><p class="sync-boundary">单 channel、直线段、固定单元内顺序，假设站点合法且容量足够。p/c 与 s/r 是指令序号，不是时间、字节或 tensor 维度。本演示不运行编译器，不估计周期，也不验证循环和死锁。</p>`;
    const render = () => {
      const selected = SYNC_EXAMPLES[example];
      const {rows, tokens} = buildSyncStaircase(selected.points);
      const coarse = {s: Math.max(...selected.points.map(p => p[0])), r: Math.min(...selected.points.map(p => p[1]))};
      const pairs = items => items.map(t => `(${t.s},${t.r})`).join('、');
      const active = step === 0 ? [] : step === 1 ? rows.map(row => ({s: row.p, r: row.r})) : step === 2 ? tokens : [coarse];
      const x = p => 78 + p * 78, y = c => 324 - c * 56;
      const ticks = [1, 2, 3, 4];
      const drawing = `<svg viewBox="0 0 500 410" role="img" aria-label="依赖点与当前通知站点，横轴发送单元顺序，纵轴接收单元顺序" xmlns="http://www.w3.org/2000/svg"><rect width="500" height="410" fill="#fffef9"/><text x="28" y="30" font-size="16" fill="#243c47">V：consumer 顺序（向上更晚）</text><path d="M78 60 V324 H455" fill="none" stroke="#73877a" stroke-width="2"/>${ticks.map(i => `<path d="M${x(i)} 68 V324 M78 ${y(i)} H450" stroke="#e2e8de"/><text x="${x(i)}" y="348" text-anchor="middle" font-size="15">${i}</text><text x="56" y="${y(i) + 5}" text-anchor="middle" font-size="15">${i}</text>`).join('')}${step === 3 ? `<rect x="78" y="68" width="${x(coarse.s) - 78}" height="${y(coarse.r) - 68}" fill="#dcebdc" opacity=".65"/>` : ''}${selected.points.map(([p, c]) => `<circle cx="${x(p)}" cy="${y(c)}" r="6" fill="#aa542e"/>`).join('')}${active.map(t => `<rect x="${x(t.s) - 11}" y="${y(t.r) - 11}" width="22" height="22" fill="none" stroke="#2c6653" stroke-width="2.5"/>`).join('')}<text x="250" y="379" text-anchor="middle" font-size="16">U：producer 顺序（向右更晚）</text></svg>`;
      const explanations = [
        '橙色圆点是必须保护的 (p,c)。先检查双方的顺序：若直接把每个点当 token，发送与接收顺序可能交叉，无 tag 计数器不会按资源名匹配。',
        '从右往左计算 r=min(当前 c, 右侧最小值)。绿色空心框是尚未去重的 (p,r)：通知不能比后续 token 接收得更晚。表中保留每一步的数值。',
        `同 send 留最早 recv，同 recv 留最晚 send。输出 ${tokens.length} 枚 token：${pairs(tokens)}。每条原依赖都被至少一个 s≥p 且 r≤c 的 token 覆盖。`,
        `合为 (${coarse.s},${coarse.r}) 只需一枚 token。浅绿色区域是它覆盖的 p≤s、c≥r；比较下表，判断减少通知是否额外提前了等待。不能据此推断实际速度。`
      ];
      root.querySelector('.sync-stage').innerHTML = `<h4>${step + 1}. ${stepNames[step]}</h4><p>${explanations[step]}</p><figure>${drawing}<figcaption>橙圆 = 原依赖；绿框 = 当前 token 候选。坐标按教学整数序号等距绘制，不是硬件时间轴。</figcaption></figure><table><caption>按 producer 排序的构造过程</caption><thead><tr><th>producer p</th><th>consumer c</th><th>后缀最小 r</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.p}</td><td>${row.c}</td><td>${step ? row.r : '下一步计算'}</td></tr>`).join('')}</tbody></table><p>${selected.note}</p>${step === 3 ? `<table><caption>每个 consumer 发射前必须等待到哪个 producer 的 release</caption><thead><tr><th>consumer</th><th>阶梯</th><th>一个粗 token</th><th>等待下界</th></tr></thead><tbody>${ticks.map(c => { const weak = Math.max(0, ...tokens.filter(t => t.r <= c).map(t => t.s)); const strong = coarse.r <= c ? coarse.s : 0; return `<tr><td>${c}</td><td>${weak || '无此通道等待'}</td><td>${strong || '无此通道等待'}</td><td>${strong > weak ? '被提高' : '相同'}</td></tr>`; }).join('')}</tbody></table>` : ''}`;
      // Each redraw owns its zoom action and table wrappers; shared chapter
      // initialization runs once, while these DOM nodes are replaced per step.
      root.querySelectorAll('.sync-stage table').forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrap';
        table.before(wrapper);
        wrapper.append(table);
      });
      const zoom = document.createElement('button');
      zoom.type = 'button';
      zoom.className = 'figure-open';
      zoom.textContent = '放大当前推导图 ↗';
      zoom.addEventListener('click', () => {
        const figure = root.querySelector('figure');
        openFigureDialog(figure.querySelector('svg'), figure.querySelector('figcaption').textContent, 'sync');
      });
      root.querySelector('figure').append(zoom);
      root.querySelectorAll('[data-sync-step]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.syncStep) === step)));
      root.querySelector('[data-sync-prev]').disabled = step === 0;
      root.querySelector('[data-sync-next]').disabled = step === 3;
    };
    root.querySelector('select').addEventListener('change', event => { example = Number(event.target.value); step = 0; render(); });
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-sync-step')) step = Number(button.dataset.syncStep);
      else if (button.hasAttribute('data-sync-prev')) step = Math.max(0, step - 1);
      else if (button.hasAttribute('data-sync-next')) step = Math.min(3, step + 1);
      else if (button.hasAttribute('data-sync-reset')) step = 0;
      else return;
      render();
    });
    render();
  });
}

if (typeof module !== 'undefined') module.exports = {buildSyncStaircase};
