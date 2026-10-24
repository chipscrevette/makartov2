"""
2_terres_pacifique.py

BUT
    Fabriquer les terres du Pacifique, classées par catégorie, pour la grande
    carte du récit (expansion japonaise, Alliés, URSS, pays neutres).

ENTRÉES (dans le dossier de données, par défaut le dossier courant)
    div.parquet   pays et régions entre 60° E et 180° (Overture Maps)
    dep.parquet   dépendances (territoires rattachés) de la même zone
    east.parquet  pays, régions et dépendances entre 180° W et 150° W
    Ces trois fichiers sont produits par : 1_telecharger_overture.py pacifique

SORTIE
    Un fichier JSON : une liste de [catégorie, liste de contours].
    Chaque contour est une liste de points [longitude, latitude].
    Catégories :
        j30   Japon et territoires japonais en 1930
        j38   conquêtes japonaises jusqu'en 1938
        j42   conquêtes japonaises jusqu'en 1942
        j42n  Thaïlande (alliée du Japon, non occupée)
        al    Alliés
        su    Union soviétique
        ne    pays neutres ou hors du conflit

COMMANDES UTILISÉES POUR LE SITE
    python3 2_terres_pacifique.py 0.04 0.0006 pac.json 2
    python3 2_terres_pacifique.py 0.01 0.0001 pac_l1.json 2
    python3 2_terres_pacifique.py 0.0025 0.00002 pac_l2.json 3 95,-30,212,56

    Les 4 premiers paramètres sont : tolérance de simplification (en degrés),
    surface minimale d'une île (en degrés carrés), fichier de sortie, nombre
    de décimales. Le 5e (facultatif) est la fenêtre gardée :
    "ouest,sud,est,nord" en degrés.
"""

import argparse
import json
import os
from collections import Counter

import pandas as pd
import pyarrow.parquet as pq
from shapely import affinity, wkb
from shapely.geometry import box
from shapely.ops import unary_union


# ---------------------------------------------------------------------------
# RÉGLAGES
# ---------------------------------------------------------------------------

# Valeurs par défaut des paramètres de la ligne de commande
TOLERANCE_PAR_DEFAUT = 0.06          # simplification des contours, en degrés
SURFACE_MINI_PAR_DEFAUT = 0.0012     # les îles plus petites sont retirées
FICHIER_SORTIE_PAR_DEFAUT = "pac.json"
DECIMALES_PAR_DEFAUT = 2
FENETRE_PAR_DEFAUT = (60, -48, 215, 72)  # ouest, sud, est, nord

# Fichiers d'entrée (produits par 1_telecharger_overture.py)
FICHIERS_ENTREE = ["div.parquet", "dep.parquet", "east.parquet"]

# Ce fichier couvre l'est de la ligne de changement de date (longitudes
# négatives). On le décale de 360° pour que le Pacifique soit d'un seul tenant.
FICHIER_A_DECALER = "east.parquet"

# Pays rangés dans chaque catégorie (codes ISO à 2 lettres, plus quelques
# codes "X.." utilisés par Overture pour des territoires disputés)
PAYS_JAPON_1930 = {"JP", "KR", "KP", "TW", "PW", "MH", "FM", "MP",
                   "XA", "XI", "XO", "XU", "XD", "XB"}
PAYS_CONQUIS_1942 = {"ID", "TL", "PH", "MY", "SG", "BN", "MM", "TH", "VN",
                     "LA", "KH", "HK", "GU", "NR", "SB"}
PAYS_ALLIES = {"IN", "PK", "BD", "LK", "AU", "NZ", "US", "FJ", "VU", "NC",
               "TV", "WS", "TO", "AS", "CK", "MU", "XL", "XQ", "XX", "NF",
               "CX", "CC", "IO", "MO"}
PAYS_URSS = {"RU", "KZ", "KG", "TJ", "TM", "UZ"}

# Provinces chinoises occupées par le Japon en 1938 et en 1942
PROVINCES_CHINE_1938 = {"CN-HL", "CN-JL", "CN-LN", "CN-HE", "CN-BJ", "CN-TJ",
                        "CN-SD", "CN-SX", "CN-JS", "CN-SH"}
PROVINCES_CHINE_1942 = {"CN-AH", "CN-ZJ", "CN-HB", "CN-GD", "CN-HI"}

# Pays découpés région par région (on ignore leur contour national)
PAYS_DECOUPES_PAR_REGION = ("CN", "RU", "US", "UM", "KI")
# Pays dont on ignore le contour national (la Papouasie est traitée à part)
PAYS_SANS_CONTOUR_NATIONAL = ("CN", "RU", "US", "UM", "KI", "PG")

