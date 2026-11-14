"""Standalone figures for the normal FP8 miniblock storage distribution."""

from html import escape


INK = "#193c48"
MUTED = "#607680"
TEAL = "#28796f"
ORANGE = "#b9642b"
FONT = "'Noto Sans CJK SC','Microsoft YaHei',sans-serif"


def _text(x, y, text, size=24, *, color=INK, weight=400, anchor="start"):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" '
            f'style="font-family:{FONT};font-size:{size}px;font-weight:{weight};'
            f'fill:{color}">{escape(text)}</text>')


def _rect(x, y, width, height, fill, stroke="#b8cac6", radius=7, sw=1.4):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="{height}" '
            f'rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def _line(x1, y1, x2, y2, color="#d2deda", width=1.4):
    return (f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" '
            f'stroke="{color}" stroke-width="{width}"/>')


def _arrow(x1, y, x2, prefix, color=TEAL):
    return (f'<path d="M{x1} {y}H{x2}" fill="none" stroke="{color}" '
            f'stroke-width="2.5" marker-end="url(#{prefix}-arrow)"/>')


def _figure(title, height, body, caption, prefix):
    marker = (f'<marker id="{prefix}-arrow" viewBox="0 0 10 10" refX="8.5" '
              'refY="5" markerWidth="7" markerHeight="7" orient="auto">'
              f'<path d="M0 0L10 5L0 10Z" fill="{TEAL}"/></marker>')
    return ('<figure class="diagram pe-miniblock-figure">'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 {height}" '
            f'role="img" aria-label="{escape(title, quote=True)}" '
            'style="display:block;width:100%;height:auto;background:white">'
            f'<title>{escape(title)}</title><defs>{marker}</defs>{body}</svg>'
            f'<figcaption>{caption}</figcaption></figure>')


def group_partition_figure():
    """Show the eight CO partitions and the distinct within-group CI split."""
    prefix = "pe-miniblock-groups"
    p = [_text(36, 48, "一个 miniblock：8 份 Weight，供给 8 个 PE group", 32, weight=700),
         _text(36, 90, "normal KC · FP8 · WBS=128 · 128 CO × 128 CI × 1 B = 16 KiB", 24, color=MUTED),
         _text(36, 142, "CO 沿纵向分组 · 单核聚合地址", 25, weight=600),
         _text(700, 142, "权重通路", 25, weight=600, anchor="middle"),
         _text(950, 142, "计算归属", 25, weight=600, anchor="middle")]

    for group in range(8):
        y = 164 + group * 54
        emphasized = group == 0
        fill = "#e1f0e9" if emphasized else "#f3f7f4"
        stroke = "#559a87" if emphasized else "#c3d3cc"
        p += [_rect(36, y, 510, 44, fill, stroke),
              _text(53, y + 30, f"CO {16 * group}–{16 * group + 15}", 24, weight=600),
              _text(273, y + 30, "2 KiB", 24, anchor="middle", color=TEAL),
              _text(528, y + 30, f"0x{2048 * group:04X}–{2048 * group + 2047:04X}",
                    23, anchor="end", color=MUTED),
              _arrow(548, y + 22, 621, prefix),
              _rect(625, y, 150, 44, "#e8f3ed", stroke),
              _text(700, y + 30, f"WL1 {group}", 25, anchor="middle", weight=600),
              _arrow(778, y + 22, 836, prefix),
              _rect(840, y, 220, 44, "#fcf0e3", "#d7b491"),
              _text(950, y + 30, f"PE group {group}", 25, anchor="middle", weight=600)]

    p += [_text(36, 638, "每个 group 内，128 个 CI 再沿横向分给 8 个 PE：", 25, weight=600)]
    for pe in range(8):
        x = 36 + pe * 128
        p += [_rect(x, 660, 128, 70, "#eef5f2", "#c1d4ca", radius=0),
              _text(x + 64, 688, f"PE {pe}", 24, anchor="middle", weight=600, color=TEAL),
              _text(x + 64, 717, f"CI {16 * pe}–{16 * pe + 15}", 22, anchor="middle")]
    p += [_text(36, 774, "聚合地址连续；实际字节分布在 MC 中。图表示地址与归属，不是物理摆放。", 24, color=MUTED)]
    return _figure(
        "16 KiB miniblock 沿 CO 分给八条 WL1 和 PE group 通路", 800, "".join(p),
        "本图限定 normal KC、FP8、WBS=128、dual-hub。CO、CI 均为当前 miniblock 的局部坐标；"
        "表中地址是相对块首的单核聚合字节偏移。第 g 份连续 2 KiB 由 WL1 g 供给 PE group g；"
        "组内 PE p 使用每个 CO 行的 CI 16p…16p+15。一个 PE 因而取得 16 行各 16 B，"
        "合计 256 B；这 16 段在聚合地址中相隔 128 B，并非连续 256 B。箭头表示供给归属。", prefix)


