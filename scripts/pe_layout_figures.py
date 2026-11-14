"""Generate standalone SVG figures for the normal-KC FP8 PE walkthrough.

``get_figures()`` returns complete ``figure.diagram`` HTML fragments.  The
module has no build-time side effects and uses only the Python standard library.
"""

from html import escape
import re
import xml.etree.ElementTree as ET


INK = "#193c48"
MUTED = "#607680"
TEAL = "#147d82"
MINT = "#d9ece6"
PALE = "#f0f6f3"
ORANGE = "#bf6b2e"
SAND = "#fcebd9"
BLUE = "#e3edf5"
PURPLE = "#ebe5f3"
LINE = "#cedbd8"
FONT = "'Noto Sans CJK SC','Microsoft YaHei',sans-serif"
MONO = "ui-monospace,'DejaVu Sans Mono',monospace"


def _text(x, y, value, size=20, *, color=INK, weight=400, anchor="start", mono=False):
    font = MONO if mono else FONT
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" '
            f'style="font-family:{font};font-size:{size}px;font-weight:{weight};'
            f'fill:{color}">{escape(str(value))}</text>')


def _rect(x, y, width, height, fill="white", stroke=LINE, radius=8, sw=1.2):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="{height}" '
            f'rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def _line(x1, y1, x2, y2, color=LINE, width=1.5, dash=None):
    extra = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="{width}"{extra}/>')


def _arrow(path, marker, color=TEAL, width=2.5):
    return (f'<path d="{path}" fill="none" stroke="{color}" '
            f'stroke-width="{width}" marker-end="url(#{marker})"/>')


def _bracket(x1, x2, y, label, color=TEAL, size=19):
    return (f'<path d="M{x1} {y-8}V{y}H{x2}V{y-8}" fill="none" '
            f'stroke="{color}" stroke-width="2"/>'
            + _text((x1+x2)/2, y+30, label, size, color=color, anchor="middle"))


def _header(number, title, subtitle):
    return (_text(34, 40, number, 15, color=TEAL, weight=700)
            + _text(34, 78, title, 28, weight=700)
            + _text(34, 112, subtitle, 18, color=MUTED))


def _figure(key, height, title, body, caption):
    marker = f"pe-layout-{key}-arrow"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 {height}" '
           f'role="img" aria-label="{escape(title, quote=True)}" '
           'style="display:block;width:100%;height:auto;background:#fff">'
           f'<title>{escape(title)}</title><defs><marker id="{marker}" '
           'viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" '
           'markerHeight="7" orient="auto-start-reverse">'
           f'<path d="M0 0L10 5L0 10Z" fill="{TEAL}"/></marker></defs>'
           + body + '</svg>')
    return (f'<figure class="diagram pe-layout-figure" data-pe-layout-figure="{key}">'
            + svg + f'<figcaption>{caption}</figcaption></figure>')


