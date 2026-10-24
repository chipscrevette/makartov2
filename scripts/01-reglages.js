/* =====================================================================
   RÉGLAGES GÉNÉRAUX DU SITE
   ---------------------------------------------------------------------
   Ce fichier est chargé en premier. Il regroupe les constantes partagées
   par tous les autres scripts : quelques valeurs de calcul, la couleur
   rouge du site, la fiche de chaque ville et l'état du lecteur téléphone.
   Il ne dessine rien et ne fait aucun calcul lourd.
   Utilise : rien (aucun autre fichier n'est nécessaire).
   Fournit : DEG_EN_RAD, RAYON_TERRE, MOUVEMENT_REDUIT, ROUGE, VILLES,
             HYPOCENTRE_HIROSHIMA, HYPOCENTRE_NAGASAKI, LECTEUR.
   ===================================================================== */

/* ---------- 1. Constantes de calcul ---------- */
// DEG_EN_RAD : multiplier des degrés par ce nombre les convertit en radians.
// RAYON_TERRE : rayon de la Terre à l'équateur, en mètres (valeur utilisée par Web Mercator).
// MOUVEMENT_REDUIT : vrai si la personne a demandé à son système de limiter les animations.
// Dans ce cas, les déplacements de carte se font sans animation.
const DEG_EN_RAD = Math.PI / 180,
  RAYON_TERRE = 6378137,
  MOUVEMENT_REDUIT = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 2. Couleur principale ---------- */
// Rouge du site : contours des zones détruites, hachures, accents.
const ROUGE = "#E5262D";

/* ---------- 3. Fiches des trois villes ---------- */
// Chaque ville est décrite par :
//   id     : code court de la ville (le même que la clé de l'objet)
//   name   : nom affiché, sert aussi à trouver les images du fond de carte
//   num    : numéro affiché sur la vignette de la ville (01, 02, 03)
//   hyp    : hypocentre [longitude, latitude] en degrés, centre de la carte
//   span   : largeur de terrain visible sur PC, en mètres
//   par    : texte de la légende pour la zone touchée mais pas rasée
//   center : (facultatif) nom du point central, « Hypocentre » par défaut
//   poi    : lieux repères, chacun écrit [longitude, latitude, nom, côté, option, style]
//            côté   = "left" pour placer le nom à gauche du point (sinon 0 ou absent)
//            option = 1 pour cacher ce repère sur petit écran
//            style  = "plain" pour un nom seul, sans point (rivière, vallée)
const VILLES = {
  hiro: {
    id: "hiro",
    name: "Hiroshima",
    num: "01",
    hyp: [132.454797, 34.394594],
    span: 12000,
    par: "Endommagé",
    poi: [
      [132.45357, 34.39545, "Dôme de Genbaku", "left"],
      [132.45986, 34.40152, "Château"],
      [132.475556, 34.397778, "Gare", 0, 1],
    ],
  },
  naga: {
    id: "naga",
    name: "Nagasaki",
    num: "02",
    hyp: [129.863248, 32.773769],
    span: 6500,
    par: "Incendié",
    poi: [
      [129.868396, 32.776193, "Cathédrale d’Urakami", "left"],
      [129.86181, 32.79496, "Vallée d’Urakami", 0, 1, "plain"],
    ],
  },
  ren: {
    id: "ren",
    name: "Rennes",
    num: "03",
    hyp: [-1.681865, 48.111678],
    span: 12000,
    par: "Endommagé",
    center: "Centre",
    poi: [
      [-1.67203, 48.10366, "Gare"],
      [-1.6999, 48.10479, "Vilaine", 0, 1, "plain"],
    ],
  },
};

/* ---------- 4. Raccourcis vers les deux hypocentres ---------- */
// Utilisés par la carte du Pacifique pour tracer les trajets des bombardiers.
const HYPOCENTRE_HIROSHIMA = VILLES.hiro.hyp,
  HYPOCENTRE_NAGASAKI = VILLES.naga.hyp;

/* ---------- 5. État du lecteur téléphone ----------
   Sur téléphone, la page ne défile plus : elle devient une suite d'écrans plein écran,
   comme des stories. Toucher à droite (ou glisser) avance, toucher à gauche revient.
   Une idée par écran, en grand. Ce lecteur est géré par 13-lecteur-telephone.js. */
// on     : vrai si l'écran fait moins de 900 pixels de large (mode téléphone)
// frames : liste des écrans du récit, remplie au démarrage du lecteur
// i      : numéro de l'écran affiché
// pac    : numéro de l'étape Pacifique affichée, ou null hors de la carte du Pacifique
// ready  : vrai une fois le lecteur construit
// Le lecteur ajoute ensuite « sheet » : la hauteur du bloc de texte en bas, en pixels CSS.
const LECTEUR = { on: innerWidth < 900, frames: [], i: 0, pac: null, ready: false };
