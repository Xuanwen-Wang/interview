"""Original SVG teaching figures; coordinates are independent of page layout."""
from html import escape
import math

INK = '#21354b'
BLUE = '#2965b0'
GREEN = '#20775d'
ORANGE = '#af6322'

def text(x, y, value, size=19, anchor='start', color=INK):
    return f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" fill="{color}">{escape(str(value))}</text>'

def box(x, y, w, h, lines, color='#edf3fc'):
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{color}" stroke="#b8c8d7"/>'
    for i, line in enumerate(lines):
        out += text(x+w/2, y+h/2+(i-(len(lines)-1)/2)*29+6, line, 19, 'middle')
    return out

def arrow(x1, y1, x2, y2):
    angle = math.atan2(y2-y1, x2-x1)
    a = [(x2-10*math.cos(angle+v), y2-10*math.sin(angle+v)) for v in [-.5,.5]]
    return f'<path d="M{x1} {y1} L{x2} {y2} M{a[0][0]} {a[0][1]} L{x2} {y2} L{a[1][0]} {a[1][1]}" fill="none" stroke="#65798d" stroke-width="2"/>'

def figure(title, subtitle, body, height, caption):
    return (f'<figure class="diagram math-figure"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-label="{escape(title, quote=True)}">'
            f'<rect width="960" height="{height}" rx="12" fill="#fcfdff"/>'
            '<g font-family="system-ui,sans-serif">'+text(28,40,title,25)+text(28,73,subtitle,17,color='#52677c')+body+'</g></svg>'
            f'<figcaption>{caption}</figcaption></figure>')

def flow(title, subtitle, stages, caption):
    # Vertical flow preserves full-width labels in both desktop and print.
    body=''
    for i, lines in enumerate(stages):
        y=100+i*110
        body+=text(80,y+44,f'{i+1:02}',22,color=GREEN)
        body+=box(160,y,640,80,lines,'#edf6f1' if i%2 else '#edf3fc')
        if i<len(stages)-1: body+=arrow(480,y+80,480,y+105)
    return figure(title,subtitle,body,120+110*len(stages),caption)

def panels(title, subtitle, panels, caption):
    body=''
    for i,(heading,lines) in enumerate(panels):
        x=25+i*310
        body+=text(x+145,120,heading,22,'middle')
        body+=box(x,145,290,50+34*len(lines),lines)
    return figure(title,subtitle,body,215+34*max(len(p[1]) for p in panels),caption)

def matrix(title, subtitle, values, rowlabels, collabels, caption, footer=''):
    body=''; w=min(130,650/len(collabels)); x0=240
    for j,col in enumerate(collabels): body+=text(x0+j*w+w/2,115,col,18,'middle')
    for i,row in enumerate(values):
        y=135+i*65
        body+=text(215,y+35,rowlabels[i],18,'end')
        for j,value in enumerate(row): body+=box(x0+j*w,y,w-8,52,[str(value)],'#edf6f1' if i%2 else '#edf3fc')
    h=200+65*len(values)
    body+=text(35,h-20,footer,18)
    return figure(title,subtitle,body,h,caption)

def bars(title, subtitle, series, labels, caption, ymax=1):
    body=''; colors=[BLUE,GREEN,ORANGE]; n=len(labels); chartw=580; x0=100; y0=360; height=220
    for y in [0,ymax/2,ymax]:
        py=y0-y/ymax*height
        body+=f'<path d="M85 {py} H700" stroke="#dce4ed"/>'+text(72,py+6,f'{y:g}',16,'end')
    bw=chartw/n/(len(series)+1)
    for s,(name,vals) in enumerate(series):
        body+=f'<rect x="735" y="{145+s*48}" width="16" height="16" fill="{colors[s]}"/>'+text(760,159+s*48,name,18)
        for i,v in enumerate(vals):
            x=x0+i*chartw/n+s*bw; h=v/ymax*height
            body+=f'<rect x="{x}" y="{y0-h}" width="{bw-3}" height="{h}" fill="{colors[s]}"/>'
            body+=text(x+bw/2,y0-h-8,f'{v:.3f}',14,'middle')
    for i,label in enumerate(labels):body+=text(x0+i*chartw/n+bw*len(series)/2,390,label,18,'middle')
    return figure(title,subtitle,body,425,caption)

def curves():
    funcs=[('ReLU',lambda x:max(0,x),BLUE),('SiLU',lambda x:x/(1+math.exp(-x)),GREEN),('GELU',lambda x:x*.5*(1+math.erf(x/math.sqrt(2))),ORANGE)]
    def xy(x,y):return (110+(x+4)*80,380-y*62)
    body=''
    for x in range(-4,5):
        px,_=xy(x,0);body+=f'<path d="M{px} 110V415" stroke="#e2e8ef"/>'+text(px,440,x,16,'middle')
    for y in [0,1,2,3,4]:
        _,py=xy(0,y);body+=f'<path d="M95 {py} H765" stroke="#e2e8ef"/>'+text(82,py+5,y,16,'end')
    body+=arrow(95,380,780,380)+arrow(430,415,430,100)+text(790,385,'输入 x',17)+text(440,110,'输出 f(x)',17)
    for j,(name,f,color) in enumerate(funcs):
        pts=[xy(-4+i/50,f(-4+i/50)) for i in range(401)]
        body+='<polyline points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)+f'" fill="none" stroke="{color}" stroke-width="3" stroke-dasharray="{["none","8 3","2 4"][j]}"/>'
        body+=text(785,170+j*45,name,20,color=color)
    return figure('激活曲线：同一输入，三种非线性','横轴 x ∈ [−4,4]；纵轴 f(x)。曲线按公式采样，使用相同坐标。',body,475,'实线 ReLU、长虚线 SiLU、点线 GELU（精确 erf 定义）。SiLU/GELU 在负半轴可输出小负数，不是概率。')

def rope():
    body=''; cx=300;cy=320;scale=110
    body+=f'<circle cx="{cx}" cy="{cy}" r="{scale}" fill="none" stroke="#ccd9e7"/>'
    body+=arrow(120,cy,480,cy)+arrow(cx,460,cx,135)
    body+=text(475,350,'第 1 分量',18)+text(310,130,'第 2 分量',18)
    body+=arrow(cx,cy,cx+scale,cy)+arrow(cx,cy,cx,cy-scale)
    body+=text(cx+scale+10,cy-15,'(1,0)',20,color=BLUE)+text(cx+15,cy-scale-15,'(0,1)',20,color=GREEN)
    body+=box(580,165,330,100,['旋转 90° 的教学例','长度 1 → 长度 1'])
    body+=box(580,295,330,100,['位置 m → 角度 mθ','各维度对的 θ 可以不同'])
    return figure('RoPE 的基本单元：一对数的旋转','仅展示二维平面；角度 90° 用于手算，不是模型的固定旋转量。',body,500,'输入 (1,0) 绕原点逆时针旋转得到 (0,1)。旋转改变方向、保留欧氏长度；维度轴不是 token 位置轴。')
