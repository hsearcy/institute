"""Author fresh reference measurements onto img2threejs' schema. No prior art inputs."""
import copy
import json
import sys
from pathlib import Path

SKILL = Path.home() / '.codex/skills/img2threejs'
sys.path.insert(0, str(SKILL / 'forge/stage2_spec'))
from new_sculpt_spec import _cnode, make_spec

OUT = Path('docs/hero-img2threejs')
previous=json.loads((OUT/'hero-sculpt-spec.json').read_text()) if (OUT/'hero-sculpt-spec.json').exists() else {}
assessment = json.loads((OUT / 'assessment.json').read_text())
p = assessment['preSpecAssessment']
p['objectClass'].update(primaryType='original hooded human swordsman', primaryDomain='character',
    formLanguage=['organic', 'hard-surface', 'fabric-like'], structureKind=['articulated assembly', 'layered shell'],
    motionPotential=['articulated', 'bendable', 'effect-emitter'], materialFamilies=['cloth', 'metal', 'leather', 'skin', 'hair'],
    notes='Observed only from approved front/rear concept; hidden exact profiles inferred.')
p['complexity']['scores'] = dict(zip(p['complexity']['scores'], [3,3,3,2,3,3,2,3]))
p['complexity']['reasoning'] = ['Adult human anatomy under multiple distinct articulated armor and cloth layers; silhouette depends on open hood and deep cape folds.']
p['specDepthDecision']['rationale'] = 'Separate head/hood/cape/armor and repeated fittings; review from both supplied views and inferred profiles.'
p['unknownsToResolveBeforeImplementation'] = []  # Hidden profile is explicitly resolved as an inference below.
a = json.loads((OUT/'anatomy.json').read_text())
a['anatomy'].update(applies=True, styleHeads=7.5,
    proportions={'headUnit':124/930, 'torso':2.0, 'legs':4.15, 'shoulderWidth':2.78, 'hipWidth':1.5},
    pose={'type':'planted stance with relaxed slightly spread arms; neutral joint frames for rigging', 'jointAngles':{'leftShoulder':[0,0,18], 'rightShoulder':[0,0,-18], 'leftHip':[0,0,6], 'rightHip':[0,0,-6]}},
    faceLandmarks={'hairline':.13,'eyeLine':.43,'eyeSpacing':.30,'noseBase':.63,'mouthLine':.75,'earTop':.42,'earBottom':.66},
    confidence=.85, features=[{'id':'adult-jaw','evidenceRef':'face','note':'Tapering cheeks, broad chin, brow near eye line.'}],
    note='Manual visual measurements: crown57, chin181, eyes109, nose135, mouth150, floor980; full-sheet pixel coordinates.')
