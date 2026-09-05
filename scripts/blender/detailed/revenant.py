"""Armored undead knight: asymmetric forged plate, broken shield, ragged cloth.

Shares ordinary named rigid joints with the skeleton for instanced horde motion.
"""

def enemy_joint_pivots(width=1):
    result={'Body':(0,0,1.04),'Head':(0,-.015,1.43),'Cape':(0,.11,1.32),'Sword':(.40*width,-.145,.89)}
    for side,sign in [('L',-1),('R',1)]:
        result.update({'ArmUpper'+side:(sign*.245*width,0,1.36),'ArmLower'+side:(sign*.335*width,-.028,1.095),'LegUpper'+side:(sign*.105*width,0,.80),'LegLower'+side:(sign*.145*width,-.05,.45)})
    return result


def dented_plate(name,outline,depth,material='revenantSteel',edge=.007):
    obj=plate(name,outline,depth,material,edge)
    # Irregular outline and raised central ridge are actual geometry. Broad
    # shallow dents disturb highlights without flattening the metal silhouette.
    for vertex in obj.data.vertices:
        p=obj.matrix_world@vertex.co
        vertex.co.y+=.006*sin(p.x*29+p.z*13)*sin(p.z*21-p.x*11)
    return obj


def make_revenant_v2():
    global PART
    saved=MATS.copy()
    MATS['revenantSteel']=source_material('Revenant weathered forged iron',(.18,.205,.215),'metal',.56,.57)
    MATS['revenantEdge']=source_material('Revenant exposed cut metal',(.31,.29,.245),'metal',.65,.48)
    MATS['revenantCloth']=source_material('Revenant worn oxblood cloth',(.052,.011,.015),'cloth',0,.92)
    c=make_skeleton_v2();c.name='Vault_revenant'
    # Reuse the exposed anatomy, replacing the light soldier's harness and
    # hidden ribs with a thick enclosing cuirass. No stacked invisible shells.
    remove=('Curved rib','Separate vertebra','Spinal process','Left cuirass','Weathered rear','Hammered shoulder','Pauldron rolled','Ancient bracer','Leather baldric','Pitted shin','Greave worn','Rounded corroded','Helm brow','Rotten soldier','Skeleton chipped','Skeleton exposed sternum')
    for obj in list(c.objects):
        if obj.get('part')=='Sword' or any(obj.name.startswith(prefix) for prefix in remove):
            bpy.data.objects.remove(obj,do_unlink=True)
            continue
        # Keep connected armor/limb ownership explicit before altering widths.
        if obj.get('part') not in ('Head','Cape'):
            p=sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            x,y,z=p;side='R' if x>0 else 'L'
            if abs(x)>.205 and z>.80:part=('ArmUpper' if z>1.12 else 'ArmLower')+side
            elif z<.79 and abs(x)>.045:part=('LegUpper' if z>.45 else 'LegLower')+side
            else:part='Body'
            obj['part']=part
        for v in obj.data.vertices:
            p=obj.matrix_world@v.co;p.x*=1.14;v.co=obj.matrix_world.inverted()@p
    c['enemyPivots']=enemy_joint_pivots(1.14)
    PART='Body'
    # Curved broad shell with inward waist and unequal shoulders.
    ringmesh('Revenant dented cuirass volume',[(0,.014,.91,.17,.13),(0,.007,1.00,.19,.15),(0,0,1.16,.25,.17),(0,.012,1.31,.258,.164),(0,.022,1.40,.198,.13)],'revenantSteel',14)
    dented_plate('Revenant breastplate',[(-.23,-.105,1.38),(-.085,-.15,1.425),(.085,-.157,1.405),(.245,-.085,1.34),(.226,-.124,1.13),(.12,-.17,1.03),(.025,-.199,.977),(-.145,-.17,1.055),(-.245,-.115,1.21)],.08)
    line('Revenant broken collar',[(-.22,-.11,1.39),(-.085,-.18,1.424),(.085,-.185,1.401),(.20,-.134,1.37)],.014,'revenantEdge',6)
    for side in (-1,1):
        for j in range(3):
            z=1.02-j*.070
            dented_plate('Overlapping waist lames',[(side*.035,-.186,z),(side*.17,-.13,z+.02),(side*.19,-.15,z-.045),(side*.095,-.199,z-.09),(side*.026,-.207,z-.07)],.012,'revenantSteel',.004)
        for j in range(3):rivet((side*(.10+j*.052),-.183+j*.012,1.34-j*.035),.014,'revenantEdge')
    crack('Cuirass old sword cut',(-.071,-.243,1.26),.075,.18,.0035)
    line('Cuirass bright scar lip',[(-.094,-.241,1.35),(-.075,-.25,1.30),(-.05,-.25,1.263)],.003,'revenantEdge',4)
    for side,label in [(-1,'L'),(1,'R')]:
        PART='ArmUpper'+label
        # Shield shoulder larger and lower; sword shoulder has cut-away opening.
        x=side*.31;large=1.14 if side<0 else .92
        for j in range(2):
            z=1.41-j*.082
            pts=[(x-side*.09,-.12,z),(x-side*.05,.08,z+.042),(x+side*.09*large,.12,z+.055),(x+side*.195*large,.06,z-.04),(x+side*.17*large,-.11,z-.15),(x+side*.075,-.19,z-.162),(x-side*.06,-.174,z-.10)]
            dented_plate('Revenant unequal pauldron',pts,.035,'revenantSteel',.011)
        line('Pauldron exposed hammered lip',[(x-side*.055,-.185,1.305),(x+side*.075,-.208,1.255),(x+side*.17*large,-.125,1.274)],.01,'revenantEdge',6)
        for j in range(3):rivet((x+side*(-.04+j*.055),-.195,1.32),.014,'revenantEdge')
        PART='ArmLower'+label
        ringmesh('Revenant forged vambrace',[(side*.437,-.127,.865,.065,.055),(side*.405,-.09,.97,.083,.070),(side*.375,-.036,1.075,.081,.068)],'revenantSteel',12)
        dented_plate('Revenant elbow wing',[(side*.35,-.06,1.11),(side*.43,-.073,1.085),(side*.47,-.11,1.02),(side*.394,-.165,.97)],.025,'revenantEdge',.007)
        PART='LegUpper'+label
        dented_plate('Revenant hanging tasset',[(side*.055,-.15,.84),(side*.19,-.12,.88),(side*.236,-.12,.65),(side*.17,-.172,.585),(side*.068,-.181,.66)],.025,'revenantSteel',.008)
        PART='LegLower'+label
        x=side*.165
        dented_plate('Revenant heavy greave',[(x-.062,-.065,.11),(x+.066,-.065,.12),(x+.091,-.065,.345),(x+.079,-.077,.455),(x,-.143,.50),(x-.082,-.081,.43),(x-.073,-.052,.29)],.036,'revenantSteel',.009)
        line('Greave forged spine',[(x,-.123,.135),(x,-.175,.37),(x,-.164,.47)],.009,'revenantEdge',5)
    # Shield is directly part of the left forearm: no independent dangling prop.
    PART='ArmLowerL'
    shield=[(-.69,-.238,1.25),(-.60,-.249,1.36),(-.40,-.22,1.36),(-.292,-.236,1.275),(-.285,-.238,1.07),(-.325,-.24,1.038),(-.297,-.24,.987),(-.35,-.243,.934),(-.333,-.246,.87),(-.46,-.256,.625),(-.63,-.25,.86),(-.705,-.24,1.04)]
    dented_plate('Broken knight shield oak core',shield,.065,'wood',.009)
    inset=[(x*.93-.035,y-.024,z*.93+.07) for x,y,z in shield]
    dented_plate('Broken shield iron facing',inset,.068,'revenantSteel',.008)
    line('Shield chipped rolled rim',[(x,y-.035,z) for x,y,z in shield[:6]],.015,'revenantEdge',6)
    line('Shield remaining lower rim',[(x,y-.035,z) for x,y,z in shield[8:]+shield[:1]],.013,'revenantEdge',6)
    sphere('Dented shield boss',(-.492,-.37,1.11),(.076,.035,.08),'revenantEdge',14,8)
    for x,z in [(-.59,1.29),(-.39,1.29),(-.60,1.00),(-.44,.79)]:rivet((x,-.33,z),.016,'revenantEdge')
    line('Shield deep battle score',[(-.61,-.337,1.20),(-.57,-.367,1.16),(-.53,-.374,1.13)],.004,'shadow',5)
    PART='Head'
    # Open-faced broken helm preserves the skeletal face and recognizable eyes.
    helm=ringmesh('Revenant broken helmet dome',[(0,.005,1.688,.171,.133),(0,.010,1.75,.16,.13),(0,.016,1.795,.12,.1),(0,.018,1.821,.045,.032)],'revenantSteel',16)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.046,location=(-.013,-.137,1.714))
    cutter=bpy.context.object;cutter.rotation_euler=(.2,.4,.1);bpy.context.view_layer.objects.active=helm
    mod=helm.modifiers.new('Broken helmet frontal rim','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    for side in (-1,1):
        dented_plate('Revenant torn cheek guard',[(side*.13,-.059,1.723),(side*.168,-.009,1.694),(side*.17,-.048,1.556),(side*.132,-.095,1.52),(side*.097,-.12,1.565)],.015,'revenantSteel',.005)
    line('Broken helm brow', [(-.16,-.067,1.703),(-.082,-.137,1.714),(-.024,-.151,1.710)],.014,'revenantEdge',6)
    line('Surviving helm brow',[(.013,-.15,1.696),(.077,-.143,1.711),(.155,-.075,1.705)],.012,'revenantEdge',6)
    PART='Cape'
    cloth_panel('Revenant tattered burial cloak',(0,.13,1.36),.30,.83,'revenantCloth',.23,.17,4)
    PART='Sword'
    forged_sword((.456,-.145,.89),(.61,-.51,.06),'revenantEdge')
    # Small angular bites are subtracted from the long blade silhouette.
    blade=next(o for o in c.objects if o.name.startswith('Forged ridged blade'))
    for position in [(.53,-.28,.59),(.57,-.39,.30)]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.025,location=position)
        cutter=bpy.context.object;bpy.context.view_layer.objects.active=blade
        mod=blade.modifiers.new('Blade battered edge','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    MATS.clear();MATS.update(saved);PART='Body'
    return c
