#!/bin/zsh
# Ombre de la statue seule (06/11), après salle.py / rotonde.py et chaine.sh :
#   PYLIB=<dossier de Pillow> ombre-statue.sh seuil|rotonde [échantillons]
# Recalcule le mobilier sans la statue (sans-statue.py, ≈ 17 min en 2048 échantillons), le débruite
# comme chaine.sh, puis écrit public/models/<préfixe>ombre-statue.png (ombre-statue.py).
# À refaire si la salle, la lumière ou la statue changent.
set -e
OE=$1
ECH=${2:-2048}
if [[ $OE == seuil ]]; then D=salle; P=""; LIMITE=3; else D=salle-$OE; P="$OE-"; LIMITE=1; fi
B=/Applications/Blender.app/Contents/MacOS/Blender
PYLIB=${PYLIB:?indiquer dans PYLIB le dossier où Pillow est installé}
cd /Users/ludovicenault/MMR/musee/blender
run() { $B -b --python-use-system-env -P "$@" 2>&1 | grep -E "Error|Traceback|error:|BAKE|OMBRE" || true; }
[[ -f $D/lightmap-mobilier-sans.exr && $D/lightmap-mobilier-sans.exr -nt $D/salle.blend ]] || run sans-statue.py -- $D $ECH $LIMITE
run denoise.py -- $D/lightmap-mobilier-sans.exr $D/lightmap-mobilier-sans-dn.exr $D/lightmap-mobilier-masque.exr
if [[ $OE == rotonde ]]; then
  run lissage.py -- $D/lightmap-mobilier-sans-dn.exr $D/lightmap-mobilier-masque.exr $D/lightmap-mobilier-sans-dn.exr 10 0.2
fi
PYTHONPATH=$PYLIB run ombre-statue.py -- $D/lightmap-mobilier-dn.exr $D/lightmap-mobilier-sans-dn.exr $D/lightmap-mobilier-masque.exr ../public/models/${P}ombre-statue.png
ls -la ../public/models/${P}ombre-statue.png
