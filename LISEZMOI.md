# Markarto

Hiroshima, Nagasaki, et la même empreinte posée sur Rennes : un récit cartographique.
Projet du Master SIGAT (Université Rennes 2) avec Ouest-France, refonte graphique du site
[chipscrevette.github.io/MAKARTO_OFC](https://chipscrevette.github.io/MAKARTO_OFC/).

Sur ordinateur, le récit avance au défilement : la carte reste en fond et les textes passent devant.
Sur téléphone, le récit devient une suite d'écrans, comme des stories : on touche à droite pour avancer.

## Ouvrir le site sur son ordinateur

Les cartes détaillées du Pacifique sont chargées à la demande, ce qui demande un petit serveur local
(un double-clic sur `index.html` affiche le site, mais sans ces détails). Au choix :

- avec VS Code : extension « Live Server », clic droit sur `index.html`, « Open with Live Server » ;
- avec Python, depuis ce dossier : `python3 -m http.server`, puis ouvrir http://localhost:8000.

## Organisation des fichiers

```
markarto/
├── index.html                 Le texte et la structure du récit (aucun style, aucun script dedans)
├── LISEZMOI.md                Ce fichier
│
├── styles/                    L'apparence, un fichier par partie de la page, chargés dans l'ordre
│   ├── 01-base.css            Couleurs, police, réglages communs
│   ├── 02-barre-du-haut.css   Barre de progression et menu des chapitres
│   ├── 03-ouverture.css       Le grand titre du début
│   ├── 04-texte-courant.css   Les paragraphes entre les cartes
│   ├── 05-carte-du-recit.css  La carte fixe, les cartes de texte, la légende, les étiquettes
│   ├── 06-coulisses-sig.css   La pile de couches « Coulisses SIG »
│   ├── 07-pied-de-page.css    La phrase de fin
│   ├── 08-telephone.css       Adaptations pour les écrans de moins de 900 px
│   └── 09-lecteur-telephone.css  Le lecteur façon stories du téléphone
│
├── scripts/                   Le comportement, un fichier par partie, chargés dans l'ordre du numéro
│   ├── 01-reglages.js         Constantes, les trois villes et leurs lieux, état du lecteur téléphone
│   ├── 02-outils-geographiques.js  Projection Mercator, distances, tracés
│   ├── 03-villes.js           Fonds de carte des villes, cadrage, dessin des zones détruites
│   ├── 04-pacifique-donnees.js     Couleurs, lieux, flèches et étapes du chapitre Pacifique
│   ├── 05-pacifique-dessin.js      Dessin de la carte du Pacifique (terres, flèches, étiquettes)
│   ├── 06-bilan-bombes.js     Le schéma « Deux bombes, deux bilans »
│   ├── 07-scene-carte.js      La carte principale : quelle scène afficher, transitions, étiquettes
│   ├── 08-pacifique-camera.js La caméra du Pacifique qui suit le défilement en douceur
│   ├── 09-recit-defilement.js Les étapes du récit, les boutons déclencheurs, la planche contact
│   ├── 10-coulisses-sig.js    La pile de couches qui se sépare au défilement
│   ├── 11-navigation-textes.js  Menu des chapitres, progression, textes épinglés
│   ├── 12-mini-carte.js       La mini-carte de situation du téléphone
│   ├── 13-lecteur-telephone.js  Le lecteur façon stories du téléphone
│   └── 14-demarrage.js        Le lancement de tout, une fois les images et la police chargées
│
├── donnees/                   Les données géographiques (des valeurs, aucune logique)
│   ├── villes.js              Zones rasées et endommagées des trois villes
│   ├── pacifique.js           Terres du Pacifique, version légère
│   ├── pacifique-detail-moyen.json  Terres du Pacifique plus détaillées (chargées au zoom)
│   ├── pacifique-detail-fin.json    Terres du Pacifique très détaillées (chargées au zoom)
│   └── france.js              Contours de la France et de la Bretagne (mini-carte)
│
├── images/
│   ├── fonds-de-carte/        Eau, rues et bâti de chaque ville, en masques à 3 m par pixel
│   └── photos/                Les cinq photos d'archives du chapitre Pacifique
│
└── outils/                    Les scripts Python qui ont fabriqué les données (voir outils/LISEZMOI.md)
```

## Comment le code est écrit

- Les noms sont en français et disent ce qu'ils contiennent : `VILLES`, `dessinerVille`, `cadrageVille`,
  `allerAEcran`. Les constantes sont en MAJUSCULES, les fonctions et variables en minuscules.
- Chaque fichier commence par un bloc qui explique son rôle, ce qu'il utilise et ce qu'il fournit,
  puis il est découpé en blocs numérotés.
- Les scripts ne sont pas des modules : ils partagent leurs noms. Un nom déclaré dans `01-reglages.js`
  est utilisable dans tous les fichiers suivants, d'où l'ordre de chargement dans `index.html`.
- Dans les fonctions de dessin, quelques noms courts reviennent partout : `W` et `H` (largeur et hauteur
  du canevas en pixels réels), `d` (densité de l'écran), `lo` et `la` (longitude et latitude en degrés).

## Sources

Bâtiments, rues, eau et frontières : Overture Maps (données OpenStreetMap), version 2026-09-23.0.
Zones détruites : cartes de l'US Army Map Service (1945-1946), Stanford University Libraries,
géoréférencées et numérisées par l'équipe du projet.