def overview():
    """Introduce the row-wise dot product using descriptive tensor names."""
    key = "overview"
    arrow = f"pe-layout-{key}-arrow"
    p = [_header("01 / 要完成的计算", "一行输入，与一行权重，沿同一个 CI 轴做点积",
                 "固定教学主例：4 行输入，4096 个输入特征，512 个输出特征；FP8 输入与权重。")]
    # These are semantic sketches, not proportional matrix dimensions.
    for x, title, shape, subtitle, fill in [
        (34, "输入 Act", "[4, 4096]", "每行是一份输入的 4096 个特征", BLUE),
        (372, "权重 Weight", "[512, 4096]", "每行生成一个输出特征", MINT),
        (710, "输出 Out", "[4, 512]", "保留 4 行，特征数变为 512", PURPLE),
    ]:
        p += [_text(x, 166, title, 23, weight=700), _text(x, 198, shape, 24, mono=True),
              _rect(x, 222, 256, 126, fill), _text(x, 382, subtitle, 17, color=MUTED)]
    for row in range(1, 4):
        p += [_line(34, 222+row*31.5, 290, 222+row*31.5),
              _line(710, 222+row*31.5, 966, 222+row*31.5)]
    p += [_rect(35, 285, 254, 30, "#c3ddeb", "#6a94ac", 0),
          _text(46, 307, "输入行 m = 2", 17, weight=600)]
    for row in range(1, 8):
        p.append(_line(372, 222+row*15.75, 628, 222+row*15.75))
    p += [_rect(373, 270, 254, 23, SAND, ORANGE, 0, 1.5),
          _text(384, 288, "权重行 CO = 165", 16, weight=600),
          _line(794, 222, 794, 348, "#b8a8cb"),
          _line(878, 222, 878, 348, "#b8a8cb"),
          _rect(795, 285, 82, 30, "#c9b9dd", "#8d74a8", 0),
          _text(836, 306, "一个数", 16, anchor="middle", weight=700),
          _text(315, 290, "与", 23, anchor="middle", color=MUTED),
          _arrow("M648 282H692", arrow),
          _text(661, 257, "点积", 17, anchor="middle", color=TEAL)]
    p += [_line(34, 418, 966, 418),
          _text(34, 462, "把这两行拉直：第 ci 个输入，只与第 ci 个权重相乘", 22, weight=700)]
    xs = [246, 410, 574, 738]
    labels = ["CI 0", "CI 1", "CI 1097", "CI 4095"]
    p += [_text(34, 522, "Act[2, ci]", 19, mono=True),
          _text(34, 618, "Weight[165, ci]", 18, mono=True)]
    for i, (x, label) in enumerate(zip(xs, labels)):
        p += [_rect(x, 492, 126, 44, BLUE), _text(x+63, 521, label, 18, anchor="middle"),
              _text(x+63, 570, "×", 23, anchor="middle", color=TEAL),
              _rect(x, 588, 126, 44, SAND if i == 2 else MINT),
              _text(x+63, 617, label, 18, anchor="middle")]
        if i in (1, 2):
            p += [_text(x+145, 521, "…", 21, anchor="middle", color=MUTED),
                  _text(x+145, 617, "…", 21, anchor="middle", color=MUTED)]
    p += [_bracket(246, 864, 650, "4096 对乘积相加 → Out[2, 165]", size=22),
          _rect(34, 710, 932, 82, PALE, "none"),
          _text(54, 744, "换一行 Weight，就得到另一个输出特征；换一行 Act，就处理下一份输入。", 19),
          _text(54, 774, "Weight 的两个轴始终是 [CO, CI]。这里只解释计算关系，矩阵宽高不按比例。", 17, color=MUTED)]
    return _figure(key, 818, "Act 与 Weight 沿 CI 点积得到 Out", "".join(p),
                   "同一个 CI 索引连接输入与权重。Act[4,4096] 与 Weight[512,4096] 生成 Out[4,512]；"
                   "Out 使用 FP32。图中仅展开一个输出数，省略的乘积仍全部参与归约。")


