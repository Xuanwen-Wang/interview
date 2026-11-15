"""Source-bounded vector diagrams for the continuous VP architecture chapter."""
from html import escape

INK = '#183f42'
MUTED = '#5c7378'
BLUE, GREEN, PURPLE, AMBER = '#287fb0', '#187d72', '#8866a9', '#b07b28'
COLORS = {'blue': ('#eaf4fa', '#98bfd3'), 'green': ('#e8f3ed', '#a1c7b9'),
          'purple': ('#f2edf8', '#c5b0da'), 'amber': ('#fcf2de', '#dac18f'),
          'plain': ('#f6f8f7', '#d4dfdd')}


class Figure:
    def __init__(self, key, title, subtitle, height=700):
        self.key, self.title, self.subtitle, self.height = key, title, subtitle, height
        self.items = []
        self.rect(0, 0, 1080, height, '#ffffff', radius=0)
        self.rect(28, 27, 5, 46, GREEN, radius=2)
        self.text(48, 48, title, 26, weight=600)
        self.text(48, 79, subtitle, 17, color=MUTED)
        self.line(28, 99, 1052, 99, '#dce5e1')

    def text(self, x, y, label, size=18, color=INK, weight=400, anchor='start'):
        self.items.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(label))}</text>')

    def rect(self, x, y, w, h, fill, stroke='none', radius=8, dashed=False):
        dash = ' stroke-dasharray="5 4"' if dashed else ''
        self.items.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"{dash}/>')

    def line(self, x1, y1, x2, y2, color=MUTED, width=1.5, dashed=False):
        dash = ' stroke-dasharray="5 4"' if dashed else ''
        self.items.append(f'<path d="M{x1},{y1}L{x2},{y2}" stroke="{color}" stroke-width="{width}" fill="none"{dash}/>')

    def arrow(self, points, color=GREEN, dashed=False, both=False, width=2.4):
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in points)
        dash = ' stroke-dasharray="6 5"' if dashed else ''
        start = f' marker-start="url(#{self.key}-arrow)"' if both else ''
        self.items.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{dash} marker-end="url(#{self.key}-arrow)"{start}/>')

    def box(self, x, y, w, h, title, lines=(), color='green', size=20):
        self.rect(x, y, w, h, *COLORS[color])
        self.text(x + 16, y + 30, title, size, weight=600)
        for i, label in enumerate(lines):
            self.text(x + 16, y + 58 + 26 * i, label, 17)

    def badge(self, x, y, w, label, color='green'):
        self.rect(x, y, w, 30, *COLORS[color], radius=15)
        self.text(x + w / 2, y + 21, label, 15, anchor='middle', weight=500)

    def circle(self, x, y, r, label, color='green', size=18):
        fill, stroke = COLORS[color]
        self.items.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}"/>')
        self.text(x, y + size * .35, label, size, anchor='middle', weight=600)

    def cells(self, x, y, labels, width=45, height=34, color='green', active=None):
        for i, label in enumerate(labels):
            fill, stroke = (GREEN, GREEN) if active == i else COLORS[color]
            self.rect(x + i * width, y, width - 4, height, fill, stroke, 4)
            self.text(x + i * width + (width - 4) / 2, y + height * .67,
                      label, 16, color='#ffffff' if active == i else INK, anchor='middle')

    def note(self, y, title, lines):
        self.rect(28, y, 1024, 52 + 25 * len(lines), '#f5f8f6', '#dce5df')
        self.text(46, y + 29, title, 18, weight=600)
        for i, label in enumerate(lines):
            self.text(46, y + 56 + 25 * i, label, 17, color=MUTED)

    def render(self, caption):
        return f'<figure class="diagram vp-figure"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 {self.height}" role="img" aria-label="{escape(self.title)}"><title>{escape(self.title)}</title><desc>{escape(self.subtitle)}</desc><defs><marker id="{self.key}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker></defs><g font-family="Noto Sans CJK SC, Microsoft YaHei, sans-serif">{"".join(self.items)}</g></svg><figcaption>{caption}</figcaption></figure>'


