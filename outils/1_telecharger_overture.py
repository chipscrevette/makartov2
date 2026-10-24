"""
1_telecharger_overture.py

BUT
    Télécharger depuis Overture Maps les données brutes utilisées par les
    autres scripts. Overture publie ses données sur un stockage Amazon S3
    public : aucun compte n'est nécessaire.

TROIS SOUS-COMMANDES
    villes      routes, eau et bâtiments autour d'une ville
                -> <prefixe>_roads.parquet, <prefixe>_water.parquet,
                   <prefixe>_bld.parquet
    pacifique   divisions administratives du Pacifique
                -> div.parquet, dep.parquet, east.parquet
    france      contour de la France et de ses régions
                -> france.parquet

COMMANDES
    python3 1_telecharger_overture.py villes hiroshima
    python3 1_telecharger_overture.py villes rennes
    python3 1_telecharger_overture.py villes nagasaki --emprise OUEST SUD EST NORD
    python3 1_telecharger_overture.py villes hiroshima --couches roads water
    python3 1_telecharger_overture.py pacifique
    python3 1_telecharger_overture.py france

    Les fichiers sont écrits dans le dossier courant (ou --sortie DOSSIER).
"""

import argparse
import os
import time

import pyarrow.dataset as ds
import pyarrow.fs as pfs
import pyarrow.parquet as pq


# ---------------------------------------------------------------------------
# RÉGLAGES
# ---------------------------------------------------------------------------

# Version des données Overture utilisée pour tout le site
VERSION_OVERTURE = "overturemaps-us-west-2/release/2026-09-23.0"
REGION_S3 = "us-west-2"

# Emprises des villes, en degrés : (ouest, sud, est, nord).
# Le préfixe donne le début du nom des fichiers produits.
# L'emprise de Nagasaki n'a pas été conservée : il faut la donner avec --emprise.
VILLES = {
    "hiroshima": {"prefixe": "hiroX",
                  "emprise": (132.36444, 34.31501, 132.52338, 34.46061)},
    "rennes":    {"prefixe": "renX",
                  "emprise": (-1.79353, 48.03209, -1.5971, 48.1777)},
    "nagasaki":  {"prefixe": "naga",
                  "emprise": None},
}

# Couches téléchargées pour une ville : (chemin dans Overture, colonnes gardées)
COUCHES_VILLE = {
    "roads": ("theme=transportation/type=segment",
              ["class", "subtype", "geometry"]),
    "water": ("theme=base/type=water",
              ["subtype", "class", "geometry"]),
    "bld":   ("theme=buildings/type=building",
              ["geometry"]),
}

# Divisions administratives (pays, régions, dépendances)
CHEMIN_DIVISIONS = "theme=divisions/type=division_area"
COLONNES_DIVISIONS = ["subtype", "class", "country", "region", "names",
                      "is_land", "geometry"]

# Emprises du Pacifique, en degrés : (ouest, sud, est, nord)
PACIFIQUE_OUEST_DE_180 = (60, -50, 180, 75)
PACIFIQUE_EST_DE_180 = (-180, -50, -150, 75)

# France : emprise de la métropole et colonnes gardées
EMPRISE_FRANCE = (-6, 41, 10, 52)
COLONNES_FRANCE = ["subtype", "class", "region", "is_land", "geometry"]


# ---------------------------------------------------------------------------
# FONCTIONS
# ---------------------------------------------------------------------------

def ouvrir_couche(chemin):
    """Ouvre une couche Overture sur le stockage S3 public (sans compte)."""
    s3 = pfs.S3FileSystem(anonymous=True, region=REGION_S3)
    return ds.dataset(f"{VERSION_OVERTURE}/{chemin}",
                      filesystem=s3, format="parquet")


def filtre_emprise(ouest, sud, est, nord):
    """Filtre : garde les objets dont le rectangle touche l'emprise."""
    return ((ds.field("bbox", "xmin") < est)
            & (ds.field("bbox", "xmax") > ouest)
            & (ds.field("bbox", "ymin") < nord)
            & (ds.field("bbox", "ymax") > sud))


