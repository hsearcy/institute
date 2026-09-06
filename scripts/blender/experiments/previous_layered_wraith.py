"""Historical layered wraith builder (independent score5/10).

Retained only as provenance for the earlier runtime mesh. Not a fallback for
missing licensed source data and not part of the accepted asset build.
"""

def make_wraith_v2():
    global PART
    saved_materials=MATS.copy()
    MATS['wraithWool']=source_material('wraith charcoal teal wool',(.009,.030,.033),'cloth',0,.94)
    MATS['wraithWorn']=source_material('wraith faded raised folds',(.019,.058,.057),'cloth',0,.91)
    MATS['wraithLining']=source_material('wraith frayed warm lining',(.035,.025,.016),'cloth',0,.96)
    MATS['wraithFace']=source_material('wraith ancient facial fragments',(.17,.145,.10),'bone',0,.93)
    c=begin('wraith')
    # Open-front garment with broad irregular folds and a wind-pulled hem. The
    # short shoulder cowl is a separate layer, not painted shading on one cone.
    def robe_layer(name,top,length,rx0,ry0,spread,material,rows=20):
        verts=[];nx=36;ny=rows
        for j in range(ny+1):
            t=j/ny;z=top-length*t;rx=rx0-.027*sin(t*pi)+spread*t*t;ry=ry0+.10*t
            for i in range(nx+1):
                angle=-pi/2+.44+(2*pi-.88)*i/nx
                fold=.039*sin(angle*5+t*1.45)+.012*sin(angle*11-t*2)
                zz=z+.012*sin(angle*3)*t
                if j==ny:zz+=.16*(.5+.5*sin(angle*6.7))+.035*cos(angle*11)
                verts.append(((rx+fold)*cos(angle)+.055*t*t,(ry+fold)*sin(angle)+.10*t,zz))
        faces=[]
        for j in range(ny):
            for i in range(nx):
                if j>=ny-2 and i in (3,4,16,26):continue
                v=j*(nx+1)+i;faces.append((v,v+1,v+nx+2,v+nx+1))
        obj=mesh(name,verts,faces,material);smooth(obj)
        mod=obj.modifiers.new('Frayed layered wool thickness','SOLIDIFY');mod.thickness=.012
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
        return obj
    robe_layer('Tattered heavy wraith robe',1.52,1.43,.20,.15,.18,'wraithWool')
    robe_layer('Separate torn shoulder cowl',1.525,.43,.225,.178,.12,'wraithWorn',8)
    for side in (-1,1):
        shoulder=(side*.22,-.01,1.43);elbow=(side*.33,-.075,1.20);hand=(side*.445,-.21,1.26)
        bone_segment('Emerging wraith arm',shoulder,elbow,.033)
        bone_segment('Skeletal forearm',elbow,hand,.027)
        sphere('Long bony wraith palm',(hand[0],hand[1]-.023,hand[2]),(.049,.055,.020),'bone',12,8)
        for j in range(4):
            xx=hand[0]+(j-1.5)*.026;reach=.14+.028*sin(j*pi/3)
            line('Separated long spellcasting fingers',[(xx,hand[1]-.025,hand[2]),(xx+side*.020,hand[1]-.095,hand[2]+.034),(xx+side*.030,hand[1]-reach,hand[2]+.018),(xx+side*.029,hand[1]-reach-.032,hand[2]-.027)],.0105,'bone',7)
            sphere('Knuckled casting hand',(xx,hand[1]-.036,hand[2]),(.014,.016,.014),'bone',8,5)
        line('Curled separated wraith thumb',[(hand[0]-side*.046,hand[1],hand[2]),(hand[0]-side*.075,hand[1]-.064,hand[2]-.007),(hand[0]-side*.055,hand[1]-.105,hand[2]-.025)],.012,'bone',7)
        panel=cloth_panel('Trailing thick sleeve',(side*.25,.022,1.43),.16,.71,'wraithWool',.17,.15,2)
        panel.rotation_euler.y=side*.14
        plate('Small worn wraith shoulder guard',[(side*.12,-.11,1.48),(side*.27,-.05,1.53),(side*.35,-.06,1.42),(side*.27,-.15,1.34)],.024,'oldArmor',.007)
        line('Torn front robe rolled seam',[(side*.10,-.16,1.47),(side*.105,-.156,1.23),(side*.13,-.155,.98),(side*.19,-.16,.71),(side*.245,-.13,.40)],.007,'wraithLining',6)
    # A single dull metal clasp and loose chain remain secondary to the face.
    torus('Weathered cloak clasp',(0,-.187,1.415),.032,.009,'oldArmor',(pi/2,0,0),16)
    for j in range(7):
        x=(j-3)*.031;z=1.407-.046*(1-(x/.11)**2)
        torus('Loose mantle chain',(x,-.184,z),.020,.0045,'bronze',(pi/2,.35*(j%2),0),10)
    PART='Head'
    before=set(c.objects);hood_shell((0,-.013,1.67),.183,.24,'wraithWool')
    for obj in set(c.objects)-before:
        if obj.name.startswith('Hood sewn rolled hem'):
            obj.data.materials.clear();obj.data.materials.append(MATS['wraithWorn'])
    # Recessed facial fragments sit behind the deep hood lip and the eye line.
    sphere('Hollow hood darkness',(0,-.088,1.656),(.131,.036,.18),'shadow',18,12)
    for side in (-1,1):
        plate('Recessed angular cheek fragment',[(side*.081,-.122,1.649),(side*.059,-.139,1.645),(side*.040,-.136,1.595),(side*.056,-.126,1.606)],.005,'wraithFace',.002)
        line('Downturned wraith soul eye',[(side*.034,-.167,1.676),(side*.075,-.153,1.670)],.005,'cyan',6)
    plate('Shadowed skeletal nose',[(-.012,-.162,1.626),(.012,-.162,1.626),(0,-.167,1.655)],.004,'wraithFace',.002)
    PART='Cape'
    mantle=cloth_panel('Deep folded rear mantle',(0,.16,1.48),.35,1.34,'wraithWool',.32,.17,3)
    # Broader rear fold crests expose the faded outer wool under directional light.
    for vertex in mantle.data.vertices:
        p=mantle.matrix_world@vertex.co;t=max(0,min(1,(1.48-p.z)/1.34));p.x+=.07*t*t;p.y+=.025*sin(p.x*24)*t
        vertex.co=mantle.matrix_world.inverted()@p
    # Preserve the established ground/top contract exactly after thickening wool.
    points=[obj.matrix_world@v.co for obj in c.objects if obj.type=='MESH' for v in obj.data.vertices]
    bottom=min(p.z for p in points);top=max(p.z for p in points)
    for obj in c.objects:
        if obj.type!='MESH':continue
        inverse=obj.matrix_world.inverted()
        for v in obj.data.vertices:
            p=obj.matrix_world@v.co;p.z=.06131713092327118+(p.z-bottom)/(top-bottom)*(1.93340003490448-.06131713092327118);v.co=inverse@p
    MATS.clear();MATS.update(saved_materials);PART='Body'
    return c
