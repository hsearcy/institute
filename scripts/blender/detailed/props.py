"""Worn iron, oak and crystal dressing matching the baked dungeon stonework."""

def make_brazier_v2():
    global PART
    c=begin('brazier')
    for z,w,h in [(.085,.52,.17),(.205,.43,.09)]:
        worn_block('Sooty brazier footing',(0,0,z),(w,w,h),'stoneDark',.013,.024)
    smooth(ringmesh('Carved brazier pedestal',[(0,0,.23,.19,.19),(0,0,.33,.145,.145),(0,0,.77,.11,.11),(0,0,.87,.19,.19)],'stone',12))
    for z in (.3,.75):torus('Iron pedestal collar',(0,0,z),.15,.014,'iron',n=20)
    ringmesh('Hammered fire bowl',[(0,0,.83,.12,.12),(0,0,.92,.24,.24),(0,0,1.04,.34,.34),(0,0,1.10,.37,.37),(0,0,1.10,.32,.32),(0,0,1.04,.27,.27),(0,0,.94,.14,.14)],'iron',24)
    torus('Hammered rolled bowl rim',(0,0,1.09),.349,.024,'bronze',n=32)
    for i in range(10):
        a=i*2*pi/10
        line('Curled iron cage',[(.16*cos(a),.16*sin(a),.87),(.33*cos(a),.33*sin(a),1.04),(.37*cos(a),.37*sin(a),1.21),(.31*cos(a),.31*sin(a),1.255)],.015,'iron',7)
        rivet((.32*cos(a),.32*sin(a),1.05),.012,'bronze')
    for i in range(15):
        a=random.random()*2*pi;r=random.random()*.21
        o=ico('Charcoal fragment',(r*cos(a),r*sin(a),1.015),(.052,.061,.043),'shadow',2,.12);smooth(o)
    PART='Embers'
    for i in range(8):
        a=random.random()*2*pi;r=random.random()*.23
        line('Smoldering coal seam',[(r*cos(a),r*sin(a),1.046),(r*cos(a)+.028,r*sin(a)+.01,1.048)],.006,'amber',5)
    # Flame is a runtime animated shader; no opaque orange polygon spikes.
    return c

def make_crystal_v2():
    c=begin('crystal')
    for i in range(14):
        a=random.random()*2*pi;r=random.random()*.39
        o=ico('Fractured crystal host rock',(r*cos(a),r*sin(a),.08),(.15+random.random()*.1,.11+random.random()*.08,.07+random.random()*.06),'stoneDark',2,.09);smooth(o)
    detailed_crystal('Main weathered quartz',(.015,.005,.08),.14,1.22,(.035,-.13,.22))
    for i in range(7):
        a=i*2*pi/7
        detailed_crystal('Subsidiary irregular quartz',(.22*cos(a),.21*sin(a),.08),.062+random.random()*.035,.31+random.random()*.51,(.30*sin(a),-.30*cos(a),a))
    for i in range(5):
        a=random.random()*2*pi
        line('Glowing mineral seam',[(.26*cos(a),.25*sin(a),.13),(.18*cos(a),.16*sin(a),.18)],.005,'cyan',5)
    return c

def make_chest_v2():
    global PART
    # The original plank/lid topology already provides readable construction.
    # Its surfaces are now weathered PBR oak and corroded metal, with extra ironwork.
    c=make_chest()
    PART='Body'
    for side in (-1,1):
        x=side*.524
        for z in (.29,.48):line('Side iron hinge strap',[(x,-.26,z),(x,.26,z)],.016,'iron',6)
        torus('Chest side carrying ring',(x,0,.43),.067,.012,'iron',(0,pi/2,0),20)
    for x in (-.32,.32):
        for z in (.32,.49):rivet((x,-.329,z),.009,'bronze')
    PART='Lid'
    for x in (-.40,.40):
        for i in range(9):
            a=(i+.5)*pi/9
            rivet((x,.355*cos(a),.58+.25*sin(a)),.008,'bronze')
    return c