def system():
    f = Figure('vp-system-fig', '一个 Core：四个 DT、四个 VP，分别访问 L2',
               '接口拓扑；位宽按每实例、每方向标注，不代表整个 L2 的承诺带宽。', 885)
    f.badge(28, 118, 175, '4 × DT · 数据重排', 'purple')
    for i in range(4):
        x = 28 + i * 260
        f.box(x, 164, 244, 84, f'DT {i}', ('独立读 / 写数据接口',), 'purple')
        f.arrow([(x + 40, 326), (x + 40, 253)], BLUE)
        f.arrow([(x + 145, 253), (x + 145, 326)], PURPLE)
        f.text(x + 55, 279, '256 bit', 16, color=BLUE)
        f.text(x + 157, 310, '256 bit', 16, color=PURPLE)
    f.rect(28, 332, 1024, 115, '#eaf4fa', '#98bfd3', 10)
    f.text(52, 367, 'L2 片上数据存储', 25, weight=600)
    f.text(52, 400, '通过地址和数据缓冲区交换 tensor；DT 与 VP 之间没有专用直连数据通路。', 19)
    f.text(52, 430, '蓝色：L2 读数据 → 执行器　　 绿色 / 紫色：执行器写数据 → L2', 16, color=MUTED)
    for i in range(4):
        x = 28 + i * 260
        f.arrow([(x + 40, 453), (x + 40, 526)], BLUE, width=4)
        f.arrow([(x + 145, 526), (x + 145, 453)], GREEN, width=4)
        f.text(x + 55, 484, '1024 bit', 16, color=BLUE)
        f.text(x + 157, 515, '1024 bit', 16, color=GREEN)
        f.box(x, 532, 244, 107, f'VP {i}', ('A：32 lane FP32 引擎', 'B：32 lane FP32 引擎'), 'green')
    f.text(28, 681, '一次满载荷能装多少个数？', 22, weight=600)
    f.text(28, 709, '数据位宽 ÷ 元素位数；每周期是否接受一份载荷，还取决于握手与内部路径。', 17, color=MUTED)
    for x, title, values, color in [(28, '每个 DT · 256 bit = 32 B', ['32 × 8 bit', '16 × 16 bit', '8 × 32 bit'], 'purple'),
                                  (550, '每个 VP · 1024 bit = 128 B', ['128 × 8 bit', '64 × 16 bit', '32 × 32 bit'], 'blue')]:
        f.box(x, 733, 502, 105, title, (), color)
        f.cells(x + 16, 785, values, width=155, color=color)
    f.text(28, 866, '只展开 DT / VP 接口；PE、LD/ST 与 L2 内部仲裁省略。容量换算不声明格式支持或算术吞吐。', 16, color=MUTED)
    return f.render('RTL 中四个 DT 实例各有 256-bit 读写数据口，四个 VP 实例各有 1024-bit 读写数据口。读数据与写数据分别画线，没有用 ready 或地址信号充当数据线。8/16/32-bit 数量只是位宽换算，不声明 DT 对每种格式的重排支持，也不声明 VP 每周期计算 128 个 INT8。')


def overview():
    f = Figure('vp-overview-fig', '一个 VP 内部：主数据、辅助操作数、统计与写回',
               '功能连线；颜色区分数值角色，箭头说明产生者和消费者，框宽不表示时延。', 955)
    f.box(28, 120, 1024, 75, 'Command / CTRL：保存本次配置，选择地址与各级计算模式',
          ('RD / PreCal / CAL / PostCal / WR 分别推进；完成条件还要检查写响应。',), 'amber')
    f.box(28, 245, 160, 165, 'RD + PreCal', ('1024-bit 读入', '分流 X / Y / 参数', '转换为 FP32', '保持有效范围'), 'blue', 19)
    f.box(228, 245, 164, 165, 'Mask / CMT', ('屏蔽或比较', '向量主流继续', '比较统计量', '送 scalar 分支'), 'green', 19)
    f.arrow([(188, 315), (222, 315)], BLUE)
    f.arrow([(392, 315), (434, 315)])
    f.rect(440, 219, 390, 335, '#f4f8f5', '#aac5b7')
    f.text(458, 247, 'CAL · 双向量引擎', 22, weight=600)
    for y, name in [(272, 'A · 32 lane'), (414, 'B · 32 lane')]:
        f.box(458, y, 354, 118, name, ('DIP → SUM0 → PRG → MUL', 'FLOOR → SUM1 → SHIFT'), 'green', 19)
    f.arrow([(632, 391), (632, 409)], AMBER)
    f.text(659, 407, 'pipe 时串接', 15, color=AMBER)
    f.box(872, 245, 180, 165, 'SMT', ('跨 lane 求和', '或旁路向量结果', '统计量送 scalar', '向量送尾部选择'), 'green', 19)
    f.arrow([(830, 315), (866, 315)])
    f.box(28, 474, 365, 120, '辅助队列与参数通路', ('Y / PRG.b / FLR.s / DIP.s 共用写入口', '目的标签选 SUM0 / MUL / SUM1', 'PRG.k 另送乘法；配置决定来源'), 'purple', 19)
    f.arrow([(108, 410), (108, 468)], PURPLE)
    f.arrow([(393, 526), (420, 526), (420, 362), (452, 362)], PURPLE)
    f.box(458, 619, 354, 132, 'Scalar · 统计后的计算', ('接收 CMT 或 SMT 统计量', '处理累加结果、系数与结束条件', '专用反馈与 S2P 组包分别配置'), 'amber')
    f.arrow([(308, 410), (308, 435), (406, 435), (406, 680), (452, 680)], AMBER)
    f.arrow([(962, 410), (962, 588), (635, 588), (635, 613)], AMBER)
    f.arrow([(533, 619), (533, 576), (498, 576), (498, 558)], AMBER, dashed=True)
    f.text(28, 652, '实线：传递数值', 18, color=MUTED)
    f.text(28, 682, '虚线：写入专用反馈目的地', 18, color=AMBER)
    f.text(28, 712, '不是任意可寻址的寄存器文件', 17, color=MUTED)
    f.box(872, 619, 180, 156, 'PostCal + WR', ('格式转换 / 组包', '1024-bit 写数据', '接受请求 ≠ 完成', '等待响应排空'), 'blue', 19)
    f.arrow([(812, 680), (830, 680)], AMBER)
    f.items.append('<path d="M844,660L862,680L844,700L826,680Z" fill="#f5f8f6" stroke="#91aaa1"/>')
    f.arrow([(862, 680), (870, 680)])
    f.arrow([(1040, 410), (1040, 570), (844, 570), (844, 654)])
    f.text(826, 725, 'MUX', 14, color=MUTED)
    f.note(791, '沿一个值读图', ['主值 X 穿过算术链；第二操作数必须在对应消费者处就绪。',
                              '统计量经 scalar 形成后续系数；原始 X 是否仍可取得，要由 L2 与编译调度保证。'])
    return f.render('A/B 各有完整算术链；wide 与 pipe 使用不同输入/输出 mux。菱形是尾部出口选择：向量结果与经 S2P 组包的 scalar 结果在这里汇合，再经 ReLU / PostCal 写回。图中交叉线不表示连接；有效性、FIFO 目的标签和反馈范围见各节 RTL 表。')