def full_pack():
    """Show all 128 miniblocks and their contiguous packed memory order."""
    key = "full_pack"
    p = [_header("02 / 整张权重怎样分块", "Weight[512, 4096] → 4 × 32 个 miniblock",
                 "每格包含 128 个 CO × 128 个 CI；FP8 每个权重 1 B，所以一格是 16 KiB。")]
    x0, y0, cell, rh = 212, 208, 18, 55
    p += [_text(x0, 164, "CI → 4096 个输入通道，切成 32 个块", 21, weight=600),
          _text(34, 192, "CO ↓", 19, weight=600), _text(814, 192, "该行块带的首地址", 17, color=MUTED)]
    for t in [0, 1, 8, 16, 24, 31]:
        p.append(_text(x0+t*cell+9, 193, str(t), 16, anchor="middle", color=ORANGE if t == 8 else MUTED))
    for q in range(4):
        y = y0+q*rh
        p += [_text(34, y+24, f"CO块 {q}", 19, weight=600),
              _text(34, y+47, f"CO {q*128}…{q*128+127}", 17, color=MUTED),
              _text(814, y+34, f"+ {q*512} KiB", 19, mono=True)]
        for t in range(32):
            chosen = q == 1 and t == 8
            p.append(_rect(x0+t*cell, y, cell, rh, ORANGE if chosen else (MINT if q < 2 else BLUE),
                           "white", 0, 1.5))
    p += [_bracket(x0, x0+32*cell, 446, "32 格 × 16 KiB = 一条 512 KiB 的 CO 块带", size=19),
          _rect(34, 503, 932, 65, PALE, "none"),
          _rect(54, 525, 21, 21, ORANGE, "none", 2),
          _text(91, 545, "橙色是块 40：CO 128…255，CI 1024…1151。其余 127 块也全部画出。", 19)]
    p += [_text(34, 622, "打包后的连续内存：先排完一条 CI，再接下一条 CO 块带", 22, weight=700),
          _text(34, 651, "以下地址都是相对 base 的字节偏移；每条块带内部，块号从左到右递增。", 17, color=MUTED)]
    bx, by, bw = 34, 687, 233
    colors = [MINT, SAND, BLUE, PURPLE]
    for q in range(4):
        x = bx+q*bw
        p += [_rect(x, by, bw, 78, colors[q], "white", 0, 2),
              _text(x+18, by+31, f"CO块 {q}", 19, weight=600),
              _text(x+18, by+59, f"#{q*32} … #{q*32+31}", 18, mono=True),
              _text(x, by+106, f"{q*512} KiB", 16, color=MUTED)]
    p += [_text(966, by+106, "2048 KiB", 16, anchor="end", color=MUTED),
          _text(34, 838, "相邻 CI 块：+16 KiB", 20, color=TEAL, weight=600),
          _text(470, 838, "上下相邻 CO 块：+512 KiB", 20, color=ORANGE, weight=600)]
    return _figure(key, 870, "完整权重的 4×32 分块与连续存储顺序", "".join(p),
                   "这是存储布局，不是读取顺序。全 Weight 共 128 个 miniblock、2 MiB。"
                   "CO 块带指矩阵中的 128 行输出通道，不是 MC 的 DRAM row；格子按结构示意比例绘制。")


def miniblock():
    """Expand a 16-KiB miniblock without introducing hardware ownership."""
    key = "miniblock"
    p = [_header("03 / 一格里面怎样排列", "一个 miniblock：128 个 CO 行，每行 128 个 CI 字节",
                 "这里的 CO、CI 都是块内坐标 0…127；每个 FP8 权重占 1 B。")]
    x, y, width, rh = 248, 180, 560, 34
    p += [_text(x, 157, "CI → 每行连续 128 B", 20, weight=600),
          _text(34, 157, "CO ↓ 每 16 行为一段", 19, weight=600),
          _text(831, 157, "段首偏移", 17, color=MUTED)]
    for part in range(8):
        yy = y+part*rh
        p += [_text(34, yy+23, f"{part*16:3d}…{part*16+15:3d} 行", 18, mono=True),
              _rect(x, yy, width, rh, MINT if part % 2 == 0 else PALE, "white", 0, 1.5),
              _text(x+width/2, yy+23, "16 行 × 128 B = 2 KiB" if part in (0, 7) else "", 18, anchor="middle"),
              _text(831, yy+23, f"0x{part*2048:04X}", 18, mono=True)]
    p += [_text(248, 482, "8 段首尾连续 → 16 KiB；分段不改变行内 CI 的顺序。", 19, color=TEAL),
          _line(34, 512, 966, 512),
          _text(34, 554, "把其中三行展开：每一行都由 8 个连续的 16 B 段组成", 21, weight=700)]
    start, seg = 248, 70
    for i in range(8):
        p.append(_text(start+i*seg+seg/2, 591, f"{i*16}…{i*16+15}", 15, anchor="middle", color=MUTED))
    for row, yy in [(0, 611), (1, 663), (127, 747)]:
        p += [_text(34, yy+28, f"CO 行 {row}", 18, weight=600),
              _text(831, yy+28, f"0x{row*128:04X}", 18, mono=True)]
        for i in range(8):
            p.append(_rect(start+i*seg, yy, seg, 40, SAND if i == 4 else MINT, "white", 0, 1.5))
    p += [_text(528, 731, "⋮ 中间 125 行仍按相同方式连续排列 ⋮", 17, anchor="middle", color=MUTED),
          _text(831, 591, "行首偏移", 17, color=MUTED),
          _text(34, 836, "再放大橙色 16 B 段：CI 64…79，每格就是一个权重字节", 21, weight=700)]
    for j in range(16):
        xx = 248+j*35
        p += [_rect(xx, 863, 35, 45, ORANGE if j == 9 else SAND, "white", 0, 1.5),
              _text(xx+17.5, 892, 64+j, 16, anchor="middle", color="white" if j == 9 else INK,
                    weight=700 if j == 9 else 400)]
    p += [_text(34, 943, "块内偏移 = 块内 CO × 128 + 块内 CI", 22, color=TEAL, weight=600),
          _text(34, 976, "同一行内 CI 每加 1，地址就加 1 B；下一个 CO 行从当前行首 +128 B 开始。", 18, color=MUTED)]
    return _figure(key, 1008, "miniblock 内部按 CO 行和 CI 字节连续排列", "".join(p),
                   "上部每条横带压缩表示 16 个 CO 行，未逐行画出；中部单列第 0、1、127 行。"
                   "块内仍是行优先连续排列，没有再次转置。2 KiB 与 16 B 是同一份 16 KiB 数据的不同分组。")