p['anatomy'] = a['anatomy']
(OUT/'anatomy.json').write_text(json.dumps(a,indent=2)+'\n')
q = assessment['qualityContract']
q['definitionOfDone'] = ['Reference-derived adult proportions, open teal hood framing recognizable angular face, folded cape with real rear depth, fitted plate and restrained gold borders.', 'Fresh idle/walk/cast/cleave and sockets pass runtime measurements and independent art score >=8/10; no old Blender geometry, rig or textures.']
q['minimumSpecDepth'].update(macroComponents=10,mesoComponents=20,microFeatureGroups=12,materialLayers=6,repetitionSystems=1,reviewViewpoints=8)
s = make_spec('Teal Hooded Swordsman', 'docs/hero-img2threejs/reference/front.png', assessment)
s['suitability']='conditional'
s['coordinateFrame']={'front':'+Z','up':'+Y','scaleReference':'height 2.2 units from sole to hood apex; 7.5 anatomical heads','handedness':'right-handed','characterLeft':'+X'}
s['silhouette'].update(boundingShape='Tapered upright adult with parted legs, compact shoulder armor, pointed open hood and flaring cape', symmetry='bilateral body, asymmetric cape and sword', dominantCurves=['hood arch','cape diagonal folds','breastplate waist taper'],negativeSpaces=['legs','arms against waist','hood opening'])
s['assumptions']=['Exact side contours and concealed skin inferred. Sword and cape posture adapted to playable neutral bind pose.']
s['performanceBudget'].update(targetTriangles=100000,maxDrawCalls=150,fpsTarget=60)
s['qualityTargets']['reviewViewpoints']=['front-three-quarter','orbit-positive','orbit-negative','profile','rear-three-quarter','rear','head-front','head-three-quarter']
s['viewEvidence']=[{'id':name,'view':name,'sourceImage':f'docs/hero-img2threejs/reference/{name}.png','imageRegion':{'x':0,'y':0,'width':1,'height':1,'units':'normalized'},'observations':[note],'confidence':.9} for name,note in [('full-object','Whole approved sheet; see reference-analysis.md'),('front','Front three-quarter anatomy and apparel'),('rear','Rear hood and cape folds'),('face','Angular adult face within hood')]]
s['viewEvidence'][0]['sourceImage']='docs/concepts/math-dungeon-rpg/07-teal-hero.png'
s['lightingFromPhoto']=['Large warm-neutral key light above camera left at [-3,5,4], intensity4; broad soft highlights on plate.', 'Cool fill camera right [4,3,3], intensity1.3; rim light behind [-3,4,-3], intensity3.', 'Neutral grey background #9c9da6; soft ground contact shadow; ACES tone mapping exposure1.0.']
s['referenceCamera'].update(type='perspective',fov=32,azimuthDegrees=-8,elevationDegrees=3,target=[-.327,1.114,0],distance=4.10)
base=copy.deepcopy(s['materials'][0]); mats=[]
for id,color,rough,metal in [('cloth','#008c98',.76,0),('cloth-dark','#07434a',.88,0),('steel','#9ca4a6',.34,1),('gold','#c9953b',.31,1),('leather','#67401f',.69,0),('skin','#cf9664',.63,0),('hair','#352011',.52,0),('eye','#bbbea0',.15,0),('iris','#526047',.19,0),('dark','#1b1714',.85,0),('amber','#e99116',.15,.1)]:
 m=copy.deepcopy(base);m.update(id=id,name=id,color=color,baseColor=color,type='physical',side='double',notes='Palette from approved concept; material evidence authored separately.')
 m['albedo'].update(dominant=color,secondary=[color]);m['colorVariation'].update(palette=[color],amplitude=.025,pattern='fine cloth weave' if 'cloth' in id else 'subtle surface variation')
 m['roughness'].update(base=rough,variation=.06);m['metalness']['base']=metal;m['normal']['strength']=.055
 for band in m['surfaceFrequencyBands']:band['amplitude']*=.1
 m['localOverrides']=[{'id':id+'-edge-response','region':'surface edges','roughness':max(.12,rough-.1),'evidenceRefs':['front'],'notes':'Slight handling polish; preserve saturated clean color.'}]
 if id in ['eye','iris','dark','amber']:
  m['textureless']={'declared':True,'evidence':['Concept eye and iris span fewer than 20 pixels; only smooth optical highlights and color boundaries are visible. Amber jewel has geometric facets with no visible pattern; dark cavities carry no resolved surface detail. No image-derived microtexture is asserted.']}
  for key in ['normal','bump','displacement','surfaceFrequencyBands','textureProjection','textureResolution','referencePbr']:m.pop(key,None)
 mats.append(m)
s['materials']=mats
patch_path=OUT/'material-evidence/reference-pbr-patches.json'
if patch_path.exists():
 patches=json.loads(patch_path.read_text())
 for m in mats:
  source={'cloth-dark':'cloth','skin':'face'}.get(m['id'],m['id'])
  if source in patches:
   m['referencePbr']=copy.deepcopy(patches[source]['referencePbr'])
   m['referencePbr']['interpretation']='Raw extractor estimate only; physical-map acceptance pending. See material-evidence/README.md. Face/hair registered color only, never tile or use their image-derived normals; gold conductor prior pending render.'
   m['referencePbr']['finalMaterialAccepted']=False
   for entry in m['referencePbr']['maps'].values():entry['url']='/@fs'+entry['path']