def formats():
    f = Figure('vp-format-fig', '同一个 X[1,37]：逻辑坐标、读载荷和 lane',
               '连续 X[4,4096]；行号和特征号从 0 开始。示例使用普通 wide 输入路径。', 800)
    f.text(28, 137, '① 完整 tensor：先定位一个数', 21, weight=600)
    f.text(480, 137, '特征轴 c →（每行只展开开头）', 17, color=MUTED)
    for r in range(4):
        y = 162 + r * 43
        f.text(32, y + 24, f'行 r = {r}', 17)
        f.cells(148, y, ['0…15', '16…31', '32…47', '48…63', '64…', '…4095'], 143, color='blue', active=2 if r == 1 else None)
    f.badge(645, 349, 372, '追踪元素：X[1,37]，数值本身不变', 'green')
    f.arrow([(507, 331), (507, 390), (235, 390), (235, 417)], BLUE)
    f.text(253, 376, '取第 1 行的首个载荷', 16, color=BLUE)
    f.text(28, 453, '② BF16：一个 128 B 载荷含 64 个数', 21, weight=600)
    f.rect(28, 475, 1024, 117, '#eaf4fa', '#98bfd3')
    f.text(48, 503, '特征位置', 17, color=MUTED)
    f.cells(215, 482, ['0', '1', '…', '31'], 88, color='blue')
    f.cells(635, 482, ['32', '…', '37', '…63'], 88, color='green', active=2)
    f.text(229, 549, 'A：32 个 FP32 lane', 20, weight=600)
    f.text(648, 549, 'B：32 个 FP32 lane', 20, weight=600)
    f.text(48, 578, 'PreCal 展宽：每个 BF16 从 16 bit 变为 32 bit；低 32 路给 A，高 32 路给 B。', 17)
    f.box(28, 624, 502, 130, 'X[1,37] 的 BF16 地址', ('字节偏移 = (1 × 4096 + 37) × 2', '= 8266 B；组内第 74 字节', '对应引擎 B 的 lane 5'), 'green')
    f.box(550, 624, 502, 130, '同一个元素改为 FP32 输入', ('字节偏移 = (1 × 4096 + 37) × 4', '= 16532 B；本组只有 32 个有效元素', '第 1 组 → A 的 lane 5；B 没有新元素'), 'purple')
    f.text(28, 784, 'BF16→FP32 展宽增加内部表示位数，不是额外的 L2 读取。', 17, color=MUTED)
    return f.render('前四行是逻辑坐标，下面是一个输入载荷在引擎中的分配，不是按字节等比例绘制。BF16 的前后半组可同时提供 A/B 的输入；普通 FP32 输入每组只有 32 个有效数。下一节交互继续追踪各个位置。')


def modes():
    f = Figure('vp-modes-fig', 'wide 增加并行元素；pipe 延长同一元素的运算链',
               '同一对 A/B 引擎；下方吞吐为单主流、有效数据持续供应、无反压时的稳态上界。', 880)
    for x, color in [(28, 'green'), (550, 'blue')]:
        f.rect(x, 120, 502, 510, *COLORS[color])
    f.text(48, 156, 'wide · 两组独立元素', 24, weight=600)
    f.text(570, 156, 'pipe · 同组元素经过 A 再经过 B', 23, weight=600)
    f.cells(52, 187, ['0…15', '16…31', '32…47', '48…63'], 115, color='blue')
    f.text(51, 249, 'BF16 输入示例：64 个新元素', 19)
    for y, engine, values in [(288, 'A', '元素 0…31'), (415, 'B', '元素 32…63')]:
        f.box(52, y, 454, 97, f'{engine} · 32 lane', (f'{values}：DIP → SUM0 → PRG → MUL → …',), 'green')
    f.arrow([(164, 253), (164, 282)], BLUE)
    f.arrow([(392, 253), (515, 253), (515, 463), (510, 463)], BLUE)
    f.text(53, 557, 'A 与 B 的结果拼为一组 64 个数', 20, weight=600)
    f.text(53, 590, '普通 FP32 输入每包只有 32 个新数。', 17, color=MUTED)
    f.cells(574, 187, ['0…7', '8…15', '16…23', '24…31'], 115, color='blue')
    f.text(573, 249, '同一组 32 个新元素', 19)
    f.arrow([(800, 253), (800, 282)], BLUE)
    f.box(574, 288, 454, 97, 'A · 32 lane', ('第一段：A 的完整主链，未使用级旁路',), 'green')
    f.arrow([(800, 385), (800, 410)], AMBER)
    f.text(573, 405, '对应 lane 的中间值', 16, color=AMBER)
    f.box(574, 415, 454, 97, 'B · 32 lane', ('第二段：B 的完整主链，未使用级旁路',), 'green')
    f.text(575, 557, '只取 B 的 32 个最终结果', 20, weight=600)
    f.text(575, 590, '窄化为 BF16 仍只有 32 个结果。', 17, color=MUTED)
    f.box(28, 662, 502, 125, 'wide：输出也会限制吞吐', ('16/8-bit 输入 → 16/8-bit 输出：≤64 元素/拍', 'FP32 输入，或写 FP32：≤32 元素/拍', '64 个 FP32 结果要分两份写载荷'), 'green', 20)
    f.box(550, 662, 502, 125, 'pipe：≤32 元素 / VP cycle', ('受支持格式中，输出元素数仍以 32 为上限', 'BF16：每组 64 B 有效；FP32：每组 128 B', 'P2S 不把两个 BF16 组压紧合成一个满包'), 'blue', 20)
    f.text(28, 827, '还需数输入流：X 与 Y 共用读口时，两完整 tensor 会增加供数成本。', 18, color=MUTED)
    f.text(28, 856, '这些是有条件的稳态上界，不是任意算子的每拍保证，也不是端到端实测。', 18, color=MUTED)
    return f.render('每拍都指 VP 数据域周期。pipe 串接 A/B 以延长同一组 32 元素的运算链；wide 的上界还要同时受输入和输出精度约束。图未假设各计算级延迟相等。参数装载、第二输入、归约、尾块与反压会进一步压低实际吞吐。')


