"""
4_fonds_de_carte_villes.py

BUT
    Fabriquer les fonds de carte des trois villes (Hiroshima, Nagasaki,
    Rennes) : trois images par ville, en niveaux de transparence.
        <ville>-bati.webp   les bâtiments
        <ville>-rues.webp   les rues, plus ou moins larges selon leur importance
        <ville>-eau.webp    les rivières, les lacs et la mer
    Chaque image couvre un rectangle centré sur l'hypocentre (le point
    au sol sous l'explosion ou le bombardement), à 3 mètres par pixel.
    Les pixels sont noirs ; seule la transparence (canal alpha) porte le
    dessin. Le site choisit ensuite la couleur.

ENTRÉES (dans le dossier de données, par défaut le dossier courant)
    hiroX_bld.parquet, hiroX_roads.parquet, hiroX_water.parquet   Hiroshima
    naga_bld.parquet,  naga_roads.parquet,  naga_water.parquet    Nagasaki
    renX_bld.parquet,  renX_roads.parquet,  renX_water.parquet    Rennes
        produits par : 1_telecharger_overture.py villes <ville>
    geoN.json : la mer de chaque ville (issue d'un traitement antérieur),
        clés "hiro", "naga", "ren", chacune avec une géométrie "water".

SORTIES
    ../images/fonds-de-carte/<ville>-<eau|rues|bati>.webp
        (ville = hiroshima, nagasaki, rennes)
    Mise à jour de l'emprise ("box") de chaque ville dans villes.json,
    si ce fichier existe (voir l'option --villes-json).

COMMANDE (lancée depuis le dossier outils, données dans un autre dossier)
    python3 4_fonds_de_carte_villes.py --donnees DOSSIER_DES_PARQUET
    python3 4_fonds_de_carte_villes.py --donnees D --villes nagasaki
"""

import argparse
import json
import math
import os

import numpy as np
import pyarrow.parquet as pq
import shapely
from PIL import Image, ImageDraw
from shapely.geometry import shape


# ---------------------------------------------------------------------------
# RÉGLAGES
# ---------------------------------------------------------------------------

# Rayon de la Terre utilisé par la projection Web Mercator, en mètres
RAYON_TERRE = 6378137

RESOLUTION = 3.0   # mètres par pixel dans l'image finale
SUR_ECHANTILLON = 2  # on dessine 2 fois plus grand, puis on réduit (bords doux)

# Les villes.
#   cle      : nom court utilisé dans geoN.json et villes.json
#   hypocentre : [longitude, latitude]
#   emprise  : (ouest, est, sud, nord) en mètres autour de l'hypocentre
#              (le sud est négatif, l'ouest aussi)
#   prefixe  : début du nom des fichiers .parquet
VILLES = {
    "hiroshima": {"cle": "hiro", "hypocentre": [132.454797, 34.394594],
                  "emprise": (-8000, 6000, -8500, 7000), "prefixe": "hiroX"},
    "nagasaki":  {"cle": "naga", "hypocentre": [129.863248, 32.773769],
                  "emprise": (-5500, 4000, -3500, 3500), "prefixe": "naga"},
    "rennes":    {"cle": "ren", "hypocentre": [-1.681865, 48.111678],
                  "emprise": (-8000, 6000, -8500, 7000), "prefixe": "renX"},
}

# Largeur des rues selon leur classe Overture, en mètres.
# Les classes absentes de cette liste (chemins, pistes...) ne sont pas dessinées.
LARGEUR_RUES = {
    "motorway": 16, "trunk": 14, "primary": 12, "secondary": 10,
    "tertiary": 8, "residential": 5, "unclassified": 5, "living_street": 4,
    "service": 3, "pedestrian": 3, "unknown": 3,
}

# Types d'eau Overture ignorés (bassins artificiels, zones humides...)
TYPES_EAU_IGNORES = ("human_made", "physical")
TOLERANCE_EAU = 0.00002   # simplification des contours d'eau, en degrés
PRECISION_EAU = 0.00001   # grille d'arrondi des contours d'eau, en degrés

FICHIER_MER = "geoN.json"
DOSSIER_SORTIE = "../images/fonds-de-carte"
FICHIER_VILLES = "villes.json"