tree=[]; details=[]
def add(id,pos,scale,mat='cloth',parent='root',level='macro',prim='ellipsoid',top='continuous-sculpt',features=None,recipe=None):
 n=_cnode(id,id.replace('-',' ').title(),prim,parent,pos,scale,material=mat,level=level,role='shell' if 'cloth' in mat else 'body',topology_class=top,topology_rationale='Continuous shaped reference contour; discrete shells overlap at anatomical attachments.',evidence=['front','rear'])
 n['primaryGeometryLayer']='L4' if 'cloth' in mat else ('L0' if mat=='skin' else 'L3')
 color=next(m['color'] for m in mats if m['id']==mat)
 rgb=[int(color[i:i+2],16) for i in (1,3,5)]; rgba=f'rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, 1)'
 n['colorMaterialRecipe']={'dominantAlbedo':rgba,'secondaryAlbedo':rgba,'materialClass':'metal' if mat in ['steel','gold'] else 'fabric' if 'cloth' in mat else 'skin' if mat=='skin' else 'glass' if mat in ['eye','iris','amber'] else 'unknown','materialClassConfidence':.85,'evidenceRefs':['front','rear']}
 if recipe:n['geometryDescriptor']['heroSurface']=recipe
 n['localFeatures']=[]
 for name,kind in features or []:
  n['localFeatures'].append({'id':name,'kind':kind,'description':name.replace('-',' '),'evidenceRefs':['front','rear']})
  details.append({'id':id+'-'+name,'kind':kind,'region':{'x':0,'y':0,'width':1,'height':1},'scale':level,'confidence':.85,'evidenceRef':'front','mapsTo':{'type':'geometry','ref':id+'/'+name},'realization':'geometry'})
 tree.append(n);return n
