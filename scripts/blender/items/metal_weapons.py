"""Distinct forged weapon constructions sharing the reviewed material basis."""
import math

import bpy


def _single_edge(parent, steel, edge, *, low=False):
    # z, sharpened edge, blunt spine, half-depth. The upper blade carries the
    # mass, followed by a clipped corner; it is not the starter sword widened.
    stations=[(.174,-.024,.026,.013),(.240,-.045,.043,.014),
              (.380,-.079,.049,.013),(.590,-.100,.058,.011),
              (.750,-.105,.058,.009),(.822,-.082,.049,.007),
              (.868,-.030,.039,.004),(.881,.019,.035,.0015)]
    def section(z):
        for a,b in zip(stations,stations[1:]):
            if z<=b[0]:
                t=(z-a[0])/(b[0]-a[0])
                return tuple(a[i]+(b[i]-a[i])*t for i in (1,2,3))
        return stations[-1][1:]
    # The low blade follows the same cross-sections with explicit rows at every
    # profile change. Unconstrained collapse creates long diagonal triangles
    # across those changes, which showed a crease absent from the source.
    us=([0,.1,.2,.25,.275,.4,.6,.64,.7,.76,.82,.88,1] if low else [i/40 for i in range(41)])
    zs=(sorted({*(row[0] for row in stations),.27,.315,.755,.80,
                *(stations[0][0]+(stations[-1][0]-stations[0][0])*j/32 for j in range(33))})
        if low else [stations[0][0]+(stations[-1][0]-stations[0][0])*j/140 for j in range(141)])
    nx,nz=len(us)-1,len(zs)-1
    vertices=[];faces=[];material_ids=[]
    for side in (-1,1):
        for z in zs:
            cut,spine,depth=section(z)
            for u in us:
                bevel=min(1,u/.27)
                # A broad honed edge meets the forged flat continuously. A
                # shallow hollow below the spine leaves a reinforced back.
                value=.00035+(depth-.00035)*bevel
                hollow=max(0,1-abs(u-.76)/.12)
                run=min(1,max(0,(z-.27)/.045))*min(1,max(0,(.80-z)/.045))
                value-=.0018*math.sin(hollow*math.pi/2)**2*run
                vertices.append((cut+(spine-cut)*u,side*value,z))
    plane=(nx+1)*(nz+1)
    for side in range(2):
        for j in range(nz):
            for i in range(nx):
                a=side*plane+j*(nx+1)+i
                face=(a,a+1,a+nx+2,a+nx+1)
                faces.append(face if side==0 else tuple(reversed(face)))
                material_ids.append(1 if (us[i]+us[i+1])*.5<.27 else 0)
    for j in range(nz):
        for i in (0,nx):
            a=j*(nx+1)+i;b=a+nx+1
            faces.append((a,b,b+plane,a+plane));material_ids.append(1 if i==0 else 0)
    for j in (0,nz):
        for i in range(nx):
            a=j*(nx+1)+i
            faces.append((a,a+plane,a+plane+1,a+1));material_ids.append(0)
    data=bpy.data.meshes.new('Ashsplitter continuous single-edge forged surface')
    data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new('Forged blade Ashsplitter reinforced hollow back',data)
    bpy.context.scene.collection.objects.link(obj);obj.parent=parent
    data.materials.append(steel);data.materials.append(edge)
    for face,material_id in zip(data.polygons,material_ids):
        face.use_smooth=True;face.material_index=material_id
    return obj


def cleaver(root,p,helpers):
    surface,outline,lathe,material=helpers
    ash=p['leather'].copy();ash.name='Ashsplitter compressed charcoal leather'
    nodes,links=ash.node_tree.nodes,ash.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    incoming=bsdf.inputs['Base Color'].links[0].from_socket
    tint=nodes.new('ShaderNodeVectorMath');tint.operation='MULTIPLY'
    tint.inputs[1].default_value=(.28,.46,.51)
    links.new(incoming,tint.inputs[0]);links.new(tint.outputs[0],bsdf.inputs['Base Color'])
    surface.wrapped_hilt(root,dict(p,leather=ash),(.052,.048,.040,1))
    iron=material('Ashsplitter blackened forged body',(.055,.069,.074),.72,.43,grain=.00018)
    edge=p['edge'].copy();edge.name='Ashsplitter restrained ground steel bevel'
    edge_shader=edge.node_tree.nodes.get('Principled BSDF')
    edge_shader.inputs['Base Color'].default_value=(.28,.34,.37,1)
    # The shared steel palette's strongly stretched roughness produced the
    # visible parallel bands on this unusually broad bevel. Use a narrow,
    # isotropic roughness range here; the starter's material remains intact.
    for link in list(edge_shader.inputs['Roughness'].links):edge.node_tree.links.remove(link)
    texture=edge.node_tree.nodes.new('ShaderNodeTexNoise');texture.inputs['Scale'].default_value=85
    ramp=edge.node_tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(.35,.35,.35,1);ramp.color_ramp.elements[1].color=(.42,.42,.42,1)
    edge.node_tree.links.new(texture.outputs['Fac'],ramp.inputs[0]);edge.node_tree.links.new(ramp.outputs['Color'],edge_shader.inputs['Roughness'])
    _single_edge(root,iron,edge)
    # The tang passes continuously through a close fitted seat. Its one-sided
    # knuckle flange and low peened pommel distinguish the working hilt.
    outline('Ashsplitter seated blade collar',[(-.029,.116),(-.030,.157),
        (-.024,.183),(.026,.183),(.032,.152),(.030,.116)],.022,iron,root,.0018)
    outline('Ashsplitter forged knuckle flange',[(-.025,.145),(-.090,.127),
        (-.115,.093),(-.105,.082),(-.077,.108),(-.025,.118),(.035,.119),
        (.052,.129),(.047,.145)],.018,iron,root,.0026)
    lathe('Ashsplitter fitted lower ferrule',[(-.118,.023),(-.114,.027),
        (-.108,.027),(-.104,.023)],p['copper'],root)
    outline('Ashsplitter low hooked counterweight',[(-.028,-.113),(-.034,-.144),
        (-.024,-.171),(.012,-.162),(.032,-.146),(.028,-.113)],.020,iron,root,.003)
    # Two peened pins are recessed into the retaining plate, not floating gems.
    for z in (.134,.160):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,
                                           location=(.003,-.023,z))
        pin=bpy.context.object;pin.name='Ashsplitter copper tang pin';pin.parent=root
        pin.scale=(.0038,.0014,.0038);pin.data.materials.append(p['copper'])
        for face in pin.data.polygons:face.use_smooth=True
