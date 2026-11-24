'use strict';

// These are logical FIFO witnesses, not timing models or compiler executions.
function mailboxInteger(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(name);
}

function buildMailboxPeriodic(n, k, trips) {
  mailboxInteger(n, 1, 4, 'n');
  mailboxInteger(k, 0, n, 'k');
  mailboxInteger(trips, 0, 3, 'trips');
  const events = [];
  const send = (id, label) => events.push({kind: 'send', label, credit: {id, label}});
  const recv = (label, expectedId, kind = 'recv') => events.push({kind, label, expectedId, expectedLabel: expectedId});
  for (let j = 0; j < k; j++) send('seed' + j, '入口 seed ' + j);
  for (let i = 0; i < trips; i++) {
    for (let j = 0; j < k; j++) {
      recv('r' + (j + 1) + '⁽' + i + '⁾', i === 0 ? 'seed' + j : 's' + (n - k + j + 1) + '⁽' + (i - 1) + '⁾');
    }
    for (let j = 0; j < n - k; j++) {
      const id = 's' + (j + 1) + '⁽' + i + '⁾';
      send(id, id);
      recv('r' + (k + j + 1) + '⁽' + i + '⁾', id);
    }
    for (let j = n - k; j < n; j++) {
      const id = 's' + (j + 1) + '⁽' + i + '⁾';
      send(id, id);
    }
  }
  for (let j = 0; j < k; j++) {
    recv('出口 drain ' + j, trips === 0 ? 'seed' + j : 's' + (n - k + j + 1) + '⁽' + (trips - 1) + '⁾', 'drain');
  }
  return events;
}

function buildMailboxAbsorption(k, trips, extraSeed = false) {
  mailboxInteger(k, 1, 2, 'k');
  mailboxInteger(trips, 0, 3, 'trips');
  const events = [];
  const send = (id, label) => events.push({kind: 'send', label, credit: {id, label, coversParent: true}});
  send('P', '父 producer P 发布');
  // The first entry slot is supplied by P; every later U release covers P.
  for (let j = extraSeed ? 0 : 1; j < k; j++) send('seed' + j, '入口 seed ' + j);
  for (let i = 0; i < trips; i++) {
    for (let j = 0; j < k; j++) {
      events.push({kind: 'recv', label: 'w' + j + '⁽' + i + '⁾',
        expectedId: i ? 's' + j + '⁽' + (i - 1) + '⁾' : null,
        expectedLabel: i ? 's' + j + '⁽' + (i - 1) + '⁾' : '首轮空义务；仍须消费一份入口信用'});
    }
    for (let j = 0; j < k; j++) {
      const id = 's' + j + '⁽' + i + '⁾';
      send(id, id);
    }
  }
  for (let j = 0; j < k - 1; j++) {
    events.push({kind: 'drain', label: '普通 drain ' + j,
      expectedId: trips ? 's' + j + '⁽' + (trips - 1) + '⁾' : 'P',
      expectedLabel: trips ? 's' + j + '⁽' + (trips - 1) + '⁾' : 'P'});
  }
  events.push({kind: 'parent', label: '父 consumer Q 等待',
    expectedLabel: '一份来源确实覆盖 P 的信用', requiresParent: true});
  return events;
}

function runMailboxTrace(events) {
  const queue = [], rows = [];
  let sends = 0, receives = 0;
  for (const event of events) {
    const before = queue.map(c => ({...c})), issues = [];
    let consumed = null;
    if (event.kind === 'send') {
      queue.push({...event.credit});
      sends++;
    } else {
      consumed = queue.shift() || null;
      if (!consumed) issues.push('没有信用：这次等待不能放行');
      else {
        receives++;
        if (event.expectedId && consumed.id !== event.expectedId) issues.push('来源错配：应消费 ' + event.expectedId + '，实际为 ' + consumed.id);
        if (event.requiresParent && !consumed.coversParent) issues.push('父依赖未覆盖：来源没有证明 P 完成');
      }
    }
    rows.push({event, before, after: queue.map(c => ({...c})), consumed, issues, sends, receives});
    // A blocked wait cannot be skipped by the chosen serial witness.
    if (event.kind !== 'send' && !consumed) break;
  }
  return {rows, queue, sends, receives, complete: rows.length === events.length,
    issues: rows.flatMap(row => row.issues).concat(queue.length ? ['退出后残留 ' + queue.length + ' 份信用'] : [])};
}

