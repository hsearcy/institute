"""Original room landmarks: an abandoned rune furnace and a Gothic reliquary."""

def make_furnace_v2():
    c=begin('furnace')
    for j in range(2):worn_block('Furnace broad foundation',(0,0,.12+j*.18),(2.5-j*.17,1.85-j*.1,.22),'stoneOldDark',.03,.05)
    for side in (-1,1):
        for j in range(4):
            worn_block('Kiln split jamb',(side*.96,0,.53+j*.36),(.49,1.55,.34),'stoneOld',.028,.045)
    # Open fire mouth: curved voussoirs surround a deep soot-black interior.
    for j in range(11):
        a=(j+.5)*pi/11
        o=worn_block('Radial furnace lintel',(.77*cos(a),-.02,1.48+.77*sin(a)),(.28,1.55,.42),'stoneOldLight' if j%3==0 else 'stoneOld',.025,.04)
        o.rotation_euler.y=pi/2-a
    worn_block('Soot black firebox back',(0,.59,1.06),(1.4,.18,1.40),'shadow',.012,.02)
    for j in range(5):rod('Iron fire grate',(-.62+j*.31,-.53,.39),(-.62+j*.31,.46,.39),.022,.022,'iron',8)
    for j in range(18):
        x=random.uniform(-.56,.56);y=random.uniform(-.4,.39)
        ico('Banked ember',(x,y,.41),(.09,.10,.055),'amber' if j%3==0 else 'flame',1,.15)
    for row in range(3):
        for side in (-1,1):
            worn_block('Cracked chimney course',(side*.30,.20,2.23+row*.29),(.58,1.02,.27),'stoneOldDark' if row==2 else 'stoneOld',.024,.045)
    for side in (-1,1):
        line('Bent furnace iron band',[(side*1.2,-.79,.57),(side*1.2,-.79,1.58),(side*.90,-.80,2.0)],.035,'iron',8)
        for z in (.7,1.2,1.6):rivet((side*1.17,-.817,z),.025,'bronze')
    # Dented ash tray and fallen chunks explain how this hall was once used.
    worn_block('Broken hearth lip',(0,-.91,.21),(1.75,.35,.15),'stoneOldDark',.04,.035)
    for j in range(10):
        x=random.uniform(-1.0,1.0);y=random.uniform(-1.1,-.85)
        ico('Cinder and ash',(x,y,.06),(.07+random.random()*.1,.08,.05),'stoneOldDark',1,.18)
    return c

def make_reliquary_v2():
    c=begin('reliquary')
    ringmesh('Octagonal shrine foundation',[(0,0,.03,1.10,.90),(0,0,.19,1.10,.90),(0,0,.25,.95,.79),(0,0,.38,.91,.76)],'stoneOld',8)
    ringmesh('Carved shrine plinth',[(0,0,.37,.82,.67),(0,0,.52,.82,.67),(0,0,.59,.72,.59),(0,0,.67,.83,.68)],'stoneOldLight',8)
    for side in (-1,1):
        for back in (-1,1):
            x=side*.62;y=back*.46
            rod('Slender shrine column',(x,y,.64),(x,y,1.94),.06,.072,'bronze',12)
            for z in (.69,1.80,1.92):ringmesh('Shrine column collar',[(x,y,z,.095,.095),(x,y,z+.055,.095,.095)],'gold',12)
            worn_block('Shrine carved capital',(x,y,1.97),(.24,.22,.14),'stoneOldLight',.008,.018)
    # Four open pointed arches make the relic visible from the game camera.
    for side in (-1,1):
        y=side*.47
        line('Gothic shrine arch',[(-.63,y,1.91),(-.51,y,2.11),(-.24,y,2.29),(0,y,2.46),(.24,y,2.29),(.51,y,2.11),(.63,y,1.91)],.065,'bronze',10)
        line('Fine shrine archivolt',[(-.55,y-.01,1.94),(-.22,y-.01,2.21),(0,y-.01,2.34),(.22,y-.01,2.21),(.55,y-.01,1.94)],.019,'gold',6)
    for side in (-1,1):line('Open roof rib',[(side*.64,-.46,1.96),(side*.72,0,2.27),(side*.64,.46,1.96)],.055,'bronze',8)
    rod('Shrine central finial',(0,0,2.23),(0,0,2.72),.06,.035,'gold',12)
    detailed_crystal('Finial moonstone',(0,0,2.7),.06,.20)
    ringmesh('Relic cradle',[(0,0,.69,.32,.25),(0,0,.78,.28,.22),(0,0,.84,.38,.30)],'bronze',12)
    detailed_crystal('Ancient suspended heart',(0,0,1.05),.22,.74,(.06,.10,.15))
    for side in (-1,1):line('Cradle outstretched talon',[(side*.26,0,.76),(side*.38,0,.95),(side*.24,0,1.22)],.027,'gold',8)
    for side in (-1,1):
        for j in range(3):
            z=.46
            line('Plinth inset rune',[(side*(.18+j*.15),-.78,z-.05),(side*(.21+j*.15),-.79,z+.04),(side*(.25+j*.15),-.78,z-.025)],.01,'bronze',5)
    return c