# Îles sur lesquelles le récit zoome : elles sont gardées en détail
# (Hawaï, Midway, Iwo Jima, Saipan et Tinian, Okinawa, Kwajalein, Tarawa, Peleliu)
ZONES_DETAILLEES = unary_union([
    box(199, 18.5, 206, 22.5),
    box(182.5, 28.1, 182.8, 28.3),
    box(141.2, 24.7, 141.4, 24.85),
    box(145.4, 14.8, 146, 15.4),
    box(127.5, 26, 128.4, 26.95),
    box(167, 8.6, 168, 9.5),
    box(172.8, 1.3, 173.2, 1.65),
    box(134.1, 6.9, 134.7, 7.8),
])
TOLERANCE_DETAIL = 0.002        # simplification dans les zones détaillées
SURFACE_MINI_DETAIL = 0.000005  # surface minimale dans les zones détaillées
DECIMALES_DETAIL = 3

# Découpages manuels (boîtes en degrés : ouest, sud, est, nord)
SAKHALINE_SUD = box(0, 0, 400, 50)          # sud de Sakhaline, japonais en 1930
KIRIBATI_OUEST = box(0, -50, 181, 50)        # îles Gilbert, conquises en 1942
PAPOUASIE_NORD = box(0, -7, 400, 50)         # nord de la Papouasie, occupé


# ---------------------------------------------------------------------------
# FONCTIONS
# ---------------------------------------------------------------------------

def lire_parametres():
    """Lit les paramètres de la ligne de commande."""
    p = argparse.ArgumentParser(
        description="Fabrique les terres du Pacifique par catégorie.")
    p.add_argument("tolerance", nargs="?", type=float,
                   default=TOLERANCE_PAR_DEFAUT,
                   help="tolérance de simplification, en degrés")
    p.add_argument("surface_mini", nargs="?", type=float,
                   default=SURFACE_MINI_PAR_DEFAUT,
                   help="surface minimale d'une île, en degrés carrés")
    p.add_argument("sortie", nargs="?", default=FICHIER_SORTIE_PAR_DEFAUT,
                   help="fichier JSON à écrire")
    p.add_argument("decimales", nargs="?", type=int,
                   default=DECIMALES_PAR_DEFAUT,
                   help="nombre de décimales gardées")
    p.add_argument("fenetre", nargs="?", default=None,
                   help='fenêtre gardée "ouest,sud,est,nord" (en degrés)')
    p.add_argument("--donnees", default=".",
                   help="dossier où se trouvent les fichiers .parquet")
    return p.parse_args()


def lire_divisions(dossier):
    """Lit les trois fichiers .parquet et garde seulement les terres.

    La colonne "src" retient le nom du fichier d'origine de chaque ligne.
    """
    tables = []
    for nom in FICHIERS_ENTREE:
        chemin = os.path.join(dossier, nom)
        tables.append(pq.read_table(chemin).to_pandas().assign(src=nom))
    divisions = pd.concat(tables)
    return divisions[divisions["class"] == "land"]


def polygones_de(geometrie):
    """Renvoie la liste des polygones simples contenus dans une géométrie."""
    if geometrie.geom_type == "Polygon":
        return [geometrie]
    return [p for p in getattr(geometrie, "geoms", [])
            if p.geom_type == "Polygon"]


def contour_arrondi(polygone, decimales):
    """Renvoie le contour extérieur d'un polygone, coordonnées arrondies."""
    return [[round(x, decimales), round(y, decimales)]
            for x, y in polygone.exterior.coords]


class Terres:
    """Rassemble les terres par catégorie, prêtes à écrire en JSON."""

    def __init__(self, fenetre, tolerance, surface_mini, decimales):
        self.fenetre = fenetre
        self.tolerance = tolerance
        self.surface_mini = surface_mini
        self.decimales = decimales
        self.liste = []  # éléments [catégorie, liste de contours]

    def ajouter(self, categorie, geometrie):
        """Ajoute une terre dans une catégorie.

        1. On garde seulement la partie dans la fenêtre.
        2. La partie dans une zone détaillée est simplifiée finement.
        3. Le reste est simplifié selon la tolérance choisie, et les
           îles trop petites sont retirées.
        """
        geometrie = geometrie.intersection(self.fenetre)
        if geometrie.is_empty:
            return

        # Partie détaillée (îles du récit)
        detail = geometrie.intersection(ZONES_DETAILLEES)
        if not detail.is_empty:
            detail = detail.simplify(TOLERANCE_DETAIL, preserve_topology=True)
            contours = [contour_arrondi(p, DECIMALES_DETAIL)
                        for p in polygones_de(detail)
                        if p.area > SURFACE_MINI_DETAIL]
            if contours:
                self.liste.append([categorie, contours])
            geometrie = geometrie.difference(ZONES_DETAILLEES)

        # Partie ordinaire
        geometrie = geometrie.simplify(self.tolerance, preserve_topology=True)
        contours = []
        for p in polygones_de(geometrie):
            if p.area < self.surface_mini:
                continue
            contours.append(contour_arrondi(p, self.decimales))
        if contours:
            self.liste.append([categorie, contours])


