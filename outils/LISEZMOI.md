# Outils de préparation des données

Ces scripts Python ont servi à fabriquer les données du site Markarto
(cartes de Hiroshima, Nagasaki et Rennes, et grande carte du Pacifique).
Le site lui-même n'en a pas besoin pour fonctionner : ils servent seulement
à refaire les données si besoin.

Toutes les données géographiques viennent d'Overture Maps, version
`2026-09-23.0`.

## Ce qu'il faut installer

Python 3.9 ou plus récent, puis :

```
pip install pyarrow shapely pillow numpy pandas
```

Le téléchargement utilise un accès public à Amazon S3 : aucun compte n'est
nécessaire, il faut seulement une connexion Internet.

## Les quatre scripts, dans l'ordre

Conseil : lancez les scripts dans un dossier de travail (par exemple
`travail/`), hors du site. Les fichiers téléchargés sont gros et n'ont rien
à faire dans le site.

### 1. `1_telecharger_overture.py` : télécharger les données brutes

Trois sous-commandes :

| Commande | Ce qu'elle télécharge | Fichiers produits |
|---|---|---|
| `villes hiroshima` | routes, eau, bâtiments | `hiroX_roads.parquet`, `hiroX_water.parquet`, `hiroX_bld.parquet` |
| `villes rennes` | routes, eau, bâtiments | `renX_roads.parquet`, `renX_water.parquet`, `renX_bld.parquet` |
| `villes nagasaki --emprise O S E N` | routes, eau, bâtiments | `naga_roads.parquet`, `naga_water.parquet`, `naga_bld.parquet` |
| `pacifique` | pays, régions, dépendances | `div.parquet`, `dep.parquet`, `east.parquet` |
| `france` | France et ses régions | `france.parquet` |

Exemples :

```
python3 1_telecharger_overture.py villes hiroshima
python3 1_telecharger_overture.py pacifique
python3 1_telecharger_overture.py france
python3 1_telecharger_overture.py --help
```

Les emprises de Hiroshima et de Rennes sont écrites en tête du script.
Celle de Nagasaki n'a pas été conservée : il faut la donner en degrés
(ouest, sud, est, nord) avec `--emprise`. Elle doit couvrir au moins le
rectangle du fond de carte (5,5 km à l'ouest, 4 km à l'est, 3,5 km au nord
et au sud de l'hypocentre).

Le téléchargement du Pacifique est long (le fichier `div.parquet` pèse
environ 200 Mo).

### 2. `2_terres_pacifique.py` : terres du Pacifique par catégorie

Range chaque pays (ou région) dans une catégorie : Japon en 1930, conquêtes
de 1938 et de 1942, Alliés, URSS, pays neutres. Il simplifie les contours
en trois niveaux de détail, du plus léger au plus fin :

```
python3 2_terres_pacifique.py 0.04 0.0006 pac.json 2
python3 2_terres_pacifique.py 0.01 0.0001 pac_l1.json 2
python3 2_terres_pacifique.py 0.0025 0.00002 pac_l2.json 3 95,-30,212,56
```

Paramètres : tolérance de simplification (en degrés), surface minimale
d'une île (en degrés carrés), fichier de sortie, nombre de décimales, et
en option la fenêtre gardée `ouest,sud,est,nord`.
Il lit `div.parquet`, `dep.parquet` et `east.parquet` dans le dossier
courant (ou dans `--donnees DOSSIER`).

### 3. `3_contours_france.py` : contours de la France et de la Bretagne

```
python3 3_contours_france.py
```

Lit `france.parquet`, écrit `fr.json` (contours simplifiés à 0,02°).

### 4. `4_fonds_de_carte_villes.py` : fonds de carte des villes

Dessine pour chaque ville trois images WebP, à 3 mètres par pixel :
les bâtiments (`bati`), les rues (`rues`) et l'eau (`eau`).

```
cd outils
python3 4_fonds_de_carte_villes.py --donnees ../../travail
```

Il lit dans le dossier de données les fichiers `.parquet` des villes et
`geoN.json` (la mer autour de chaque ville, issue d'un traitement antérieur
qui n'est pas repris ici). Les images sont écrites directement dans
`../images/fonds-de-carte/` (option `--sortie` pour changer).

Il recopie aussi l'emprise de chaque ville (clé `box`) dans `villes.json`
si ce fichier existe (option `--villes-json`). Ce fichier contient aussi
les zones détruites (`total` et `partial`), qui viennent d'un traitement
antérieur.

On peut traiter une seule ville : `--villes nagasaki`.

## Où copier les résultats dans le site

| Fichier produit | Place dans le site |
|---|---|
| `hiroshima-bati.webp`, etc. (9 images) | `images/fonds-de-carte/` (écrit directement) |
| `villes.json` | `donnees/villes.js` |
| `pac.json` | `donnees/pacifique.js` |
| `pac_l1.json` | `donnees/pacifique-detail-moyen.json` |
| `pac_l2.json` | `donnees/pacifique-detail-fin.json` |
| `fr.json` | `donnees/france.js` |

Les deux fichiers `.json` du Pacifique détaillé sont copiés tels quels
(renommés). Le site les charge seulement quand on zoome.

Les fichiers `.js` sont les fichiers `.json` précédés d'une ligne
`const NOM = ` et suivis d'un `;`. Le nom à utiliser :

| Fichier du site | Début du fichier |
|---|---|
| `donnees/villes.js` | `const DONNEES_VILLES = ` |
| `donnees/pacifique.js` | `const TERRES_PACIFIQUE = ` |
| `donnees/france.js` | `const CONTOURS_FRANCE = ` |

Les fichiers actuels ont en plus deux lignes de commentaire en tête, qui
décrivent leur contenu. Pensez à les garder.

Exemple pour le Pacifique :

```
( echo "// Terres du Pacifique, version légère (simplifiée à 0,04°), par catégorie : Japon 1930, conquêtes 1938 et 1942, Alliés, URSS, neutres."
  echo "// Fichier de données : ne contient que des valeurs, pas de logique."
  printf "const TERRES_PACIFIQUE = "; cat pac.json; echo ";" ) > ../markarto/donnees/pacifique.js
```