def byte_address():
    """Follow Weight[165,1097] through the complete packed address hierarchy."""
    key = "byte_address"
    arrow = f"pe-layout-{key}-arrow"
    p = [_header("04 / 追踪一个真实坐标", "Weight[165, 1097] 被放到了哪里？",
                 "固定 Weight[512,4096]、FP8、normal KC pack；下列地址以 base = 0 为参考。")]
    p += [_text(34, 165, "先找属于哪个块", 23, weight=700),
          _text(34, 211, "CO 165 = 1 × 128 + 37", 25, mono=True),
          _text(539, 211, "CI 1097 = 8 × 128 + 73", 24, mono=True),
          _text(34, 247, "CO 块 1；块内 CO 行 37", 20, color=TEAL),
          _text(539, 247, "CI 块 8；块内 CI 字节 73", 20, color=TEAL),
          _line(34, 282, 966, 282),
          _text(34, 324, "再把块内坐标拆成 2 KiB 段、128 B 行、16 B 段与字节", 22, weight=700),
          _text(34, 370, "37 = 2 × 16 + 5", 25, mono=True),
          _text(539, 370, "73 = 4 × 16 + 9", 25, mono=True),
          _text(34, 407, "CO 段 2 / 段内行 5（从 0 编号）", 19, color=MUTED),
          _text(539, 407, "CI 段 4 / 段内字节 9（从 0 编号）", 19, color=MUTED),
          _text(34, 464, "完整 packing 层级 · 从外到内", 22, weight=700)]
    labels = ["CO 块", "CI 块", "16行 CO 段", "段内 CO 行", "16 B CI 段", "段内字节"]
    counts = [4, 32, 8, 16, 8, 16]
    chosen = [1, 8, 2, 5, 4, 9]
    for i in range(6):
        xx = 34+i*155
        fill = BLUE if i < 2 else MINT if i < 4 else SAND
        p += [_rect(xx, 489, 149, 132, fill, "white", 5),
              _text(xx+74.5, 522, labels[i], 17, anchor="middle", weight=600),
              _text(xx+74.5, 564, chosen[i], 31, anchor="middle", weight=700, color=ORANGE),
              _text(xx+74.5, 601, f"共 {counts[i]} 个", 16, anchor="middle", color=MUTED)]
    p += [_text(34, 666, "块号 40 = 1 × 32 + 8", 23, mono=True),
          _arrow("M390 657H446", arrow),
          _text(472, 666, "块首 = 40 × 16 KiB = 0xA0000", 23, mono=True),
          _text(34, 716, "块内 = 2 × 2048 + 5 × 128 + 4 × 16 + 9", 22, mono=True),
          _text(34, 752, "     = 37 × 128 + 73 = 0x12C9", 22, mono=True),
          _rect(34, 790, 932, 76, PALE, "none"),
          _text(54, 837, "总偏移 = 0xA0000 + 0x12C9 = 0xA12C9", 27, mono=True, weight=700, color=TEAL),
          _text(34, 910, "检验跨块边界：Weight[0,127] → Weight[0,128]", 21, weight=600),
          _text(34, 945, "原始行优先布局：127 → 128；packed 布局：127 → 16384（进入下一块）。", 18, color=MUTED)]
    return _figure(key, 978, "一个权重字节的完整 packing 坐标与地址推导", "".join(p),
                   "六层结构为 [4,32,8,16,8,16]，乘积仍是 2 MiB。坐标和地址均从 0 开始。"
                   "pack 改变跨 miniblock 的存储次序，块内的 128 个 CI 字节保持连续；实际字节地址再加 base。")