def arithmetic():
    f = Figure('vp-arithmetic-fig', '一条 lane 的主值演进，与辅助值的会合点',
               'A/B 各有 32 条同构 lane；这里放大其中一条。主链顺序固定，各级可按模式旁路。', 740)
    stages = [('DIP', '分解'), ('SUM0', '加 / 减'), ('PRG', '选段'), ('MUL', '乘法'), ('FLOOR', '取整'), ('SUM1', '加 / 减'), ('SHIFT', '指数缩放')]
    f.text(28, 139, '主值 x → 中间值 t₀ → t₁ → … → 最终结果', 19, color=GREEN)
    for i, (name, desc) in enumerate(stages):
        x = 28 + i * 147
        f.box(x, 167, 130, 104, name, (desc,), 'green', 18)
        if i < 6:
            f.arrow([(x + 130, 219), (x + 142, 219)])
    f.text(29, 344, '辅助值在指定消费点与主值会合', 21, weight=600)
    f.box(28, 374, 275, 146, '共享 FIFO 写入口', ('候选：外部 Y / PRG.b', '以及 FLR.s / DIP.s', '按配置选择写入者', '数据携带目的标签'), 'purple', 20)
    for i, label in enumerate(['…', 'Y₁', 'b₀', 'Y₀']):
        f.rect(346 + i * 80, 412, 70, 56, '#f2edf8', '#c5b0da', 5)
        f.text(381 + i * 80, 447, label, 21, anchor='middle')
    f.arrow([(303, 441), (340, 441)], PURPLE)
    f.text(351, 393, '左侧写入 → 右侧队头', 17, color=PURPLE)
    f.box(714, 374, 338, 146, '消费条件', ('目标算术级正需要该值', '主操作数已经到达', '下游允许推进', '条件不齐：等待并保持值'), 'amber', 20)
    f.arrow([(666, 441), (708, 441)], PURPLE)
    for x in [240, 534, 828]:
        f.arrow([(650, 406), (650, 306), (x, 306), (x, 277)], PURPLE)
    f.note(563, '融合前先列“值 → 产生者 → 消费者 → 活到什么时候”',
           ['例如 PRG.b 要在 SUM1 使用；MUL 同时还可能需要 PRG.k 或外部 Y。',
            '共享入口、目的标签和消费顺序不满足时，数学表达式不能随意合成一条 VP。',
            '局部反压是有效性协议的一部分；图中的队列格子不表示 FIFO 物理深度。'])
    return f.render('主链级名来自 RTL；辅助图画出共享 FIFO 与三个典型消费位置，实际来源按模式选择。PRG.k 与专用 scalar 反馈还存在独立路径，不应全部想象为同一 FIFO 的任意读写端口。')


def prg():
    f = Figure('vp-prg-fig', 'PRG 选择的是参数；近似值由后面的乘加形成',
               'fast64 sigmoid 固定表算例：输入 x = 1；坐标图仅放大该分段邻域。', 765)
    f.rect(28, 123, 510, 432, '#f7faf8', '#d4dfdd')
    x0, y0, w, h = 82, 492, 400, 300
    f.arrow([(x0, y0), (505, y0)], MUTED, width=1.4)
    f.arrow([(x0, y0), (x0, 155)], MUTED, width=1.4)
    f.text(503, 524, 'x', 18)
    f.text(47, 159, 'y', 18)
    # Local plot domain: [0.8, 1.4] x [0.68, 0.82].
    px = lambda x: x0 + (x - .8) / .6 * w
    py = lambda y: y0 - (y - .68) / .14 * h
    left, right = .97582436, 1.2474272
    f.rect(px(left), 180, px(right) - px(left), 312, '#e2eee5', radius=0)
    for x, label in [(left, '0.9758'), (right, '1.2474')]:
        f.line(px(x), 180, px(x), y0, '#a1bba9', dashed=True)
        f.text(px(x), 521, label, 16, anchor='middle')
    for y in [.70, .75, .80]:
        f.line(x0, py(y), 485, py(y), '#d9e2df', width=1)
        f.text(74, py(y) + 5, str(y), 15, anchor='end', color=MUTED)
    f.line(px(.84), py(.18615258 * .84 + .54522103), px(1.36), py(.18615258 * 1.36 + .54522103), GREEN, 3)
    f.circle(px(1), py(.73137361), 7, '', 'green')
    f.text(101, 151, '局部直线 y = k[j]·x + b[j]', 18, weight=600)
    f.text(267, 300, 'x = 1', 17, color=GREEN)
    f.arrow([(266, 307), (px(1) + 8, py(.73137361) - 8)], GREEN, width=1.5)
    f.box(578, 123, 474, 150, '① 比较断点 → 选择第 j 段', ('0.97582436 < 1 < 1.2474272', 'k[j] = 0.18615258', 'b[j] = 0.54522103'), 'purple')
    f.box(578, 315, 216, 98, '② MUL', ('k[j] × x',), 'green')
    f.box(836, 315, 216, 98, '③ SUM1', ('+ b[j]',), 'green')
    f.arrow([(792, 365), (830, 365)])
    f.arrow([(686, 273), (686, 309)], PURPLE)
    f.arrow([(945, 273), (945, 309)], PURPLE)
    f.box(578, 455, 474, 100, '近似输出 ≈ 0.73137361', ('解析 sigmoid(1) ≈ 0.73105858',), 'blue')
    f.arrow([(945, 413), (945, 449)])
    f.note(590, '这些系数有存储归属与有效期', ['PRG 表属于具体 VP 的参数状态；装载完成后，依赖该表的计算才可以使用它。',
                                           '断点、特殊值规则、逐级 FP32 舍入与最终 BF16 转换共同决定输出。',
                                           '本图用实数算术解释机制，不宣称逐位复现各级浮点结果。'])
    return f.render('阴影区间是选中的分段，绿色直线是这一段的 kx+b，实心点是 x=1 的近似输出。两轴为输入和输出数值；图仅放大局部区间，不把分段直线画成完整 sigmoid 曲线。')