def telecharger(couche, colonnes, filtre, fichier):
    """Télécharge les lignes qui passent le filtre et les écrit en .parquet."""
    debut = time.time()
    table = couche.to_table(columns=colonnes, filter=filtre)
    pq.write_table(table, fichier)
    print(fichier, table.num_rows, "lignes",
          round(time.time() - debut), "s", flush=True)


def telecharger_ville(nom, emprise, couches, dossier):
    """Routes, eau et bâtiments d'une ville."""
    ville = VILLES[nom]
    emprise = emprise or ville["emprise"]
    if emprise is None:
        raise SystemExit(f"Pas d'emprise connue pour {nom} : "
                         "ajoutez --emprise OUEST SUD EST NORD")

    for cle in couches:
        chemin, colonnes = COUCHES_VILLE[cle]
        filtre = filtre_emprise(*emprise)
        if cle == "roads":
            # On garde seulement les routes (pas les voies ferrées, etc.)
            filtre = filtre & (ds.field("subtype") == "road")
        fichier = os.path.join(dossier, f"{ville['prefixe']}_{cle}.parquet")
        telecharger(ouvrir_couche(chemin), colonnes, filtre, fichier)


def telecharger_pacifique(dossier):
    """Pays, régions et dépendances du Pacifique, en trois fichiers."""
    couche = ouvrir_couche(CHEMIN_DIVISIONS)

    def par_type(types):
        return ds.field("subtype").isin(types)

    # Ouest de la ligne de changement de date : pays et régions
    telecharger(couche, COLONNES_DIVISIONS,
                filtre_emprise(*PACIFIQUE_OUEST_DE_180)
                & par_type(["country", "region"]),
                os.path.join(dossier, "div.parquet"))
    # Ouest de la ligne de changement de date : dépendances
    telecharger(couche, COLONNES_DIVISIONS,
                filtre_emprise(*PACIFIQUE_OUEST_DE_180)
                & par_type(["dependency"]),
                os.path.join(dossier, "dep.parquet"))
    # Est de la ligne de changement de date : tout
    telecharger(couche, COLONNES_DIVISIONS,
                filtre_emprise(*PACIFIQUE_EST_DE_180)
                & par_type(["country", "dependency", "region"]),
                os.path.join(dossier, "east.parquet"))


def telecharger_france(dossier):
    """Contour de la France et de ses régions (pour 3_contours_france.py)."""
    filtre = (filtre_emprise(*EMPRISE_FRANCE)
              & ds.field("subtype").isin(["country", "region"])
              & (ds.field("country") == "FR"))
    telecharger(ouvrir_couche(CHEMIN_DIVISIONS), COLONNES_FRANCE, filtre,
                os.path.join(dossier, "france.parquet"))


def lire_parametres():
    """Lit la sous-commande et ses options."""
    p = argparse.ArgumentParser(
        description="Télécharge les données Overture Maps du site.")
    p.add_argument("--sortie", default=".",
                   help="dossier où écrire les fichiers (défaut : dossier courant)")
    sous = p.add_subparsers(dest="commande", required=True)

    v = sous.add_parser("villes", help="routes, eau et bâtiments d'une ville")
    v.add_argument("ville", choices=sorted(VILLES))
    v.add_argument("--emprise", nargs=4, type=float,
                   metavar=("OUEST", "SUD", "EST", "NORD"),
                   help="emprise en degrés (obligatoire pour nagasaki)")
    v.add_argument("--couches", nargs="+", choices=list(COUCHES_VILLE),
                   default=list(COUCHES_VILLE),
                   help="couches à télécharger (défaut : toutes)")

    sous.add_parser("pacifique", help="divisions administratives du Pacifique")
    sous.add_parser("france", help="contour de la France et de ses régions")
    return p.parse_args()


def main():
    parametres = lire_parametres()
    if parametres.commande == "villes":
        telecharger_ville(parametres.ville, parametres.emprise,
                          parametres.couches, parametres.sortie)
    elif parametres.commande == "pacifique":
        telecharger_pacifique(parametres.sortie)
    elif parametres.commande == "france":
        telecharger_france(parametres.sortie)


if __name__ == "__main__":
    main()
