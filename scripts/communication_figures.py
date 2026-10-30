"""Original inline SVGs for the GPU communication course.

Coordinates are schematic. Colors encode data roles, never measured throughput.
The authored JSON embeds these figures; this module keeps their editable source.
"""
from html import escape
from math import hypot

INK = '#17283f'
MUTED = '#60718a'
BLUE = '#3565ce'
GREEN = '#168363'
PURPLE = '#8058bb'
ORANGE = '#c78128'
COLORS = [BLUE, GREEN, ORANGE, PURPLE]
FILLS = ['#eaf1ff', '#e8f7ef', '#fff4dc', '#f1eaff']


def text(x, y, value, size=19, color=INK, anchor='start', weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}">{escape(str(value))}</text>'


def box(x, y, w, h, label='', color=BLUE, fill='#eaf1ff', size=20, dashed=False):
    dash = ' stroke-dasharray="5 5"' if dashed else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{color}" stroke-width="2"{dash}/>' + (text(x+w/2, y+h/2+7, label, size, INK, 'middle', 500) if label else '')


def arrow(d, color='#64758b', dashed=False):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"'+(' stroke-dasharray="5 5"' if dashed else '')+'/>'


def down(x, y1, y2, color='#64758b'):
    return arrow(f'M{x} {y1}V{y2}', color)+f'<path d="M{x-5} {y2-8}L{x} {y2}L{x+5} {y2-8}" fill="none" stroke="{color}" stroke-width="2.1"/>'


def right(x1, x2, y, color='#64758b'):
    return arrow(f'M{x1} {y}H{x2}', color)+f'<path d="M{x2-8} {y-5}L{x2} {y}L{x2-8} {y+5}" fill="none" stroke="{color}" stroke-width="2.1"/>'


def directed(x1, y1, x2, y2, color, dashed=False):
    length=hypot(x2-x1,y2-y1)
    dx,dy=(x2-x1)/length,(y2-y1)/length
    points=f'{x2-8*dx-4*dy},{y2-8*dy+4*dx} {x2},{y2} {x2-8*dx+4*dy},{y2-8*dy-4*dx}'
    return arrow(f'M{x1} {y1}L{x2} {y2}',color,dashed)+f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="2"/>'


def figure(key, title, subtitle, body, height, caption):
    return f'<figure class="diagram comm-figure" data-comm-figure="{key}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-label="{escape(title)}"><rect width="960" height="{height}" rx="16" fill="#fff"/><g font-family="system-ui, sans-serif">{text(32,43,title,26,INK,weight=650)}{text(32,74,subtitle,16,MUTED)}{body}</g></svg><figcaption>{caption}</figcaption></figure>'


