"""Standalone architecture figures for the PE architecture chapter."""

from html import escape


INK = "#193c48"
MUTED = "#607680"
COLORS = {"act": "#287eaa", "weight": "#bd6a30", "out": "#7959a0",
          "control": "#63777e", "compute": "#326b61"}
FONT = "'Noto Sans CJK SC','Microsoft YaHei',sans-serif"


def _text(x, y, text, size=24, *, color=INK, weight=400, anchor="start", flow=None):
    data = f' data-pe-flow="{flow}"' if flow else ""
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}"{data} '
            f'style="font-family:{FONT};font-size:{size}px;font-weight:{weight};'
            f'fill:{color}">{escape(text)}</text>')


def _box(x, y, width, height, fill, stroke, *, flow=None, radius=9, sw=1.5):
    data = f' data-pe-flow="{flow}"' if flow else ""
    return (f'<rect x="{x}" y="{y}" width="{width}" height="{height}" '
            f'rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{data}/>')


def _arrow(d, flow, prefix, *, dashed=False):
    dash = ' stroke-dasharray="7 5"' if dashed else ""
    return (f'<path d="{d}" fill="none" stroke="{COLORS[flow]}" '
            f'stroke-width="2.6" marker-end="url(#{prefix}-{flow})" '
            f'data-pe-flow="{flow}"{dash}/>')


def _svg(title, height, body, prefix):
    markers = "".join(
        f'<marker id="{prefix}-{key}" viewBox="0 0 10 10" refX="8.5" refY="5" '
        f'markerWidth="7" markerHeight="7" orient="auto">'
        f'<path d="M0 0L10 5L0 10Z" fill="{color}"/></marker>'
        for key, color in COLORS.items())
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 {height}" '
            f'role="img" aria-label="{escape(title, quote=True)}" data-pe-architecture="" '
            'style="display:block;width:100%;height:auto;background:white">'
            f'<title>{escape(title)}</title><defs>{markers}</defs>{body}</svg>')


