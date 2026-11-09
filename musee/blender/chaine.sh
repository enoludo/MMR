#!/bin/zsh
# Chaîne lightmap après salle.py : chaine.sh RES [oeuvre]   (oeuvre : seuil par défaut, huntington, ou
# rotonde : la rotonde de Huntington, faite par rotonde.py, aux faces triangulées ;
# pavillon : la salle de « Souffle d'éclats », faite par pavillon.py, aux faces triangulées)
set -e
RES=$1
OE=${2:-seuil}
if [[ $OE == seuil ]]; then D=salle; P=""; else D=salle-$OE; P="$OE-"; fi
B=/Applications/Blender.app/Contents/MacOS/Blender
# Pillow pour lightmap.py : dossier installé avec le Python de Blender (voir CLAUDE.md, « Chaîne 3D »)
PYLIB=${PYLIB:?indiquer dans PYLIB le dossier où Pillow est installé}
S=${TMPDIR:-/tmp}
cd /Users/ludovicenault/MMR/musee/blender
run() { $B -b --python-use-system-env -P "$@" 2>&1 | grep -E "Error|Traceback|error:" || true; }
if [[ $OE == rotonde || $OE == pavillon ]]; then FORME=triangles; else FORME=""; fi
run masque.py -- $D/salle.blend Salle $RES $D/lightmap-masque.exr $FORME
run masque.py -- $D/salle.blend Mobilier $RES $D/lightmap-mobilier-masque.exr $FORME
run denoise.py -- $D/lightmap.exr $D/lightmap-dn.exr $D/lightmap-masque.exr
run denoise.py -- $D/lightmap-mobilier.exr $D/lightmap-mobilier-dn.exr $D/lightmap-mobilier-masque.exr
# Rotonde : lissage îlot par îlot qui garde les ombres (taches de la lumière renvoyée, voir lissage.py)
if [[ $OE == rotonde ]]; then
  run lissage.py -- $D/lightmap-dn.exr $D/lightmap-masque.exr $D/lightmap-dn.exr 7 0.2
  run lissage.py -- $D/lightmap-mobilier-dn.exr $D/lightmap-mobilier-masque.exr $D/lightmap-mobilier-dn.exr 10 0.2
fi
export PYTHONPATH=$PYLIB
run lightmap.py -- $D/lightmap-dn.exr ../public/models/${P}salle-lightmap.webp
# Percentile de l'échelle du mobilier : plus bas quand le socle a une lueur (écrêtée, voir lightmap.py). Pas le
# pavillon depuis le 07/11 : la flaque du puits, large, était écrêtée en un plateau blanc
if [[ $OE == huntington || $OE == rotonde ]]; then PCT=98; else PCT=99.95; fi
run lightmap.py -- $D/lightmap-mobilier-dn.exr ../public/models/${P}salle-lightmap-mobilier.webp $PCT
mv ../public/models/${P}salle-lightmap.json ../src/salles/provisoire/${P}lightmap.json
mv ../public/models/${P}salle-lightmap-mobilier.json ../src/salles/provisoire/${P}lightmap-mobilier.json
cd ..
npx --yes @gltf-transform/cli optimize blender/$D/salle-raw.glb $S/salle-opt.glb --compress false --simplify false --join false 2>&1 | tail -1
# Grille de quantification commune à toute la scène : les sommets partagés par le sol et le carré
# de sol fin (deux objets) restent exactement confondus, sans fissure entre eux
npx --yes @gltf-transform/cli meshopt $S/salle-opt.glb public/models/${P}salle.glb --quantization-volume scene --quantize-position 16 --quantize-texcoord 14 2>&1 | tail -1
# Lightmaps en KTX2 (lues par le site ; les WebP restent la source) : ≈ 35 s chacune
node blender/ktx2.mjs public/models/${P}salle-lightmap.webp &
node blender/ktx2.mjs public/models/${P}salle-lightmap-mobilier.webp
wait
ls -la public/models/${P}salle* src/salles/provisoire/${P}*.json