root=add('root',[0,0,0],[.001,.001,.001],mat='dark',parent=None);root['role']='container';root['actionProfile']['animationRole']='root'
add('pelvis',[0,1.12,0],[.36,.28,.27],mat='cloth-dark',features=[('hip-taper','contour')])
add('cuirass',[0,1.50,0],[.50,.57,.29],mat='steel',features=[('tapered-waist','contour'),('central-keel','ridge'),('gold-panel-borders','bevel')],recipe={'kind':'cuirass','rings':[[1.275,.175,.12],[1.30,.18,.14],[1.55,.255,.175],[1.70,.245,.145],[1.78,.15,.11]],'frontRidge':.04})
add('neck',[0,1.85,0],[.15,.19,.15],mat='skin')
add('head',[0,2.006,.015],[.19,.28,.215],mat='skin',features=[('cheek-jaw-contour','contour'),('orbital-recess','hole'),('nasal-bridge','ridge'),('closed-smile','groove')],recipe={'kind':'head','headHeight':.28,'eyeLine':.43,'noseBase':.63,'mouthLine':.75,'widthHeight':.70,'depthHeight':.77})
add('hood',[0,2.01,-.045],[.37,.43,.34],features=[('pointed-open-contour','contour'),('gold-opening-binding','bevel'),('rear-neck-fold','seam')],recipe={'kind':'hood','opening':[[0,2.20,.08],[.105,2.14,.14],[.157,1.91,.125],[.095,1.82,.08]],'depth':.30,'thickness':.009})
add('cowl',[0,1.80,.025],[.58,.16,.34],features=[('crossing-collar-folds','ridge')],recipe={'kind':'cowl','foldCount':3,'diagonalDrop':.10})
add('cape',[-.19,1.04,-.20],[1.14,1.43,.32],features=[('deep-diagonal-folds','ridge'),('asymmetric-hem-notches','hole'),('gold-binding','bevel'),('gold-hem-motifs','linework')],recipe={'kind':'cape','topY':1.82,'bottomY':.33,'topWidth':.54,'bottomWidth':1.02,'sweepX':-.38,'sweepZ':-.33,'foldAmplitude':.055,'foldCount':5,'thickness':.008})
add('belt',[0,1.255,.02],[.44,.10,.32],mat='leather',level='meso',features=[('waist-wrap','contour'),('angular-gold-buckle','bevel')])
add('harness',[0,1.56,.19],[.42,.075,.022],mat='leather',level='meso',features=[('diagonal-strap','ridge'),('strap-buckle','bevel')],recipe={'kind':'harness','start':[-.19,1.76,.17],'end':[.18,1.35,.16],'width':.056})
add('tabard',[0,.96,.18],[.25,.57,.035],level='macro',prim='extrude',top='conforming-shell',features=[('pointed-panel','contour'),('gold-edge-binding','bevel')],recipe={'kind':'tabard','topY':1.22,'bottomY':.68,'topWidth':.24,'bottomWidth':.20,'z':.19,'foldAmplitude':.023})
for side,sign in [('l',1),('r',-1)]:
 add('upper-arm-'+side,[sign*.345,1.535,0],[.20,.40,.20],features=[('elbow-cloth-folds','ridge')],recipe={'kind':'limb','start':[sign*.29,1.73,0],'end':[sign*.40,1.36,.025],'radiusStart':.105,'radiusEnd':.081})
 add('forearm-'+side,[sign*.435,1.22,.05],[.16,.34,.17],mat='leather',features=[('forearm-taper','contour'),('gold-cuff','bevel')],recipe={'kind':'limb','start':[sign*.40,1.40,.025],'end':[sign*.48,1.065,.06],'radiusStart':.083,'radiusEnd':.060})
 add('hand-'+side,[sign*.49,1.015,.065],[.12,.16,.09],mat='skin',features=[('separate-finger-grip','contour')],recipe={'kind':'hand','side':side,'palmWidth':.094,'fingerLength':.064})
 add('pauldron-'+side,[sign*.295,1.72,0],[.30,.20,.31],mat='steel',features=[('compact-dome','contour'),('layered-gold-lames','bevel')],recipe={'kind':'pauldron','side':side,'radius':.155,'layerCount':3})
 add('thigh-'+side,[sign*.135,.90,0],[.22,.46,.24],mat='cloth-dark',features=[('trouser-folds','ridge')],recipe={'kind':'limb','start':[sign*.105,1.12,0],'end':[sign*.18,.64,.01],'radiusStart':.115,'radiusEnd':.091})
 add('boot-'+side,[sign*.195,.30,.025],[.18,.60,.19],mat='leather',features=[('continuous-shaft-instep','contour'),('ankle-straps','ridge'),('separate-sole','seam')],recipe={'kind':'boot','side':side,'kneeY':.64,'ankleY':.15,'toeZ':.24,'width':.19})
 add('knee-'+side,[sign*.18,.64,.108],[.185,.235,.072],mat='steel',level='meso',prim='extrude',top='conforming-shell',features=[('faceted-shield','ridge'),('gold-knee-rim','bevel')])
 add('pouch-'+side,[sign*.245,1.12,.11],[.13,.19,.09],mat='leather',level='meso',prim='extrude',top='assembled-solid',features=[('dimensional-flap','seam'),('closure-fastener','fastener')])
 add('side-tabard-'+side,[sign*.22,1.005,.07],[.20,.40,.05],level='meso',prim='extrude',top='conforming-shell',features=[('flared-gold-hem','bevel')])
 for part,y in [('upper',1.375),('lower',1.09)]:
  add('bracer-band-'+part+'-'+side,[sign*(.405 if part=='upper' else .47),y,.03],[.18,.045,.18],mat='gold',level='meso')
 for i in range(3):
  add(f'boot-strap-{i}-{side}',[sign*.195,.17+i*.055,.065],[.20,.035,.21],mat='gold' if i==0 else 'leather',level='meso')