def overview_figure():
    """Return a functional overview with distinct data and request paths.

    AL1 and OL1 are distributed inside the PEs.  The WL1 function contains
    request control, hubs, the formatter and output FIFOs.  LDG is a storage
    domain accessed through MCs, not the module issuing read requests.
    """
    prefix = "pe-architecture-overview"
    p = [_text(36, 44, "PE 与存储的数据通路", 34, weight=700),
         _text(36, 88, "实线：数据传递　虚线：权重读请求", 24, color=MUTED),
         _text(1060, 88, "normal KC · 单核关联通路", 24, color=MUTED, anchor="end")]

    # The array frame denotes a functional hierarchy, not a physical boundary.
    p += [_box(642, 124, 418, 492, "#f4f8f5", "#a9bdb5", flow="compute", radius=14),
          _text(668, 165, "PE Array", 32, weight=700, flow="compute"),
          _text(668, 202, "8 group × 每组 8 PE", 26, color=COLORS["compute"], flow="compute")]

    # Act enters each PE's local AL1 before reaching its compute datapath.
    p += [_box(40, 225, 160, 90, "#e7f1f7", "#8db6ca", flow="act"),
          _text(120, 264, "L2 · 读", 28, anchor="middle", weight=700, flow="act"),
          _text(120, 297, "Act", 24, anchor="middle", color=COLORS["act"], flow="act"),
          _box(670, 225, 160, 90, "#e7f1f7", "#8db6ca", flow="act"),
          _text(750, 264, "AL1", 28, anchor="middle", weight=700, flow="act"),
          _text(750, 297, "各 PE 本地", 24, anchor="middle", flow="act"),
          _arrow("M200 270H666", "act", prefix),
          _text(414, 254, "Act 分发 / 广播", 24, anchor="middle", color=COLORS["act"], flow="act")]

    # One representative compute/OL1 pair stands for distributed instances.
    p += [_box(880, 225, 150, 90, "#e2eee7", "#9ab8a6", flow="compute"),
          _text(955, 264, "计算", 29, anchor="middle", weight=700, flow="compute"),
          _text(955, 297, "各 PE 内", 24, anchor="middle", flow="compute"),
          _arrow("M830 253H876", "act", prefix),
          _box(880, 370, 150, 76, "#eee6f5", "#b59cc9", flow="out"),
          _text(955, 402, "OL1", 28, anchor="middle", weight=700, flow="out"),
          _text(955, 432, "各 PE 内", 24, anchor="middle", flow="out"),
          _arrow("M955 315V366", "out", prefix),
          _text(974, 350, "局部和", 24, color=COLORS["out"], flow="out"),
          _text(668, 466, "部分和沿 CI 持续累计", 24, color=COLORS["out"], flow="out")]

    # The outer WL1 box includes the hub and formatter/FIFO functions.
    p += [_box(40, 378, 145, 90, "#fcf0e4", "#d7b08c", flow="weight"),
          _text(112.5, 414, "MC", 29, anchor="middle", weight=700, flow="weight"),
          _text(112.5, 449, "访问 LDG", 24, anchor="middle", flow="weight"),
          _box(230, 350, 380, 128, "#fff9f2", "#d7b08c", flow="weight control", radius=12),
          _text(248, 383, "WL1", 28, weight=700, flow="weight"),
          _text(592, 382, "请求控制", 24, anchor="end", color=COLORS["control"], flow="control"),
          _box(248, 404, 112, 54, "#f8e5d1", "#dfbf9f", flow="weight"),
          _text(304, 440, "hub", 28, anchor="middle", weight=600, flow="weight"),
          _box(390, 404, 202, 54, "#f8e5d1", "#dfbf9f", flow="weight"),
          _text(491, 438, "formatter / FIFO", 24, anchor="middle", flow="weight"),
          _arrow("M185 431H244", "weight", prefix),
          _arrow("M360 431H386", "weight", prefix),
          _arrow("M592 431H857V291H876", "weight", prefix),
          _text(724, 411, "Weight 分发", 24, anchor="middle", color=COLORS["weight"], flow="weight")]

    # Requests travel through the hub; the return datapath uses separate ports.
    p += [_arrow("M520 350V334H336V400", "control", prefix, dashed=True),
          _arrow("M248 416H212V334H112.5V374", "control", prefix, dashed=True)]

    # Completed per-PE sums merge only within their own group in normal KC.
    p += [_box(790, 520, 240, 76, "#eee6f5", "#b59cc9", flow="out"),
          _text(910, 552, "group 内归约", 27, anchor="middle", weight=700, flow="out"),
          _text(910, 582, "合并同一输出", 24, anchor="middle", flow="out"),
          _arrow("M955 446V516", "out", prefix),
          _box(385, 520, 230, 76, "#eee6f5", "#b59cc9", flow="out"),
          _text(500, 552, "输出转换", 28, anchor="middle", weight=700, flow="out"),
          _text(500, 582, "DFO · 格式与打包", 24, anchor="middle", flow="out"),
          _arrow("M790 558H619", "out", prefix),
          _box(40, 520, 160, 76, "#eee6f5", "#b59cc9", flow="out"),
          _text(120, 552, "L2 · 写", 28, anchor="middle", weight=700, flow="out"),
          _text(120, 582, "Out", 24, anchor="middle", color=COLORS["out"], flow="out"),
          _arrow("M385 558H204", "out", prefix),
          _text(292, 543, "Out 写回", 24, anchor="middle", color=COLORS["out"], flow="out")]

    p += [_text(36, 652, "AL1 / OL1 在各 PE 内分布；OL1 保存各 ALU 的部分和。", 24, color=MUTED),
          _text(36, 686, "框线表示功能归属，非 floorplan；L2 与 MC 的位置不代表芯片边界。", 24, color=MUTED)]
    return ('<figure class="diagram pe-architecture-figure">'
            + _svg("单核 PE 的 Act、Weight 和输出通路", 700, "".join(p), prefix)
            + '<figcaption>normal KC 下的功能总览。Act 从 L2 进入各 PE 的 AL1；WL1 经 hub 向 MC 发起 LDG 读请求，'
              '返回数据经 formatter/FIFO 组织后供给阵列。各 PE 内的 OL1 分别保存部分和，完整 CI 累加后再在各 group 内归约，'
              '经输出转换写回 L2。图中同名单元代表相应的一组实例；没有绘制时钟域、握手延迟或物理布置。</figcaption></figure>')
