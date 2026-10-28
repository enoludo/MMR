#!/bin/bash
# Double-clic dans le Finder : met le site en ligne sur Vercel.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
clear
echo "=============================================="
echo "  Mise en ligne du Musée des Maladies Rares"
echo "=============================================="
echo

if ! npx --yes vercel@latest whoami >/dev/null 2>&1; then
  echo "ÉTAPE 1 : connexion à ton compte Vercel"
  echo "Une page va s'ouvrir dans ton navigateur (sinon, clique sur le lien affiché)."
  echo "Valide la connexion dans le navigateur, puis reviens sur cette fenêtre."
  echo
  npx --yes vercel@latest login || { echo; echo "La connexion n'a pas abouti."; read -n 1 -s -r -p "Appuie sur une touche pour fermer."; exit 1; }
  echo
fi

echo "ÉTAPE 2 : envoi du site (environ une minute)…"
echo
npx --yes vercel@latest --prod --yes
echo
echo "=============================================="
echo "  Terminé. L'adresse à partager est celle"
echo "  qui finit par .vercel.app, juste au-dessus"
echo "  (ligne « Aliased » ou « Production »)."
echo "=============================================="
read -n 1 -s -r -p "Appuie sur une touche pour fermer cette fenêtre."