# ---------------------------------------------------------------------------
# PROJECTION : degrés -> pixels
# ---------------------------------------------------------------------------

def mercator(longitude, latitude):
    """Projection Web Mercator : degrés -> mètres (y vers le bas)."""
    x = RAYON_TERRE * math.radians(longitude)
    y = -RAYON_TERRE * math.log(
        math.tan(math.pi / 4 + math.radians(latitude) / 2))
    return x, y


class Cadre:
    """Le rectangle dessiné autour d'une ville, et la conversion en pixels.

    En Web Mercator, les distances sont agrandies d'un facteur
    1 / cos(latitude). On corrige ce facteur pour que 1 pixel fasse
    vraiment RESOLUTION mètres au sol à la latitude de l'hypocentre.
    """

    def __init__(self, hypocentre, emprise):
        self.ouest, self.est, self.sud, self.nord = emprise
        self.facteur = 1 / math.cos(math.radians(hypocentre[1]))
        self.origine_x, self.origine_y = mercator(*hypocentre)
        # Taille de l'image finale, en pixels
        self.largeur = int((self.est - self.ouest) / RESOLUTION)
        self.hauteur = int((self.nord - self.sud) / RESOLUTION)
        # Pixels (sur-échantillonnés) par mètre Mercator
        self.echelle = SUR_ECHANTILLON / (RESOLUTION * self.facteur)

    def en_pixels(self, longitude, latitude):
        """Position d'un point dans l'image sur-échantillonnée."""
        x, y = mercator(longitude, latitude)
        colonne = ((x - self.origine_x) - self.ouest * self.facteur) * self.echelle
        ligne = ((y - self.origine_y) + self.nord * self.facteur) * self.echelle
        return colonne, ligne

    def points(self, coordonnees):
        """Convertit une suite de points (longitude, latitude) en pixels."""
        return [self.en_pixels(x, y) for x, y in coordonnees]

    def nouvelle_image(self):
        """Image vide (noire) à la taille sur-échantillonnée."""
        return Image.new("L", (self.largeur * SUR_ECHANTILLON,
                               self.hauteur * SUR_ECHANTILLON), 0)

    def reduire(self, image):
        """Ramène l'image à sa taille finale (moyenne des pixels)."""
        return np.asarray(image.resize((self.largeur, self.hauteur), Image.BOX))


# ---------------------------------------------------------------------------
# OUTILS DE DESSIN
# ---------------------------------------------------------------------------

def morceaux(geometrie):
    """Renvoie les morceaux simples d'une géométrie (ou la géométrie seule)."""
    return geometrie.geoms if hasattr(geometrie, "geoms") else [geometrie]