function initMailboxArchitectureLabs() {
  document.querySelectorAll('[data-mailbox-lab]').forEach(root => {
    if (root.dataset.ready) return;
    root.dataset.ready = 'true';
    root.classList.add('mailbox-lab');
    const absorption = root.dataset.mailboxLab === 'absorption';
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const options = (values, chosen) => values.map(v => '<option value="' + v + '"' + (v === chosen ? ' selected' : '') + '>' + v + '</option>').join('');
    root.innerHTML = '<div class="mailbox-controls">' +
      (absorption
        ? '<label>循环绕回槽 k<select data-param="k" aria-label="吸收实验绕回槽数">' + options([1, 2], 2) + '</select></label><label>入口方案<select data-param="mode" aria-label="吸收实验入口方案"><option value="correct">正确：父信用替代 seed 0</option><option value="extra">错误：父信用之外仍放 seed 0</option></select></label>'
        : '<label>每轮 token 数 n<select data-param="n" aria-label="每轮 token 数">' + options([1, 2, 3, 4], 3) + '</select></label><label>绕回数量 k<select data-param="k" aria-label="循环绕回数量">' + options([0, 1, 2, 3], 1) + '</select></label>') +
      '<label>执行轮数<select data-param="trips" aria-label="' + (absorption ? '吸收' : '周期') + '实验执行轮数">' + options([0, 1, 2, 3], 2) + '</select></label></div>' +
      '<p class="mailbox-scope">' + (absorption
        ? '假设 e=1；P、seed 和循环 send 属于同一个发送单元，按此序有序发布。w 的下标从 0 开始。'
        : '采用入口必经、允许零轮的教学循环；入口 seed 和出口 drain 都执行。s、r 的下标从 1 开始。') +
      '这里按逻辑顺序回放一个可行见证；方框上的身份只供讲解，硬件 credit 没有这些 tag，也不代表执行耗时。</p>' +
      '<div class="mailbox-stage" aria-live="polite"></div><div class="mailbox-controls mailbox-navigation">' +
      '<button type="button" data-action="reset">回到入口</button><button type="button" data-action="prev">← 上一步</button><button type="button" data-action="next">下一步 →</button><button type="button" data-action="end">走到出口</button></div>';
    let position = 0, trace, events;
    const read = key => root.querySelector('[data-param="' + key + '"]').value;
    const rebuild = () => {
      const k = Number(read('k')), trips = Number(read('trips'));
      events = absorption ? buildMailboxAbsorption(k, trips, read('mode') === 'extra') : buildMailboxPeriodic(Number(read('n')), k, trips);
      trace = runMailboxTrace(events);
      position = 0;
      render();
    };
    const render = () => {
      const row = position ? trace.rows[position - 1] : null;
      const queue = row ? row.after : [];
      const end = position === trace.rows.length;
      const issues = end ? trace.issues : trace.rows.slice(0, position).flatMap(r => r.issues);
      const slots = queue.map((c, i) => '<rect x="' + (40 + i * 178) + '" y="65" width="166" height="66" rx="8" fill="' + (i ? '#eaf1f5' : '#e3efe2') + '" stroke="#6d8d80"/><text x="' + (123 + i * 178) + '" y="105" text-anchor="middle" font-size="19">' + escape(c.id) + '</text>').join('');
      const next = trace.rows[position];
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 205" role="img" aria-label="当前有序信用队列，左侧为队首，下次等待先消费左侧信用"><rect width="800" height="205" fill="#fffef9"/><g fill="#243c47" font-family="sans-serif"><text x="40" y="34" font-size="19">队首在左 · FIFO 来源解释</text>' + slots +
        (!queue.length ? '<text x="40" y="104" font-size="22">队列为空</text>' : '') +
        '<text x="40" y="171" font-size="18">累计发布 ' + (row ? row.sends : 0) + ' − 累计消费 ' + (row ? row.receives : 0) + ' = 当前 ' + queue.length + '</text></g></svg>';
      const pairs = trace.rows.slice(0, position).filter(r => r.event.kind !== 'send');
      root.querySelector('.mailbox-stage').innerHTML = '<h4>' + (position ? position + ' / ' + trace.rows.length + '：' + escape(row.event.label) : '入口：先看空队列，再发布第一份信用') + '</h4>' +
        '<p>' + (row ? row.event.kind === 'send' ? '发布完成后，一份信用进入队尾。' : '本次实际消费：<strong>' + escape(row.consumed ? row.consumed.id : '无') + '</strong>。语义要求：' + escape(row.event.expectedLabel) + '。' : '点击“下一步”，同时观察数量和来源。') + '</p>' +
        '<figure>' + svg + '<figcaption>方框表示未消费的逻辑 credit。图中数量是本次回放的账本；它不是 Φ/Ω 的静态峰值，也不是 RTL 波形。</figcaption><button class="figure-open" type="button" data-action="zoom">放大信用队列 ↗</button></figure>' +
        '<p class="mailbox-result ' + (issues.length ? 'has-issue' : '') + '">' + (issues.length ? escape([...new Set(issues)].join('；')) : end ? '本例配对与退出余额检查通过。此结果不证明全局死锁、容量或硬件实现。' : '目前数量与来源相容。下一事件：' + escape(next ? next.event.label : '无')) + '</p>' +
        (pairs.length ? '<div class="table-wrap"><table><caption>已发生的等待：理论所需来源与真实 FIFO 配对</caption><thead><tr><th>等待</th><th>语义所需来源</th><th>实际消费</th><th>检查</th></tr></thead><tbody>' +
          pairs.map(r => '<tr><td>' + escape(r.event.label) + '</td><td>' + escape(r.event.expectedLabel) + '</td><td>' + escape(r.consumed ? r.consumed.id : '无信用') + '</td><td>' + (r.issues.length ? '错配 / 阻塞' : '通过') + '</td></tr>').join('') + '</tbody></table></div>' : '');
      root.querySelector('[data-action="prev"]').disabled = position === 0;
      root.querySelector('[data-action="next"]').disabled = end;
      root.querySelector('[data-action="end"]').disabled = end;
    };
    root.addEventListener('change', event => {
      if (!event.target.matches('[data-param]')) return;
      if (event.target.dataset.param === 'n') {
        const n = Number(read('n')), k = Math.min(n, Number(read('k')));
        root.querySelector('[data-param="k"]').innerHTML = options(Array.from({length: n + 1}, (_, i) => i), k);
      }
      rebuild();
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'zoom') {
        const figure = root.querySelector('figure');
        openFigureDialog(figure.querySelector('svg'), figure.querySelector('figcaption').textContent, 'mailbox');
        return;
      }
      if (action === 'reset') position = 0;
      if (action === 'prev') position = Math.max(0, position - 1);
      if (action === 'next') position = Math.min(trace.rows.length, position + 1);
      if (action === 'end') position = trace.rows.length;
      render();
    });
    rebuild();
  });
}

if (typeof module !== 'undefined') module.exports = {buildMailboxPeriodic, buildMailboxAbsorption, runMailboxTrace};
