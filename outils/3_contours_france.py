"""
3_contours_france.py

BUT
    Fabriquer les contours simplifiés de la France métropolitaine et de la
    Bretagne, pour la mini-carte de situation de Rennes.

ENTRÉE
    france.parquet : contour du pays et des régions françaises (Overture Maps).
    Ce fichier est produit par : 1_telecharger_overture.py france

SORTIE
    fr.json : {"fr": [contours], "bre": [contours]}
    Chaque contour est une liste de points [longitude, latitude].

COMMANDE
    python3 3_contours_france.py
    (options : --entree france.parquet --sortie fr.json)
"""

import argparse
import json

import pyarrow.parquet as pq
from shapely import wkb


# ---------------------------------------------------------------------------
# RÉGLAGES
# ---------------------------------------------------------------------------

FICHIER_ENTREE = "france.parquet"
FICHIER_SORTIE = "fr.json"

CODE_BRETAGNE = "FR-BRE"

TOLERANCE = 0.02     # simplification des contours, en degrés
DECIMALES = 3        # décimales gardées dans les coordonnées

# Un morceau est gardé si sa surface dépasse TOLERANCE x TOLERANCE x ce facteur
FACTEUR_SURFACE_MINI = 20

# Limites ouest et sud de la métropole, en degrés : les morceaux qui
# commencent plus à l'ouest ou plus au sud sont retirés
OUEST_MINI = -6
SUD_MINI = 41


# ---------------------------------------------------------------------------
# FONCTIONS
# ---------------------------------------------------------------------------

def lire_parametres():
    """Lit les paramètres de la ligne de commande."""
    p = argparse.ArgumentParser(
        description="Contours simplifiés de la France et de la Bretagne.")
    p.add_argument("--entree", default=FICHIER_ENTREE,
                   help="fichier .parquet téléchargé")
    p.add_argument("--sortie", default=FICHIER_SORTIE,
                   help="fichier JSON à écrire")
    return p.parse_args()


def lire_france_et_bretagne(chemin):
    """Renvoie un dictionnaire {"fr": géométrie, "bre": géométrie}.

    On garde seulement les terres (class = "land").
    """
    lignes = pq.read_table(chemin).to_pylist()
    formes = {}
    for ligne in lignes:
        if ligne["class"] != "land":
            continue
        geometrie = wkb.loads(ligne["geometry"])
        if ligne["subtype"] == "country":
            formes["fr"] = geometrie
        elif ligne["region"] == CODE_BRETAGNE:
            formes["bre"] = geometrie
    return formes


def contours_simplifies(geometrie, tolerance):
    """Simplifie une géométrie et renvoie ses contours extérieurs.

    Les petits morceaux et ceux situés hors de la métropole sont retirés.
    """
    geometrie = geometrie.simplify(tolerance)
    if geometrie.geom_type == "Polygon":
        polygones = [geometrie]
    else:
        polygones = list(geometrie.geoms)

    surface_mini = tolerance * tolerance * FACTEUR_SURFACE_MINI
    contours = []
    for p in polygones:
        ouest, sud = p.bounds[0], p.bounds[1]
        if p.area > surface_mini and ouest > OUEST_MINI and sud > SUD_MINI:
            contours.append([[round(x, DECIMALES), round(y, DECIMALES)]
                             for x, y in p.exterior.coords])
    return contours


def main():
    parametres = lire_parametres()
    formes = lire_france_et_bretagne(parametres.entree)
    print("Emprises :", {nom: forme.bounds for nom, forme in formes.items()})

    resultat = {nom: contours_simplifies(forme, TOLERANCE)
                for nom, forme in formes.items()}
    with open(parametres.sortie, "w") as f:
        json.dump(resultat, f)
    print("Fichier écrit :", parametres.sortie)


if __name__ == "__main__":
    main()