def reduction():
    f = Figure('vp-reduction-fig', 'lane 内运算、lane 间归约与跨组状态是三件事',
               'RMSNorm 平方和；完整输入 X[4,4096]，只展开某行的一小组值。', 800)
    f.text(28, 141, '① 每个特征平方', 22, weight=600)
    f.cells(270, 117, ['x₀²', 'x₁²', 'x₂²', 'x₃²', 'x₄²', 'x₅²', 'x₆²', 'x₇²'], 94, color='blue')
    for i in range(4):
        x = 315 + i * 188
        f.arrow([(x, 156), (x + 47, 201)], BLUE, width=1.7)
        f.arrow([(x + 94, 156), (x + 47, 201)], BLUE, width=1.7)
        f.circle(x + 47, 225, 22, '+', 'green', 23)
    for i in range(2):
        x = 362 + i * 376
        f.arrow([(x, 249), (x + 94, 296)], GREEN, width=1.7)
        f.arrow([(x + 188, 249), (x + 94, 296)], GREEN, width=1.7)
        f.circle(x + 94, 320, 22, '+', 'green', 23)
    f.arrow([(456, 344), (644, 389)], GREEN, width=1.7)
    f.arrow([(832, 344), (644, 389)], GREEN, width=1.7)
    f.circle(644, 413, 22, '+', 'amber', 23)
    f.text(28, 234, '② SMT 做组内归约', 22, weight=600)
    f.text(28, 268, '八个叶子仅为读图示例', 17, color=MUTED)
    f.text(28, 299, '不是物理 SMT 的 lane 数', 17, color=MUTED)
    f.text(28, 330, '也不是精确的流水周期', 17, color=MUTED)
    f.text(694, 421, '本组部分和 sᵍ', 21, weight=600)
    f.box(28, 477, 320, 125, '③ 跨组：保存本行部分和', ('S[r] ← S[r] + sᵍ', '旧 S[r] 需保持到下一组消费', '行末标志对应完整归约范围'), 'amber', 19)
    f.box(390, 477, 286, 125, '行结束 → 一个 S[r]', ('统计范围是 4096 个特征', '128 元素是观察窗口', '窗口不规定 kernel tile'), 'green', 19)
    f.box(718, 477, 334, 125, '保留行轴：输出 [4,1]', ('S[0]　S[1]　S[2]　S[3]', '四行是四个独立统计量', '不能再相加成一个全局标量'), 'blue', 19)
    f.arrow([(644, 440), (644, 456), (189, 456), (189, 471)], AMBER)
    f.arrow([(348, 539), (384, 539)], AMBER)
    f.arrow([(676, 539), (712, 539)])
    f.note(644, '逐行归约的两个不变量', ['特征覆盖必须不重不漏；形成系数之前，不能把临时部分和当成最终 S[r]。',
                                           '换到下一行时，部分和、结束标志与反馈系数的归属一起切换；结合顺序会影响舍入。'])
    return f.render('树说明组内求和依赖；跨组累加是另一层状态。物理比较/求和树、scalar 运算以及中间部分和落点必须结合模式和编译结果解释，不能从教学二叉树推导硬件级数或总延迟。')


def state():
    f = Figure('vp-state-fig', 'RMSNorm：谁持有数据，谁能覆盖它？',
               '横轴是三个语义阶段，不按时间比例绘制；条带表示值必须仍然可取得。', 740)
    start, col = 246, 266
    for i, (title, detail) in enumerate([('统计整行', 'X → 平方 → 求和'), ('形成行系数', 'S / 4096 + ε → rsqrt'), ('输出整行', '重读 X，乘 a 与 γ')]):
        x = start + i * col
        f.rect(x, 124, col - 8, 78, '#eff4f0', '#d1ddd5')
        f.text(x + 16, 154, title, 21, weight=600)
        f.text(x + 16, 183, detail, 17, color=MUTED)
        f.line(x, 214, x, 570, '#d5dfda', dashed=True)
    rows = [('原始 X[r,:]', 'L2 / 输入缓冲区', 232, 0, 3, 'blue', '消费者尚未结束；不能提前覆盖'),
            ('部分和 S[r]', '按编译布局保存', 328, 0, 2, 'green', '逐组更新 → 完整 S[r]'),
            ('行系数 a[r]', '专用反馈或显式值', 424, 1, 2, 'amber', '行末形成 → 供本行输出复用')]
    for name, owner, y, first, count, color, label in rows:
        f.text(28, y + 28, name, 21, weight=600)
        f.text(28, y + 56, owner, 16, color=MUTED)
        x = start + first * col
        f.rect(x, y, count * col - 14, 66, *COLORS[color])
        f.text(x + 16, y + 39, label, 19)
    f.arrow([(1017, 496), (1017, 545)], AMBER)
    f.text(560, 569, '最后一个消费者完成后，才可复用本行状态', 18, color=AMBER)
    f.note(607, '容易混淆的两条出口', ['专用反馈：结果写入固定消费目的地；S2P：把连续标量收集为向量载荷后输出。',
                                           '二者都不是任意索引的寄存器堆，也不能自动保留被覆盖的原始 X。'])
    return f.render('部分和和行系数的具体落点随编译后的操作、布局与模式变化；图只标出必须保持的语义寿命。多行并行时，不能让下一行的系数覆盖尚未消费完的上一行。')