add('sword',[-.61,.65,.105],[.075,.98,.025],mat='steel',prim='extrude',top='continuous-sculpt',features=[('tapered-blade-tip','contour'),('long-bevel-planes','bevel')],recipe={'kind':'sword','grip':[-.49,1.035,.075],'tip':[-1.20,.09,.16],'guardWidth':.25,'bladeWidth':.09,'bevel':.018})
add('guard',[-.52,.91,.075],[.26,.12,.04],mat='gold',level='meso',prim='extrude',top='assembled-solid',features=[('angular-quillons','contour')])
add('guard-jewel',[-.52,.91,.10],[.045,.063,.025],mat='amber',level='micro',features=[('amber-diamond-facets','gloss')])
add('clasp',[0,1.77,.19],[.070,.082,.025],mat='gold',level='micro',features=[('diamond-clasp','bevel')])
add('buckle',[0,1.255,.19],[.13,.09,.025],mat='gold',level='micro',features=[('angular-belt-frame','bevel')])
for side,sign in [('l',1),('r',-1)]:
 add('eye-'+side,[sign*.042,2.032,.112],[.040,.019,.016],mat='eye',level='micro',features=[('recessed-eye','gloss')])
 add('brow-'+side,[sign*.043,2.052,.117],[.047,.012,.012],mat='hair',level='micro',features=[('tapered-dark-brow','contour')])
add('hair',[0,2.10,-.002],[.205,.13,.22],mat='hair',level='meso',features=[('parted-root-mass','contour'),('swept-bangs','ridge')],recipe={'kind':'hair','scalpUVRoots':[[.38,.18],[.45,.12],[.56,.13],[.63,.2],[.31,.31],[.70,.33]],'rootEmbedDepth':.009,'standProud':.004,'lockCount':6})
def stance_offset(y):
 return max(0,(1.12-y)/.48*.09) if y>=.64 else .09+(.64-y)/.64*.05
for n in tree:
 if n['id'].startswith(('thigh-','boot-','knee-')):
  sign=1 if n['id'].endswith('-l') else -1
  n['transform']['position'][0]+=sign*stance_offset(n['transform']['position'][1])
  r=n['geometryDescriptor'].get('heroSurface',{})
  r['stanceSpread']={'kneeOffset':.09,'soleOffset':.14,'evidence':'Front boot spread approximately300px versus959px height.'}
  for key in ['start','end']:
   if key in r:r[key][0]+=sign*stance_offset(r[key][1])
for n in tree:
 if n['id'].startswith('upper-arm-'):
  r=n['geometryDescriptor']['heroSurface']
  n['attachment']={'parentSocket':n['id']+'-shoulder','localStart':r['start'],'localEnd':r['end'],'contactType':'rigid-weld','baseRadius':r['radiusStart'],'endRadius':r['radiusEnd'],'embedDepth':.025,'gapTolerance':.001}
  root['actionProfile']['sockets'].append({'id':n['id']+'-shoulder','position':r['start'],'rotation':[0,0,0]})
 if n['primitive']=='extrude':
  n['geometryDescriptor']['profile2D']={'points':[[-.5,.5],[.5,.5],[.5,-.25],[0,-.5],[-.5,-.25]],'depth':1}
  n['geometryDescriptor']['edgeTreatment']={'type':'chamfer','bevelRadius':.003,'segments':2}
