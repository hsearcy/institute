"""Pack only the temporary candidate GLB with the shared atlas optimizer."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[3]
script=root/'scripts/blender/detailed/optimize_assets.py'
sys.path.insert(0,str(script.parent))
sys.argv=[str(script),'wraith-candidate']
code=script.read_text().replace("OUT=ROOT/'web/public/assets/rpg'", "OUT=ROOT/'web/public/assets/rpg/review'")
code=code.replace("ROOT/'scripts/blender/textures'", "ROOT/'scripts/blender/experiments/exports/maps'")
exec(compile(code,str(script),'exec'),{'__file__':str(script),'__name__':'__main__'})