def output():
    f = Figure('vp-output-fig', '结果数、输出字节数与写载荷数，要分开算',
               '同一组 64 个有效 FP32 结果；对比写 BF16 与写 FP32，均使用 1024-bit 写口。', 785)
    f.text(28, 143, 'CAL 输出：64 个 FP32 数 = 2048 bit', 22, weight=600)
    f.cells(28, 165, ['0…7', '8…15', '16…23', '24…31', '32…39', '40…47', '48…55', '56…63'], 130, color='green')
    f.line(540, 226, 540, 578, '#d4dfda', dashed=True)
    f.text(28, 258, '输出 BF16', 25, weight=600)
    f.text(575, 258, '输出 FP32', 25, weight=600)
    f.box(28, 285, 478, 100, '窄化：每个结果 32 → 16 bit', ('64 个数仍是 64 个数，舍入后共 128 B',), 'blue')
    f.box(575, 285, 477, 100, '保持：每个结果仍为 32 bit', ('64 × 4 B = 256 B，超出一个写载荷',), 'purple')
    f.arrow([(268, 385), (268, 418)], BLUE)
    f.arrow([(812, 385), (812, 418)], PURPLE)
    f.rect(28, 424, 478, 72, '#eaf4fa', '#98bfd3')
    f.text(48, 453, '载荷 0：元素 0…63', 21, weight=600)
    f.text(48, 482, '1024 bit = 128 B', 17)
    for y, title in [(424, '载荷 0：元素 0…31'), (519, '载荷 1：元素 32…63')]:
        f.rect(575, y, 477, 72, '#f2edf8', '#c5b0da')
        f.text(595, y + 29, title, 21, weight=600)
        f.text(595, y + 58, '1024 bit = 128 B', 17)
    f.text(28, 553, '完整载荷等价值：1 份', 22, color=BLUE, weight=600)
    f.note(632, '到“完成”还差两层协议', ['WR 提交写请求不等于对后续操作已可见；还要跟踪未返回响应与结束条件。',
                                          '输出选择、有效字节、部分载荷、地址推进和反压，共同决定实际节拍。'])
    return f.render('P2S 把更宽的内部结果适配到 1024-bit 写口；计算与端口可能给出不同稳态上界。载荷编号表示拆分顺序，不声称第 n 份一定在第 n 个周期被接受。BF16 窄化是真实数值舍入，消除中间存储时需重新考虑数值等价性。')


def commands():
    f = Figure('vp-command-fig', '一次操作有四条推进流，不是一个串行“执行框”',
               '横轴为依赖顺序，不是 RTL 周期；同一列表示职责相关，不保证同拍发生。', 790)
    cols = [(258, '配置'), (446, '供数'), (634, '运算'), (822, '提交 / 收尾')]
    for x, title in cols:
        f.text(x + 80, 141, title, 20, weight=600, anchor='middle')
        f.line(x, 156, x, 550, '#d5dfda', dashed=True)
    lanes = [('读地址 RD', 177, 'blue', ['范围 / 步长', '读请求', '后续地址', '最后输入']),
             ('PreCal 输入', 273, 'blue', ['格式 / 用途', 'X / Y 配对', '有效组推进', '输入尾组']),
             ('CAL / PostCal', 369, 'green', ['级选择 / 参数', '等待操作数', '数值 / 状态', '最后结果']),
             ('写地址 WR', 465, 'purple', ['输出范围', '等待结果', '写请求接受', '响应排空'])]
    for name, y, color, labels in lanes:
        f.text(28, y + 37, name, 20, weight=600)
        for i, label in enumerate(labels):
            x = cols[i][0]
            f.rect(x, y, 170, 68, *COLORS[color])
            f.text(x + 85, y + 42, label, 18, anchor='middle')
            if i < 3:
                f.arrow([(x + 170, y + 34), (x + 183, y + 34)], color={'blue': BLUE, 'green': GREEN, 'purple': PURPLE}[color], width=1.8)
    f.arrow([(527, 245), (527, 267)], BLUE)
    f.arrow([(715, 341), (715, 363)])
    f.arrow([(903, 437), (903, 459)], PURPLE)
    f.note(580, '发生反压时，保持的是哪一层状态？', ['Y 未到：不能把未配对的 X 当作二元结果；写端阻塞：已经形成的结果必须保持。',
                                         '最后输入消费、最后写请求接受、写响应全部返回，是三个不同观察点。',
                                         '普通 tensor 完成判定要覆盖它们；参数装载等命令有各自的结束路径。'])
    return f.render('地址生成器、PreCal、计算链和写回可重叠，也会通过有效性与反压关系互相限制。图用于定位等待发生在哪一层，不把示意格子换算为真实延迟或每周期进度。')