def mc_distribution_figure():
    """Show group-zero storage by hub/MC and the two words of one MC."""
    prefix = "pe-miniblock-mcs"
    p = [_text(36, 48, "group 0 内部：CO 行如何分布到 hub 和 MC", 32, weight=700),
         _text(36, 90, "normal KC · FP8 · WBS=128 · 双 hub；每个 CO 行 128 B = 4 × 32 B", 24, color=MUTED)]

    for round_id, left in enumerate((36, 580)):
        p += [_text(left, 132, f"第{'一' if round_id == 0 else '二'}个 1 KiB · round {round_id}", 28, weight=600),
              _text(left + 146, 163, "CI →", 22, color=MUTED),
              _text(left + 28, 191, "CO", 23, anchor="middle", color=MUTED),
              _text(left + 101, 191, "hub", 23, anchor="middle", color=MUTED)]
        for segment in range(4):
            x = left + 146 + 84 * segment
            p += [_text(x + 41, 191, f"{32 * segment}–{32 * segment + 31}", 22,
                        anchor="middle", color=MUTED)]
        for hub in range(2):
            y = 210 + hub * 152
            color, fill = (TEAL, "#e6f2ec") if hub == 0 else (ORANGE, "#faecde")
            p += [_rect(left + 66, y, 70, 148, fill,
                        "#b6d0c2" if hub == 0 else "#dfc1a5"),
                  _text(left + 101, y + 83, str(hub), 27, color=color, anchor="middle", weight=700)]
        for local_row in range(8):
            co = 8 * round_id + local_row
            y = 210 + 38 * local_row
            hub = local_row // 4
            color, fill = (TEAL, "#eff6f2") if hub == 0 else (ORANGE, "#fff5eb")
            p += [_text(left + 28, y + 26, str(co), 24, anchor="middle", weight=600)]
            for segment in range(4):
                mc = 4 * (co % 4) + segment
                x = left + 146 + 84 * segment
                highlight = local_row == 0 and segment == 0
                p += [_rect(x, y, 82, 34, "#d3eadf" if highlight else fill,
                            TEAL if highlight else "#d7e2dc", radius=4, sw=2 if highlight else 1),
                      _text(x + 41, y + 25, f"MC {mc}", 22, color=color,
                            anchor="middle", weight=700 if highlight else 400)]
        p += [_text(left, 550, f"聚合偏移 0x{round_id * 1024:04X}–0x{round_id * 1024 + 1023:04X}",
                    23, color=MUTED)]

    p += [_line(36, 576, 1062, 576),
          _text(36, 620, "只看 hub 0 的 MC 0：两个相邻 word", 28, weight=700)]
    for word, co in enumerate((0, 8)):
        y = 644 + word * 76
        p += [_text(36, y + 28, f"word {word}", 26, weight=600),
              _text(36, y + 55, f"MC 偏移 {32 * word} B", 22, color=MUTED),
              _rect(218, y, 422, 60, "#e0eee6", "#9dbdaa", radius=0),
              _rect(640, y, 422, 60, "#f0f6f2", "#9dbdaa", radius=0),
              _text(429, y + 37, f"CO {co} · CI 0–15 → PE 0", 25, anchor="middle", color=TEAL, weight=600),
              _text(851, y + 37, f"CO {co} · CI 16–31 → PE 1", 25, anchor="middle", color=TEAL, weight=600)]
    p += [_text(36, 826, "base=0、块 #0：单 MC 前进 32 B 时，CO 0 → CO 8；聚合偏移相差 1024 B。", 23, color=MUTED)]
    return _figure(
        "group 0 的两轮双 hub 返回与 MC 0 的两个相邻 word", 850, "".join(p),
        "本图限定 normal KC、FP8、WBS=128、dual-hub；CO、CI 均为当前 miniblock 的局部坐标。"
        "每格是一笔 MC 的 32 B："
        "MC 编号为 4×(CO mod 4)+⌊CI/32⌋，编号在每个 hub 内独立。"
        "CO 0…3、8…11 属于 hub 0，CO 4…7、12…15 属于 hub 1；两轮复用同一组 MC。"
        "下部限定 base=0、块 #0、splicing=1、bank-map=0xe4 的低地址区域，展示同一 MC 的连续存储。"
        "一个 32 B word 的前后 16 B 分属两个相邻 PE；formatter 汇集 16 个 CO 行的片段后，"
        "才形成每个 PE 的连续 256 B 输入。round 是块内数据分组，不是周期计数。", prefix)


