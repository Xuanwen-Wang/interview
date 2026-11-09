"""Reproducible additional figures for the math reader review."""
import math
from math_figures import text, box, arrow, figure, BLUE, GREEN, ORANGE


def grid(x,y,values,label,cw=75,ch=48,highlight=None):
    body=text(x,y-18,label,19)
    for i,row in enumerate(values):
        for j,v in enumerate(row):
            color='#fff0d9' if highlight and highlight(i,j) else '#edf3fc'
            body+=box(x+j*cw,y+i*ch,cw-5,ch-5,[str(v)],color)
    return body


def products():
    body=text(35,120,'点积：同行对应相乘，再相加，特征轴消失',21)
    body+=grid(40,180,[[1,2]],'q [1,2]')+text(215,210,'×',24)
    body+=grid(270,180,[[3],[4]],'kᵀ [2,1]')+arrow(385,213,465,213)
    body+=box(490,178,420,90,['1×3 + 2×4 = 11','输出 [1,1]，只有一个分数'])
    body+=text(35,325,'外积：每个 q 分量乘每个 k 分量，两个轴保留',21)
    body+=grid(40,385,[[1],[2]],'qᵀ [2,1]')+text(155,420,'×',24)
    body+=grid(215,385,[[3,4]],'k [1,2]')+arrow(390,420,465,420)
    body+=grid(510,385,[['1×3=3','1×4=4'],['2×3=6','2×4=8']],'输出 [2,2]：行 q 分量，列 k 分量',180)
    return figure('同样两组数，向量朝向与归约决定结果','教学 q=[1,2]、k=[3,4]；ᵀ 表示转置，蓝格仅表示元素。',body,510,'点积把两个长度相同的向量压成一个分数；外积把任意两种长度扩展为二维表。逐元素乘 [3,8] 则既不求和，也不枚举所有配对。')


def qk_cells():
    body=grid(35,150,[[1,2],[3,4]],'Q [T=2,dₖ=2]',80,55,lambda i,j:i==0)
    body+=text(230,210,'×',25)
    body+=grid(285,150,[[5,7,9],[6,8,10]],'Kᵀ [dₖ=2,N=3]',72,55,lambda i,j:j==1)
    body+=arrow(520,205,570,205)
    body+=grid(610,150,[[17,23,29],[39,53,67]],'QKᵀ [T=2,N=3]',95,55,lambda i,j:(i,j)==(0,1))
    body+=box(110,315,740,85,['橙格：query 0 与 key 1 的点积','S₀,₁ = 1×7 + 2×8 = 23；沿 dₖ 求和'])
    body+=text(35,445,'输出的行是 query 位置；列是 key 位置。dₖ 已被归约。',20)
    return figure('QKᵀ 是一张“成对点积”的表','教学未缩放分数：K=[[5,6],[7,8],[9,10]]，省略 batch 与 head 轴。',body,480,'先取 Q 的一行、Kᵀ 的一列。六个输出格各做一次长度为 2 的点积；输出是矩阵，不等于对两个完整向量做外积。')


def scalar_curves(kind):
    if kind=='sigmoid':
        title='Sigmoid：逐渐打开、最终饱和的门'
        f=lambda x:1/(1+math.exp(-x)); ymax=1.2
        extra='有限 x 时 0<σ(x)<1；x=0 时为 0.5。'
        caption='横轴输入 x，纵轴输出 σ(x)；蓝线按公式采样。越往右越接近 1，但两端饱和后很大的输入变化只造成很小的输出变化。'
    else:
        title='Softplus：把实数变成平滑的正数'
        f=lambda x:max(x,0)+math.log1p(math.exp(-abs(x))); ymax=6.6
        extra='β=1；对照 ReLU=max(0,x)，Softplus 没有上界。'
        caption='横轴输入 x，纵轴函数值。蓝实线是 Softplus，橙虚线是 ReLU；两者共用坐标。Softplus 在 0 处为 ln2，过渡光滑且保持正值。'
    x0,y0,w,h=100,385,650,260
    xy=lambda x,y:(x0+(x+6)/12*w,y0-y/ymax*h)
    body=''
    for x in [-6,-3,0,3,6]:
        px,_=xy(x,0);body+=f'<path d="M{px} 115V385" stroke="#e0e7ee"/>'+text(px,418,x,17,'middle')
    for y in ([0,.5,1] if kind=='sigmoid' else [0,2,4,6]):
        _,py=xy(0,y);body+=f'<path d="M90 {py}H765" stroke="#d5dee8"/>'+text(78,py+6,y,17,'end')
    body+=text(785,390,'输入 x',18)+text(100,106,'输出 f(x)',18)
    if kind!='sigmoid':
        pts=[xy(-6+i*.03,max(0,-6+i*.03)) for i in range(401)]
        body+='<polyline points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)+f'" fill="none" stroke="{ORANGE}" stroke-width="3" stroke-dasharray="8 5"/>'
        body+=text(790,260,'ReLU',18,color=ORANGE)
    pts=[xy(-6+i*.03,f(-6+i*.03)) for i in range(401)]
    body+='<polyline points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)+f'" fill="none" stroke="{BLUE}" stroke-width="3"/>'
    px,py=xy(0,f(0));body+=f'<circle cx="{px}" cy="{py}" r="5" fill="{GREEN}"/>'+text(px+15,py-12,f'f(0)={f(0):.4f}',19)
    return figure(title,'横轴 x∈[−6,6]；'+extra,body,450,caption)