def swiglu():
    f = Figure('vp-swiglu-fig', 'SwiGLU：保留 gate，经过近似，再与两个值会合',
               'gate、up、out 均为 [4,4096]；激活段使用 FP32 中间值，最终写 BF16。', 820)
    f.text(28, 143, 'L2 输入', 19, color=BLUE, weight=600)
    f.box(28, 165, 225, 105, 'gate G[r,c]', ('BF16 → FP32', '同一个 G 有两个消费者'), 'blue')
    f.box(28, 341, 225, 90, 'up U[r,c]', ('逐元素第二输入',), 'blue')
    f.box(308, 165, 315, 105, 'CMT → PRG → MUL → SUM1', ('clamp 后选 k、b', 's = k(G) × G + b(G)'), 'purple', 17)
    f.box(678, 165, 374, 105, 'sigmoid_fast64(G)', ('得到所选近似配方的结果 s', '不是解析 sigmoid 的逐位实现'), 'purple', 19)
    f.arrow([(253, 216), (302, 216)], BLUE)
    f.arrow([(623, 216), (672, 216)], PURPLE)
    f.box(678, 341, 374, 105, 'MUL：形成 SiLU', ('t = G × s', '同时需要原始 G 与近似结果 s'), 'green')
    f.arrow([(863, 270), (863, 335)], PURPLE)
    f.arrow([(138, 270), (138, 301), (722, 301), (722, 335)], BLUE)
    f.text(290, 325, 'G 的保活 / 重读 / 旁路由编译安排', 17, color=BLUE)
    f.box(678, 517, 374, 105, 'MUL → PostCal → WR', ('out = t × U，最后窄化 BF16', '是否消除中间存储由实际融合决定'), 'green', 19)
    f.arrow([(863, 446), (863, 511)])
    f.arrow([(253, 386), (300, 386), (300, 570), (672, 570)], BLUE)
    f.text(319, 551, 'U 必须在这次乘法消费点就绪', 17, color=BLUE)
    f.box(28, 480, 225, 150, '不能只数三个公式', ('PRG.b 与外部 Y', '可能竞争辅助入口', 'G 的第二个消费者', '决定了它的存活范围'), 'amber', 18)
    f.note(665, '算法图 → VP 需要补上的信息', ['每个值从哪里来、在哪个模块消费、辅助端口是否冲突、哪些中间量仍要写 L2。',
                                           '图中的 MUL 是语义消费点，不声称全部放在同一条 VP 指令中。'])
    return f.render('两条 gate 箭头表示原始 gate 的两次使用；up 只在最终乘法处消费。PRG 参数装载、主链顺序、辅助 FIFO 归属与舍入合同共同约束融合，不能仅凭 G·sigmoid(G)·U 合成一条指令。')


def rms():
    f = Figure('vp-rms-fig', 'RMSNorm：从一行向量到标量，再回到一行向量',
               '输入 X[4,4096]，γ[4096]；展开第 r 行，完整统计量 S[r] 到来后才形成 a[r]。', 840)
    f.text(28, 140, '第一遍 · 沿特征轴统计', 22, weight=600)
    specs = [(28, 205, 'PreCal', ['X[r,c] → FP32', '读完整行'], 'blue'),
             (278, 205, 'MUL', ['x × x', '每个元素平方'], 'green'),
             (528, 205, 'SMT / 累加', ['组内与跨组统计', '行末得到 S[r]'], 'green'),
             (778, 274, 'Scalar 语义链', ['S[r] / 4096 + ε', 'rsqrt → a[r]', '一行一个系数'], 'amber')]
    for x, w, title, lines, color in specs:
        f.box(x, 171, w, 129, title, lines, color, 20)
    for a, b in [(233, 278), (483, 528), (733, 778)]:
        f.arrow([(a, 235), (b - 6, 235)])
    f.box(28, 347, 705, 87, 'L2：原始 X 的寿命跨过统计阶段', ('系数不能恢复所有 x；第二遍仍然需要原始输入。',), 'blue')
    f.arrow([(130, 300), (130, 341)], BLUE, dashed=True)
    f.arrow([(916, 300), (916, 463), (472, 463), (472, 511)], AMBER)
    f.text(750, 409, '先等整行结束', 18, color=AMBER)
    f.text(750, 440, '再按行广播 / 复用', 18, color=AMBER)
    f.text(28, 487, '第二遍 · 逐元素输出', 22, weight=600)
    f.box(28, 517, 265, 115, 'PreCal 重读 X', ('同一个 X[r,c]', '不是第一次读过的临时槽位'), 'blue')
    f.box(340, 517, 265, 115, 'MUL：x × a[r]', ('a[r] 只沿本行共享', '不能提前使用部分统计量'), 'green')
    f.box(652, 517, 400, 115, 'MUL：再乘 γ[c] → PostCal', ('γ 按特征变化，与 a[r] 的广播轴不同', 'Y[r,c] = X[r,c] × a[r] × γ[c]'), 'green', 19)
    f.arrow([(293, 572), (334, 572)], BLUE)
    f.arrow([(605, 572), (646, 572)])
    f.arrow([(265, 434), (265, 511)], BLUE)
    f.note(675, '两个轴、三种值，不能混成一个“系数”', ['X 是 [4,4096] 原输入，a 是 [4,1] 行系数，γ 是 [4096] 逐特征权重。',
                                           '图给出模块职责与语义依赖；VP 条数、部分和落点与 rsqrt 配方由编译结果决定。'])
    return f.render('公共 RMSNorm kernel 的统计与输出循环对应两遍逻辑访问。完整 tensor 不是 launcher tile；多行、多块统计需保留归约轴和完成边界。Scalar / SQR 表达模块职责，不表示单条指令或单周期；实际入口、布局与迭代策略由 lowering 证明并配置。S2P 组包和反馈广播分别解释。')