def hardware_route():
    """Map the same byte to a fixed MC word and its physical compute lane."""
    key = "hardware_route"
    arrow = f"pe-layout-{key}-arrow"
    p = [_header("05 / 同一个字节进入硬件", "从 MC6 的第 9 字节，到 group2 / PE4 / ALU5 / lane9",
                 "继续追踪 Weight[165,1097]：块 40，块内 CO=37、CI=73，总偏移 0xA12C9。")]
    p += [_text(34, 166, "读取归属：group2 的 hub1 下，固定看 MC6", 22, weight=700)]
    boxes = [(34, 212, "MC6", "word 80 · round 0", SAND),
             (276, 188, "hub1", "汇合该轮返回", PALE),
             (494, 208, "WL1 / group2", "分发到对应 PE", PALE),
             (732, 234, "PE4", "ALU5 · lane9", MINT)]
    for xx, ww, name, detail, fill in boxes:
        p += [_rect(xx, 194, ww, 91, fill), _text(xx+18, 232, name, 25, weight=700),
              _text(xx+18, 263, detail, 17, color=MUTED)]
    for x1, x2 in [(246, 276), (464, 494), (702, 732)]:
        p.append(_arrow(f"M{x1+4} 239H{x2-7}", arrow))
    p += [_text(34, 323, "箭头表示所选字节的返回方向；数据来自同一个 32 B 的 MC 返回 word。", 18, color=MUTED),
          _line(34, 354, 966, 354),
          _text(34, 397, "把 MC6 的这笔 32 B 返回展开", 23, weight=700),
          _text(34, 431, "round 0 对应 ALU5：前 16 B 给 PE4，后 16 B 给 PE5。", 19, color=MUTED)]
    x0, cell = 84, 26
    for j in range(32):
        p += [_rect(x0+j*cell, 476, cell, 58, ORANGE if j == 9 else MINT if j < 16 else BLUE,
                    "white", 0, 1.3)]
        if j in (0, 9, 15, 16, 31):
            p.append(_text(x0+(j+.5)*cell, 513, j, 17, anchor="middle", color="white" if j == 9 else INK,
                           weight=700 if j == 9 else 400))
    p += [_bracket(x0, x0+16*cell, 550, "PE4：块内 CI 64…79", size=19),
          _bracket(x0+16*cell, x0+32*cell, 550, "PE5：块内 CI 80…95", size=19),
          _text(34, 618, "所选字节在前半段：byte 9 = lane 9 → CI 64 + 9 = 73", 21, color=TEAL, weight=600),
          _line(34, 651, 966, 651),
          _text(34, 693, "计算归属：CO 决定 group 与 ALU，CI 决定 PE 与 lane", 22, weight=700)]
    for i, (label, equation, result) in enumerate([
        ("块内 CO 37", "37 = 2 × 16 + 5", "group2 / ALU5"),
        ("块内 CI 73", "73 = 4 × 16 + 9", "PE4 / lane9"),
    ]):
        yy = 723+i*65
        p += [_text(34, yy+25, label, 20, weight=600),
              _text(254, yy+25, equation, 22, mono=True),
              _arrow(f"M563 {yy+17}H616", arrow),
              _text(644, yy+25, result, 23, mono=True, color=TEAL, weight=700)]
    p += [_rect(34, 876, 932, 119, PALE, "none"),
          _text(54, 911, "固定 MC 地址：word = 2 × 块号 + round = 2 × 40 + 0 = 80", 21, mono=True),
          _text(54, 950, "row = 80 // 128 = 0", 21, mono=True),
          _text(530, 950, "column = 80 % 128 = 80", 21, mono=True),
          _text(54, 980, "每个 word 是 32 B；这里的 MC word 地址不是整核 packed 字节地址。", 17, color=MUTED),
          _text(34, 1039, "lane9 是 MAC4 的高字节。round 1 对应 ALU13；完整 miniblock 返回仍需两轮。", 18, color=MUTED)]
    return _figure(key, 1074, "单个权重字节的 MC 返回位置与物理计算归属", "".join(p),
                   "限定 normal KC、FP8、base=0、splicing=1、bank-map=0xe4 的低地址范围。"
                   "hub1、MC6 都是在 group2 内编号。块内 CI 73 加上本块的 CI 起点 1024，仍是全局 CI 1097。"
                   "图表示字节归属与数据路径，不表示独立计算拍或真实返回时序。")