def norm_steps():
    body=''
    left=[['输入 x=[1,2,3,4]','D=4，γ=1，β=0，ε=0'],['均值 μ=10/4=2.5','中心化 c=x−μ=[−1.5,−0.5,0.5,1.5]'],['c²=[2.25,0.25,0.25,2.25]','方差 v=5/4=1.25；分母 √v≈1.1180'],['c/√v≈[−1.342,−0.447,0.447,1.342]','均值 0；方差 1']]
    right=[['输入 x=[1,2,3,4]','D=4，γ=1，ε=0'],['直接平方 x²=[1,4,9,16]','不减均值'],['均方 r²=30/4=7.5','分母 r=√7.5≈2.7386'],['x/r≈[0.365,0.730,1.095,1.461]','均方 1；均值通常不是 0']]
    body+=text(260,115,'LayerNorm 路径',23,'middle')+text(705,115,'RMSNorm 路径',23,'middle')
    for side,steps in enumerate([left,right]):
        x=40+side*455
        for i,lines in enumerate(steps):
            y=145+i*120
            body+=box(x,y,420,90,lines,'#edf6f1' if side else '#edf3fc')
            if i<3:body+=arrow(x+210,y+90,x+210,y+114)
    return figure('两种 Norm 的每一步：同一输入、不同分母','用于手算的 ε=0 仅限本例非退化输入；实际模型通常设 ε>0。',body,645,'箭头表示计算依赖。每行独立沿特征轴归约；γ 是逐特征参数。LayerNorm 先把数值移到均值 0，RMSNorm 只调整相对 0 的整体尺度。')


def norm_points():
    body=''; xs=[1,2,3,4];centered=[v-2.5 for v in xs]
    rows=[('原值 x',xs,'μ=2.5'),('减均值 x−μ',centered,'μ=0'),('LayerNorm',[v/math.sqrt(1.25) for v in centered],'Var=1'),('RMSNorm',[v/math.sqrt(7.5) for v in xs],'mean(x²)=1')]
    for i,(label,vals,note) in enumerate(rows):
        y=155+i*115;xmap=lambda x:330+(x+2)*78
        body+=text(30,y+5,label,19)+f'<path d="M{xmap(-2)} {y}H{xmap(5)}" stroke="#718297"/>'
        for tick in [-2,0,2,4]:body+=f'<path d="M{xmap(tick)} {y-5}v10" stroke="#718297"/>'+text(xmap(tick),y+28,tick,16,'middle')
        for j,v in enumerate(vals):
            x=xmap(v);body+=f'<circle cx="{x}" cy="{y}" r="6" fill="{BLUE}"/>'+text(x,y-16,f'{j+1}',15,'middle')
        body+=text(760,y+55,note,17)
    return figure('把中心与尺度画到同一条数轴上','x=[1,2,3,4]；γ=1、β=0、ε=0；点上编号为特征 1…4。',body,635,'各行数轴比例相同，横向坐标是数值大小，纵向只是不同处理阶段。LayerNorm 先平移再缩放；RMSNorm 沿 0 点等比例缩放，保留本例中的正号。')


def topk_selection():
    body=grid(90,145,[['A','B','C','D'],['0.10','0.40','0.80','0.60']],'原始位置与分数 z，索引为 0…3',175,55,lambda i,j:j in [2,3])
    body+=arrow(480,265,480,305)
    body+=grid(90,350,[['C (2)','D (3)','B (1)','A (0)'],['0.80','0.60','0.40','0.10']],'为教学完整排序：降序排名',175,55,lambda i,j:j<2)
    body+=box(120,505,710,90,['Top‑2 返回 values=[0.80,0.60]，indices=[2,3]','若做正分数合并：除以 1.40 → [4/7,3/7]'])
    return figure('Top‑K 先保留“数值与原位置”的配对','K=2；橙格表示选中项。最后一行只适用于按正分数归一化的合同。',body,635,'完整排序用于看清选择过程；实现可只找前 K 项。词表 logits 过滤后的 Softmax 不等于直接除以选中原分数的和。')