def multivp():
    f = Figure('vp-multivp-fig', '多 VP 并行：分的是独立工作，状态也必须有归属',
               '四行分给四个 VP 的教学放置；具体 executor ID 和布局仍须查编译结果。', 750)
    f.box(28, 125, 1024, 86, '共享 L2：输入区间、输出区间与相互可见的完成条件',
          ('分到四个 VP，不会自动生成四份独立的 L2 带宽。',), 'blue')
    for i in range(4):
        x = 28 + i * 260
        f.arrow([(x + 78, 217), (x + 78, 258)], BLUE)
        f.arrow([(x + 169, 258), (x + 169, 217)])
        f.box(x, 264, 244, 245, f'VP {i} · 第 {i} 行', (), 'green')
        f.text(x + 16, 326, f'X[{i},:] → Y[{i},:]', 18)
        f.rect(x + 16, 350, 212, 40, '#f2edf8', '#c5b0da', 4)
        f.text(x + 27, 377, '本 VP 的 PRG 参数', 17)
        f.rect(x + 16, 403, 212, 40, '#fcf2de', '#dac18f', 4)
        f.text(x + 27, 430, '本行部分和 / Mask', 17)
        f.text(x + 16, 478, '完成后才复用状态', 18, weight=600)
    f.text(28, 554, '适合按独立行分工', 23, weight=600)
    f.text(545, 554, '同一行内有依赖时', 23, weight=600)
    f.text(28, 589, '各行 RMSNorm 的统计量互不混合。', 19)
    f.text(28, 621, '各行 TopK 有各自的候选值和 Mask。', 19)
    f.text(545, 589, 'TopK 第 k+1 轮依赖第 k 轮选中位置。', 19)
    f.text(545, 621, '不能只把不同名次交给不同 VP。', 19)
    f.note(656, '吞吐分析要同时看三项', ['独立工作是否足够；各 VP 参数与状态是否就绪；L2、同步与输出是否成为瓶颈。'])
    return f.render('每个 VP 有自己的计算与参数状态，不能把一个 VP 的 PRG 表或 Mask 自动视为其他 VP 上也存在。四 VP 的理论上界可相加作为资源账，但不能据此承诺端到端四倍加速。')


def topk():
    f = Figure('vp-topk-fig', 'TopK：本轮输出一个位置，再改变下一轮候选集合',
               '用 8 个有限且互异的分数演示 K=3；不是实际 tile、比较树宽度或 tie-break 定义。', 800)
    scores = ['0.2', '0.8', '-0.4', '1.3', '0.9', '0.5', '1.1', '-0.2']
    f.text(28, 138, '原索引', 18, color=MUTED)
    f.cells(160, 115, [str(i) for i in range(8)], 111, color='plain')
    f.text(28, 184, '原分数', 18, color=BLUE)
    f.cells(160, 161, scores, 111, color='blue')
    for r, (index, value, mask) in enumerate([(3, '1.3', []), (6, '1.1', [3]), (4, '0.9', [3, 6])]):
        y = 253 + r * 128
        f.circle(57, y + 29, 25, str(r + 1), 'amber', 22)
        f.text(100, y + 7, 'Mask 后的候选', 17, color=MUTED)
        for i, value_in in enumerate(scores):
            x = 100 + i * 62
            fill = '#e8ece9' if i in mask else (GREEN if i == index else '#eaf4fa')
            f.rect(x, y + 20, 56, 42, fill, '#c7d7d4', 4)
            f.text(x + 28, y + 47, '×' if i in mask else value_in, 16,
                   color='#ffffff' if i == index else INK, anchor='middle')
        f.arrow([(600, y + 42), (637, y + 42)])
        f.box(643, y - 2, 195, 84, 'CMT / TKV', ('比较后记录位置',), 'green', 18)
        f.arrow([(838, y + 42), (873, y + 42)], AMBER)
        f.box(879, y - 2, 173, 84, f'({value}, {index})', ('值与原索引配对',), 'amber', 19)
        if r < 2:
            f.arrow([(965, y + 82), (965, y + 99), (88, y + 99), (88, y + 130)], AMBER, dashed=True)
            f.text(355, y + 119, f'记录位置 {index}，下一轮屏蔽它', 16, color=AMBER)
    f.note(660, '最后 TKVO 输出，再按 MSKRC 清理 / 更新状态', ['当前实现固定包内有 16 个值和 16 个索引，只有前 K 项有效；不是每轮向 L2 写一条结果。',
                                           '原索引必须跟随选中值；NaN、无效元素和平局规则以实际 lowering 与 Mask 配置为准。'])
    return f.render('实线为本轮候选到选中结果的语义路径，虚线为本轮选择对下一轮 Mask 的影响。右侧配对是每轮逻辑选择，不代表每轮立即写回；最终打包输出由 TKVO 完成。')


FIGURES = {name: fn() for name, fn in {
    'system': system, 'overview': overview, 'formats': formats, 'modes': modes,
    'arithmetic': arithmetic, 'prg': prg, 'reduction': reduction, 'state': state,
    'output': output, 'commands': commands, 'swiglu': swiglu, 'rms': rms,
    'multivp': multivp, 'topk': topk,
}.items()}