def get_figures():
    """Return five ordered HTML figure fragments for chapter composition."""
    return {"overview": overview(), "full_pack": full_pack(), "miniblock": miniblock(),
            "byte_address": byte_address(), "hardware_route": hardware_route()}


def get_figure(key):
    """Return one fragment by its stable semantic key."""
    return get_figures()[key]


def revise_minitile_figure(html):
    """Transpose only the legacy minitile figure's weight sketch.

    The original top row depicts A[3,8] times B[8,6].  The revised sketch
    depicts Act[3,8] and Weight[6,8] with row-wise dot products.  Preserve
    the remaining original figure, its IDs, and the surrounding HTML.
    """
    match = next((m for m in re.finditer(r"<svg\b.*?</svg>", html, re.S)
                  if 'id="mt-axes-diagram-title"' in m.group()), None)
    if match is None or 'data-pe-layout-revised="weight-axes"' in match.group():
        return html
    svg = match.group()
    changed = 0

    def transpose_cell(cell_match):
        nonlocal changed
        raw = cell_match.group()
        attrs = ET.fromstring(raw).attrib
        try:
            x, y, width, height = (float(attrs.get(k, "nan"))
                                   for k in ("x", "y", "width", "height"))
        except ValueError:
            return raw
        if not (width == 36 and height == 11.5 and
                560 <= x <= 740 and 225 <= y <= 305.5):
            return raw
        column = round((x - 560) / 36)
        row = round((y - 225) / 11.5)
        if abs(x - (560 + 36 * column)) > .001 or abs(y - (225 + 11.5 * row)) > .001:
            return raw
        changed += 1
        values = {"x": 560 + 31 * row, "y": 225 + (92 / 6) * column,
                  "width": 31, "height": 92 / 6}
        for key, value in values.items():
            raw = re.sub(rf'(?<=\s){key}="[^"]*"', f'{key}="{value:.4f}"', raw)
        return raw

    svg = re.sub(r"<rect\b[^>]*/>", transpose_cell, svg)
    if changed != 48:
        raise ValueError(f"Expected 48 legacy weight cells, found {changed}")

    labels = {
        "先认数学轴：M 是行，CI 要归约，CO 是输出列":
            "M 是输入行，沿 CI 点积，CO 成为 Out 的列",
        "A[M, CI]": "Act[M, CI]",
        "B[CI, CO]": "Weight[CO, CI]",
        "Y[M, CO]": "Out[M, CO]",
        "存储视图 W[CO,CI] = Bᵀ": "CO 是行，CI 是列；沿 CI 做点积",
        "存储视图 Weight[CO,CI] = Bᵀ": "CO 是行，CI 是列；沿 CI 做点积",
        "固定 weight 块 B(Cblock, Kblock)，FIFO head 保持":
            "固定 Weight(Kblock, Cblock)，FIFO head 保持",
        "固定 Weight 块 B(Cblock, Kblock)，FIFO head 保持":
            "固定 Weight(Kblock, Cblock)，FIFO head 保持",
    }
    for old, new in labels.items():
        svg = svg.replace(f">{old}<", f">{new}<")
    for index in range(4):
        svg = svg.replace(f">B(Cblock, K{index})<", f">Weight[K{index},C]<")
    svg = re.sub(r'(<text\b[^>]*\bx="430"[^>]*>)×(</text>)', r"\1与\2", svg)
    svg = re.sub(r'(<text\b[^>]*\bx="925"[^>]*>)=(</text>)', r"\1→\2", svg)
    svg = svg.replace("<svg ", '<svg data-pe-layout-revised="weight-axes" ', 1)
    return html[:match.start()] + svg + html[match.end():]