def enregistrer_webp(masque, chemin):
    """Enregistre un masque en WebP sans perte.

    Les pixels sont noirs ; le masque devient la transparence.
    """
    noir = np.zeros_like(masque)
    image = Image.fromarray(np.dstack([noir, noir, noir, masque]), "RGBA")
    image.save(chemin, "WEBP", lossless=True, method=6)
    print(chemin, os.path.getsize(chemin) // 1024, "Ko", flush=True)


def dessiner_polygones(dessin, cadre, geometries, verifier_taille=False):
    """Remplit des polygones en blanc et vide leurs trous en noir.

    verifier_taille : ignorer les contours de moins de 3 points
    (utilisé pour les bâtiments).
    """
    for geometrie in geometries:
        for polygone in morceaux(geometrie):
            if polygone.geom_type != "Polygon":
                continue
            contour = cadre.points(polygone.exterior.coords)
            if verifier_taille and len(contour) < 3:
                continue
            dessin.polygon(contour, fill=255)
            for trou in polygone.interiors:
                dessin.polygon(cadre.points(trou.coords), fill=0)


# ---------------------------------------------------------------------------
# LES TROIS COUCHES
# ---------------------------------------------------------------------------

def couche_bati(cadre, fichier):
    """Masque des bâtiments."""
    image = cadre.nouvelle_image()
    geometries = shapely.from_wkb(
        pq.read_table(fichier).column("geometry").to_pylist())
    dessiner_polygones(ImageDraw.Draw(image), cadre, geometries,
                       verifier_taille=True)
    return cadre.reduire(image)


def couche_rues(cadre, fichier):
    """Masque des rues : chaque rue est un trait dont l'épaisseur dépend
    de sa classe."""
    image = cadre.nouvelle_image()
    dessin = ImageDraw.Draw(image)
    table = pq.read_table(fichier).to_pydict()
    for classe, geometrie in zip(table["class"],
                                 shapely.from_wkb(table["geometry"])):
        largeur_m = LARGEUR_RUES.get(classe)
        if not largeur_m:
            continue
        epaisseur = max(1, int(round(largeur_m / RESOLUTION * SUR_ECHANTILLON)))
        for ligne in morceaux(geometrie):
            dessin.line(cadre.points(ligne.coords), fill=255,
                        width=epaisseur, joint="curve")
    return cadre.reduire(image)


def couche_eau(cadre, fichier, mer):
    """Masque de l'eau : rivières et lacs d'Overture, plus la mer."""
    table = pq.read_table(fichier).to_pydict()
    surfaces = []
    for type_eau, geometrie in zip(table["subtype"],
                                   shapely.from_wkb(table["geometry"])):
        if type_eau in TYPES_EAU_IGNORES:
            continue
        if geometrie.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        surfaces.append(geometrie)

    # On fusionne toutes les surfaces, on simplifie, puis on arrondit
    eau = shapely.union_all(surfaces).simplify(TOLERANCE_EAU)
    eau = shapely.set_precision(eau, PRECISION_EAU)

    image = cadre.nouvelle_image()
    dessiner_polygones(ImageDraw.Draw(image), cadre, [eau, mer])
    return cadre.reduire(image)


# ---------------------------------------------------------------------------
# PROGRAMME PRINCIPAL
# ---------------------------------------------------------------------------

def lire_parametres():
    """Lit les paramètres de la ligne de commande."""
    p = argparse.ArgumentParser(
        description="Fabrique les fonds de carte des villes (WebP).")
    p.add_argument("--donnees", default=".",
                   help="dossier des fichiers .parquet et de geoN.json")
    p.add_argument("--sortie", default=DOSSIER_SORTIE,
                   help="dossier où écrire les images")
    p.add_argument("--villes-json", default=FICHIER_VILLES,
                   help="fichier JSON des villes dont on met à jour l'emprise")
    p.add_argument("--villes", nargs="+", choices=list(VILLES),
                   default=list(VILLES), help="villes à traiter (défaut : toutes)")
    return p.parse_args()


def fabriquer_ville(nom, ville, parametres, mers):
    """Fabrique les trois images d'une ville."""
    cadre = Cadre(ville["hypocentre"], ville["emprise"])
    debut = os.path.join(parametres.donnees, ville["prefixe"])
    sortie = os.path.join(parametres.sortie, nom)

    enregistrer_webp(couche_bati(cadre, f"{debut}_bld.parquet"),
                     f"{sortie}-bati.webp")
    enregistrer_webp(couche_rues(cadre, f"{debut}_roads.parquet"),
                     f"{sortie}-rues.webp")
    mer = shape(mers[ville["cle"]]["water"])
    enregistrer_webp(couche_eau(cadre, f"{debut}_water.parquet", mer),
                     f"{sortie}-eau.webp")


def mettre_a_jour_emprises(chemin, noms):
    """Recopie l'emprise de chaque ville traitée dans le fichier des villes."""
    if not os.path.exists(chemin):
        print("Fichier", chemin, "absent : emprises non mises à jour.")
        return
    with open(chemin) as f:
        donnees = json.load(f)
    for nom in noms:
        donnees[VILLES[nom]["cle"]]["box"] = list(VILLES[nom]["emprise"])
    with open(chemin, "w") as f:
        json.dump(donnees, f, separators=(",", ":"))
    print("Emprises mises à jour dans", chemin)


def main():
    parametres = lire_parametres()
    os.makedirs(parametres.sortie, exist_ok=True)
    with open(os.path.join(parametres.donnees, FICHIER_MER)) as f:
        mers = json.load(f)

    for nom in parametres.villes:
        fabriquer_ville(nom, VILLES[nom], parametres, mers)
    mettre_a_jour_emprises(parametres.villes_json, parametres.villes)


if __name__ == "__main__":
    main()