def pe_gather_figure():
    """Contrast strided packed segments with the contiguous PE interface."""
    prefix = "pe-miniblock-gather"
    p = [_text(36, 48, "PE 0 的 256 B：从 16 个 CO 行各取连续 16 B", 32, weight=700),
         _text(36, 90, "normal KC · FP8 · WBS=128 · group 0；每行 CI 0–15 归 PE 0", 24, color=MUTED),
         _text(36, 140, "LDG packed 聚合地址", 28, weight=600),
         _text(738, 140, "formatter 后：PE 0 输入", 27, weight=600),
         _text(36, 176, "CO", 23, color=MUTED),
         _text(136, 176, "片段起点", 23, color=MUTED),
         _text(278, 176, "每行 128 B", 23, color=MUTED),
         _text(900, 176, "16 × 16 B = 256 B", 23, color=TEAL, anchor="middle")]

    for co in range(16):
        y = 192 + co * 29
        p += [_text(36, y + 22, str(co), 22, weight=600),
              _text(136, y + 22, f"{co * 128} B", 22, color=MUTED),
              _rect(278, y, 224, 24, "#f0f2f1", "#d9e0dc", radius=0, sw=1),
              _rect(278, y, 28, 24, "#add3be", "#71a78b", radius=0, sw=1),
              _rect(738, y, 324, 29, "#e4f0e9" if co % 2 == 0 else "#f1f7f3",
                    "#bfd2c5", radius=0, sw=1),
              _text(900, y + 22, f"ALU {co} · CO {co} · 16 B", 22, anchor="middle", color=TEAL)]

    p += [_text(618, 365, "formatter", 27, anchor="middle", weight=600),
          _text(618, 400, "按 CO 行拼接", 24, anchor="middle", color=MUTED),
          _arrow(520, 431, 718, prefix),
          _text(618, 476, "绿色片段：", 23, anchor="middle", color=TEAL),
          _text(618, 507, "CI 0–15", 24, anchor="middle", color=TEAL),
          _text(36, 701, "聚合偏移 = g × 2048 + a × 128 + p × 16 + j", 27, weight=600),
          _text(36, 741, "g：group　a：组内 CO / ALU　p：PE　j：16 B 段内字节；本图 g=p=0。", 23, color=MUTED),
          _text(36, 779, "PE 输入位置 = 16a + j。地址组织改变，Weight 数值与 CO/CI 归属保持。", 24, color=MUTED)]
    return _figure(
        "分散于 16 个 CO 行的 PE 0 权重片段被 formatter 重组成连续输入", 806, "".join(p),
        "本图限定 normal KC、FP8、WBS=128、dual-hub；CO、CI 均为当前 miniblock 的局部坐标。"
        "左侧每行按字节数等比例画出归属 PE 0 的 16 B 绿色片段与归属 PE 1…7 的其余 112 B；行间留白用于分隔。"
        "16 段起点为 0、128、…、1920 B，在 packed 聚合地址中并不连续。"
        "formatter 从两轮回包中各收集八段，按 ALU/CO 顺序拼成右侧的 2048-bit PE 输入，"
        "每个 ALU 取得同一 CO 行的 16 个 FP8 Weight。右侧是接口字节位置，不是新增的 LDG 地址；"
        "相同规则分别作用于 PE 1…7。", prefix)


def get_figures():
    """Return the independently embeddable figures in reading order."""
    return {"group_partition": group_partition_figure(),
            "mc_distribution": mc_distribution_figure(),
            "pe_gather": pe_gather_figure()}