# The component tree is an actual garment/anatomy hierarchy; dimensions are baked into geometry.
# Keep global reference recipes separate from parent-local pivots for transparent reconstruction.
by_id={n['id']:n for n in tree}
anchors={n['id']:list(n['attachment']['localStart'] if n.get('attachment') else n['transform']['position']) for n in tree}
for n in tree:
 id=n['id'];parent='root'
 if id in ['cuirass','belt','tabard','cape']:parent='pelvis'
 if id in ['neck','cowl','harness','clasp']:parent='cuirass'
 if id=='head':parent='neck'
 if id in ['hood','hair'] or id.startswith(('eye-','brow-')):parent='head'
 if id=='buckle':parent='belt'
 if id in ['sword','guard','guard-jewel']:parent='hand-r'
 for side in ['l','r']:
  if id in ['upper-arm-'+side,'pauldron-'+side]:parent='cuirass'
  if id=='forearm-'+side:parent='upper-arm-'+side
  if id=='hand-'+side or (id.startswith('bracer-band-') and id.endswith('-'+side)):parent='forearm-'+side
  if id in ['thigh-'+side,'pouch-'+side,'side-tabard-'+side]:parent='pelvis'
  if id=='boot-'+side:parent='thigh-'+side
  if id=='knee-'+side or (id.startswith('boot-strap-') and id.endswith('-'+side)):parent='boot-'+side
 if id=='root':continue
 n['parent']=parent
 n['transform']['position']=[round(x-y,6) for x,y in zip(anchors[id],anchors[parent])]
 if n.get('attachment'):
  for key in ['localStart','localEnd']:n['attachment'][key]=[round(x-y,6) for x,y in zip(n['attachment'][key],anchors[parent])]
  n['attachment']['parentId']=parent
  by_id[parent]['actionProfile']['sockets'].append({'id':n['attachment']['parentSocket'],'position':n['attachment']['localStart'],'rotation':[0,0,0]})
 n['geometryDescriptor']['referenceAnchor']=anchors[id]
s['componentTree']=tree
s['repetitionSystems']=[{'id':'gold-fasteners','component':'clasp','parent':'cuirass','count':8,'distribution':'explicit plate-edge points','geometry':'sphere','buildsGeometry':True,'material':'gold','instances':[[x,y,.17] for x in [-.19,.19] for y in [1.30,1.40,1.50,1.60]]}]
p['detailInventory'].update(details=details,targetMinDetails=30)
p['complexity']['estimatedCounts']={'macroComponents':sum(c['level']=='macro' for c in tree),'mesoComponents':sum(c['level']=='meso' for c in tree),'microFeatureGroups':len(details),'materialLayers':len(mats),'repetitionSystems':1}
s['preSpecAssessment']=p;s['qualityContract']=q
ids=[n['id'] for n in tree]
for bp in s['buildPasses']:
 bp['componentRefs']=[n['id'] for n in tree if bp['id']!='blockout' or n['level']=='macro']
s['featureReviewTargets']=[{'id':id,'name':name,'tier':'critical','passIds':passes,'minimumScore':.8,'mustPass':True,'componentRefs':refs,'evidenceRefs':['front','rear']} for id,name,passes,refs in [
 ('anatomy-proportion','7.5 heads and fitted armored adult silhouette',['blockout','structural-pass'],['head','cuirass','boot-l','boot-r']),
 ('pose-silhouette','Open hood, parted legs and substantial swept cape',['blockout','structural-pass'],['hood','cape','thigh-l','thigh-r']),
 ('face-landmark-placement','Angular face, small eyes, brows and swept hair',['form-refinement'],['head','eye-l','eye-r','hair']),
 ('outfit-and-palette','Vivid teal, steel plate and restrained gold trim',['material-pass','surface-pass','lighting-pass'],['hood','cuirass','cape','belt'])]]
s['proceduralStrategy']=['Use img2threejs generated stable semantic hierarchy; replace only current-pass geometry with reference-authored heroSurface recipes when its generic primitive cannot express the contour.', 'Continuous swept and lofted surfaces for face, hood, cape, boots and cuirass. Preserve the measured spec parameters and generate every vertex afresh.']
cloth_decisions=OUT/'cloth-surface-decisions.json'
if cloth_decisions.exists():s['clothSurfaceDecisions']=json.loads(cloth_decisions.read_text())
(OUT/'assessment.json').write_text(json.dumps(assessment,indent=2)+'\n')
for key in ['reviewHistory','sculptPipeline','tier1Diagnostics']:
 if key in previous:s[key]=previous[key]
(OUT/'hero-sculpt-spec.json').write_text(json.dumps(s,indent=2)+'\n')
(OUT/'detail-inventory.json').write_text(json.dumps(p['detailInventory'],indent=2)+'\n')
print(f'Authored {len(tree)} semantic parts and {len(details)} linked details.')