def categorie_du_pays(pays):
    """Catégorie d'un pays traité en entier (sans découpage)."""
    if pays in PAYS_JAPON_1930:
        return "j30"
    if pays in PAYS_CONQUIS_1942:
        # La Thaïlande a sa propre catégorie
        return "j42n" if pays == "TH" else "j42"
    if pays in PAYS_ALLIES:
        return "al"
    if pays in PAYS_URSS:
        return "su"
    return "ne"


def ranger_une_division(terres, ligne):
    """Range une ligne du tableau (un pays ou une région) dans sa catégorie."""
    geometrie = wkb.loads(ligne.geometry)
    if ligne.src == FICHIER_A_DECALER:
        geometrie = affinity.translate(geometrie, 360)

    pays = ligne.country
    type_division = ligne.subtype
    # str() donne "nan" quand la région est vide
    region = str(ligne.region)

    # Ces pays sont traités région par région (ou à part pour la Papouasie)
    if pays in PAYS_SANS_CONTOUR_NATIONAL and type_division == "country":
        return
    # On ne garde les régions que pour les pays découpés
    if type_division == "region" and pays not in PAYS_DECOUPES_PAR_REGION:
        return

    if pays == "CN":
        if region in PROVINCES_CHINE_1938:
            terres.ajouter("j38", geometrie)
        elif region in PROVINCES_CHINE_1942:
            terres.ajouter("j42", geometrie)
        else:
            terres.ajouter("al", geometrie)
        return

    if pays == "RU":
        if region == "RU-SAK":
            # Sakhaline : le sud était japonais, le nord soviétique
            terres.ajouter("j30", geometrie.intersection(SAKHALINE_SUD))
            terres.ajouter("su", geometrie.difference(SAKHALINE_SUD))
        else:
            terres.ajouter("su", geometrie)
        return

    if pays == "UM":
        # Îles mineures des États-Unis : l'île de Wake (UM-79) est conquise
        terres.ajouter("j42" if region == "UM-79" else "al", geometrie)
        return

    if pays == "KI":
        # Kiribati : les îles Gilbert (KI-G, ou sans région) sont conquises
        conquis = region == "KI-G" or region == "nan"
        terres.ajouter("j42" if conquis else "al",
                       geometrie.intersection(KIRIBATI_OUEST))
        terres.ajouter("al", geometrie.difference(KIRIBATI_OUEST))
        return

    if pays == "US":
        terres.ajouter("al", geometrie)
        return

    terres.ajouter(categorie_du_pays(pays), geometrie)


def ranger_papouasie(terres, divisions):
    """Papouasie-Nouvelle-Guinée, à la main : nord occupé, sud allié."""
    lignes = divisions[(divisions.country == "PG")
                       & (divisions.subtype == "country")]
    for _, ligne in lignes.iterrows():
        geometrie = wkb.loads(ligne.geometry)
        terres.ajouter("j42", geometrie.intersection(PAPOUASIE_NORD))
        terres.ajouter("al", geometrie.difference(PAPOUASIE_NORD))


def main():
    parametres = lire_parametres()
    if parametres.fenetre:
        fenetre = box(*map(float, parametres.fenetre.split(",")))
    else:
        fenetre = box(*FENETRE_PAR_DEFAUT)

    divisions = lire_divisions(parametres.donnees)
    terres = Terres(fenetre, parametres.tolerance,
                    parametres.surface_mini, parametres.decimales)

    for _, ligne in divisions.iterrows():
        ranger_une_division(terres, ligne)
    ranger_papouasie(terres, divisions)

    # Petit bilan à l'écran
    print("Régions de Kiribati :",
          set(map(str, divisions[divisions.country == "KI"].region)))
    nombre_points = sum(len(contour) for _, contours in terres.liste
                        for contour in contours)
    print("Éléments par catégorie :",
          Counter(categorie for categorie, _ in terres.liste))
    print("Nombre de points :", nombre_points)

    with open(parametres.sortie, "w") as f:
        json.dump(terres.liste, f, separators=(",", ":"))
    print("Fichier écrit :", parametres.sortie,
          os.path.getsize(parametres.sortie), "octets")


if __name__ == "__main__":
    main()