def atlas():
    body=''
    titles=['AllReduce · 求和后每人一份','Broadcast · root = 0','AllGather · 按来源拼接','ReduceScatter · 求和后分片','All-to-All · 按目的地交换','Send / Recv · 一对参与者']
    foot=[('相同位置的贡献相加，输出仍是完整张量。','Σa = a₀ + a₁ + a₂ + a₃'),('root 的内容复制到整个通信组。','虚线空框表示尚无有效输入。'),('保留每份数据，所有 rank 得到相同顺序。','a₀、a₁、a₂、a₃ 是等长数据块。'),('各 rank 持有同一逻辑张量的局部贡献。','Σa 留在 r0，Σb 留在 r1，依此类推。'),('数据块内容不变，接收方按来源排列。','只突出发给 r2 的路径；自发自收在本地。'),('箭头传递一个 tensor；双方匹配通信参数。','这条消息本身不定义全组的归约或拼接。')]
    for k in range(6):
        x=24+(k%2)*468;y=104+(k//2)*338
        body+=f'<rect x="{x}" y="{y}" width="444" height="316" rx="13" fill="#fbfcff" stroke="#dde5ef"/>'
        body+=text(x+18,y+33,f'{k+1:02}  {titles[k]}',21,INK,weight=650)
        xs=[x+22+i*104 for i in range(4)]
        if k==5:
            body+=box(x+24,y+94,137,68,'rank i')+box(x+282,y+94,137,68,'rank j',GREEN,FILLS[1])
            body+=right(x+170,x+273,y+128)+text(x+222,y+109,'tensor',17,MUTED,'middle')
            body+=text(x+222,y+210,'发送方 → 接收方',19,MUTED,'middle')
        else:
            for r,bx in enumerate(xs):
                body+=text(bx+43,y+65,f'r{r}',15,MUTED,'middle')
                label=(f'a{chr(0x2080+r)}' if k in (0,2) else ('A' if r==0 else '∅') if k==1 else '')
                body+=box(bx,y+78,86,48,label,BLUE if k!=1 or r==0 else '#bdc9dc',FILLS[0] if k!=1 or r==0 else '#f5f7fb',21,k==1 and r>0)
                out='Σa' if k==0 else 'A' if k==1 else ['Σa','Σb','Σc','Σd'][r] if k==3 else ''
                body+=box(bx,y+202,86,48,out,GREEN,FILLS[1],22)
                if k in (2,3,4):
                    for c in range(4):
                        if k in (3,4):
                            v=chr(97+c)+str(r) if k==3 else chr(97+r)+str(c)
                            body+=text(bx+12+c*20,y+108,v,13,COLORS[c] if k==3 else COLORS[r],'middle',600)
                        if k in (2,4):
                            v='a'+str(c) if k==2 else chr(97+c)+str(r)
                            body+=text(bx+12+c*20,y+232,v,13,COLORS[c],'middle',600)
            if k in (0,2,3):
                for bx in xs: body+=arrow(f'M{bx+43} {y+132}V{y+147}')+down(bx+43,y+181,y+195)
                body+=arrow(f'M{xs[0]+43} {y+147}H{xs[-1]+43}')+arrow(f'M{xs[0]+43} {y+181}H{xs[-1]+43}')
                label=['逐位置 SUM','', '按 rank 顺序连接','逐位置 SUM，再按 chunk 分配'][k]
                body+=text(x+222,y+171,label,15,MUTED,'middle',500)
            elif k==1:
                for bx in xs:
                    body+=arrow(f'M{xs[0]+43} {y+132}V{y+156}H{bx+43}')+down(bx+43,y+156,y+195)
            else:
                target=xs[2]+43
                for r,bx in enumerate(xs):
                    body+=directed(bx+43,y+132,target+(r-1.5)*13,y+190,COLORS[r],r==2)
        body+=text(x+18,y+276,foot[k][0],15,MUTED)+text(x+18,y+299,foot[k][1],14,MUTED)
    return figure('atlas','六种通信，先看操作前后','教学示意 · 4 ranks · 每个 aᵣ 或字母块可以代表多个元素；箭头不表示物理路由或耗时。',body,1130,'读图：同一列上下对应同一个 rank。AllReduce / ReduceScatter 的 Σ 表示逐元素求和；AllGather 保留内容并拼接；All-to-All 改变归属。集合语义不限定必须用某种算法实现。')


def ownership():
    body=''
    panels=[('完整副本','r0: [4, 6]','r1: [4, 6]','两份相同结果','Replicate'),('不同位置','r0: [1, 2]','r1: [3, 4]','拼成 [1, 2, 3, 4]','Shard'),('同位置的贡献','r0: [1, 2]','r1: [3, 4]','相加得 [4, 6]','Partial / SUM')]
    for i,(title,a,b,out,label) in enumerate(panels):
        x=30+i*310
        body+=text(x+145,124,title,22,INK,'middle',600)
        body+=box(x+15,145,260,48,a,COLORS[i],FILLS[i])+box(x+15,205,260,48,b,COLORS[i],FILLS[i])
        body+=down(x+145,265,297)+text(x+145,329,out,20,INK,'middle',500)+text(x+145,362,label,17,MUTED,'middle')
    return figure('ownership','相同 shape，不同含义','每个 rank 的局部 shape 都是 [2]。先问两个数字对应哪些逻辑位置，再决定如何组合。',body,394,'左：同一张量的重复副本。中：不同位置的连续分片。右：同一位置由两个 rank 分别计算的贡献。副本若误做 SUM，结果会被放大；分片若误做 SUM，位置对应关系就丢失。')


def paths():
    body=''
    lanes=[('主机中转',['GPU A','Host buffer','Host buffer','GPU B'],['D2H','主机 / 网络','H2D']),('GPU 直接传输',['GPU A HBM','PCIe / NVLink','GPU B HBM'],['读取 / 发出','到达 / 写入']),('GPUDirect RDMA',['GPU A HBM','NIC A','NIC B','GPU B HBM'],['PCIe / DMA','IB / RoCE','DMA / PCIe'])]
    for row,(title,labels,edges) in enumerate(lanes):
        y=139+row*148
        body+=text(32,y,title,21,INK,weight=600)
        for i,label in enumerate(labels):
            step=239 if len(labels)==4 else 334
            width=170 if len(labels)==4 else 220
            x=36+i*step
            body+=box(x,y+30,width,58,label,COLORS[row],FILLS[row],19)
            if i<len(labels)-1:body+=right(x+width+8,x+step-8,y+59)+text(x+(width+step)/2,y+21,edges[i],13,MUTED,'middle')
    body+=text(32,590,'控制准备：选设备 → 建组 / 连接 → 注册或映射内存 → 交换信息 → 提交与同步',17,MUTED)
    return figure('paths','同一份 payload，三条不同的数据路径','路径分类示意，具体可用性取决于平台、驱动、拓扑与传输实现。图中宽度不代表带宽。',body,624,'实线表示 payload 所走的路径。GPUDirect RDMA 可绕过主机内存中转，但初始化、注册、代理进展和消费同步仍可能需要 CPU。NVLink 域的边界应按实际机器确认。')


def ordering():
    body=text(32,125,'发送方 PE 0',20,INK,weight=600)+text(32,303,'接收方 PE 1',20,INK,weight=600)
    for x,label in [(206,'put(42)'),(434,'quiet'),(662,'signal(1)')]:
        body+=box(x,148,180,58,label)
    body+=right(394,426,177)+right(622,654,177)
    body+=box(434,326,180,58,'wait(flag == 1)',GREEN,FILLS[1],18)+box(662,326,180,58,'read → 42',GREEN,FILLS[1])
    body+=right(622,654,355)+arrow('M850 177H886V279H524')+down(524,279,318)
    body+=text(220,238,'发起数据写入',16,MUTED)+text(440,238,'完成此前传输',16,MUTED)+text(670,238,'通知接收方',16,MUTED)
    body+=text(32,429,'先有完成保证，再发布可被接收方观察的通知；接收方使用库定义的 wait 建立消费条件。',17,MUTED)
    return figure('ordering','从写入到消费，中间需要哪些保证','HOTI 单整数示例的语义顺序 · PE 是 NVSHMEM 的参与者编号 · 箭头表示先后依赖。',body,461,'quiet 是发送方的完成操作，本身不会通知接收方；signal / wait 构成接收方可观察的交接。这里只画一次传输，重复使用 buffer 还需要轮次或重置协议。')


def tp():
    body=text(32,118,'数学约定：X[T,H] × W[H,I]；H=4096，I=12288，TP=4。矩形尺寸不按容量比例。',17,MUTED)
    for r in range(4):
        y=155+r*95
        body+=text(36,y+35,f'r{r}',19,MUTED,weight=600)
        body+=box(82,y,150,58,'X [T,4096]',BLUE,FILLS[0],17)
        body+=right(240,271,y+29)+box(280,y,200,58,'gate / up → Aᵣ',COLORS[r],FILLS[r],18)
        body+=text(380,y+80,'Aᵣ [T,3072]',16,MUTED,'middle')
        body+=right(488,518,y+29)+box(527,y,180,58,'down → Zᵣ',ORANGE,FILLS[2],18)
        body+=text(617,y+80,'部分和 [T,4096]',16,MUTED,'middle')
        body+=right(715,754,y+29)
    body+=box(763,155,165,343,'',GREEN,FILLS[1])+text(845,264,'AllReduce',23,GREEN,'middle',650)+text(845,301,'Y = Σᵣ Zᵣ',21,INK,'middle')+text(845,348,'每 rank 得到',17,MUTED,'middle')+text(845,376,'完整 [T,4096]',18,INK,'middle')
    return figure('tp','TP FFN：局部特征可以独立算，部分和需要合并','真实维度：Qwen3-8B · 教学部署：TP=4、BF16，输入 X 已在各 rank 复制。',body,559,'gate 与 up 按中间特征 I 切分，Aᵣ = SiLU(gateᵣ) ⊙ upᵣ；down 按相同 I 分片产生完整 hidden 轴上的部分和。四个 Zᵣ 对应相同输出坐标，所以沿 rank 轴求和。')


def fusion():
    body=''
    labels=[('各 rank 的部分和','[T,H] · Partial'),('按 token 归约分配','[T/p,H] · 完整行'),('本地 RMSNorm','hidden 轴仍完整'),('按 token 汇集','[T,H] · Replicate')]
    for i,(a,b) in enumerate(labels):
        x=30+235*i
        body+=box(x,140,195,110,'',COLORS[i],FILLS[i])+text(x+97,180,a,18,INK,'middle',600)+text(x+97,215,b,16,MUTED,'middle')
        if i<3:body+=right(x+202,x+226,195)
    body+=text(245,286,'ReduceScatter',17,MUTED,'middle')+text(715,286,'AllGather',17,MUTED,'middle')
    body+=text(32,342,'合法：先完成同一 token 的所有贡献，再在完整 hidden 行上计算归一化。',20,GREEN,weight=600)
    body+=text(32,382,'反例：RMSNorm(x₀ + x₁) 一般不等于 RMSNorm(x₀) + RMSNorm(x₁)。',18,MUTED)
    return figure('fusion','融合成立的前提：本地计算拿到了它需要的完整数据','教学等分示意：T 可被 p 整除。实际设备示例会把完整 token 行分配给参与 rank。',body,416,'箭头表示数学数据依赖，不承诺是四个独立 kernel。分片轴是 token，归一化轴是 hidden；改变分片轴后必须重新检查统计量是否完整。')


def moe():
    body=''
    steps=[('来源 token','r0 · token 3'),('两条路由','expert 1 / 6'),('按目的地打包','r0 / r3'),('专家计算','F₁(x) / F₆(x)'),('返回并还原','token 3 · 两个 slot'),('加权合并','w₀F₁(x)+w₁F₆(x)')]
    for i,(a,b) in enumerate(steps):
        row=i//3;col=i%3;x=32+col*313;y=130+row*185
        body+=box(x,y,270,90,'',COLORS[i%4],FILLS[i%4])+text(x+135,y+35,a,22,INK,'middle',600)+text(x+135,y+66,b,17,MUTED,'middle')
        if col<2:body+=right(x+277,x+304,y+45)
    body+=arrow('M929 175H944V286H18V360H24')+right(18,24,360)
    body+=text(32,459,'贯穿标识：(source rank, token ID, route slot, expert ID, weight)。返回时按标识逆置换。',17,MUTED)
    return figure('moe','一个 token 的 MoE 往返：路由信息必须一起走','教学配置：4 ranks、8 experts、每 rank 连续放 2 experts、Top-2；两个 slot 的权重和为 1。',body,493,'expert 1 位于来源 r0，本地分支不跨 rank；expert 6 位于 r3。实线是处理顺序，打包与返回涉及可变长度消息。最终只在一个约定位置应用一次路由权重。')


FIGURES = {'atlas':atlas, 'ownership':ownership, 'paths':paths, 'ordering':ordering, 'tp':tp, 'fusion':fusion, 'moe':moe}
