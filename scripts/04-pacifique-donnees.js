/* =====================================================================
   DONNÉES DE LA CARTE DU PACIFIQUE (L'EMPIRE JAPONAIS, 1930-1945)
   ---------------------------------------------------------------------
   Ce fichier ne dessine rien : il range les réglages de la carte du Pacifique.
   On y trouve les couleurs des territoires, les lieux à repérer (batailles, bases,
   villes bombardées), le tracé des flèches des avancées alliées, le contour de
   l'empire en 1942, les noms des grandes régions et la liste des étapes du récit.
   Chaque étape décrit une position de caméra et ce que la carte doit montrer.
   Utilise : HYPOCENTRE_HIROSHIMA, HYPOCENTRE_NAGASAKI, DEG_EN_RAD (01-reglages.js).
   Fournit : COULEURS_PACIFIQUE, LIEUX_PACIFIQUE, FLECHES_ALLIEES, EXTENSION_1942,
   NOMS_REGIONS, ETAPES_PACIFIQUE_PC, CADRAGES_TELEPHONE, estTelephone,
   ECHELLE_EST_OUEST.
   ===================================================================== */

/* ---------- 1. Couleurs des territoires ---------- */
// Les terres (fichier donnees/pacifique.js) sont rangées par catégorie : [catégorie, anneaux].
// Elles viennent d'Overture Maps (frontières actuelles). Le contrôle est approximatif,
// décidé province par province.
// Codes des catégories :
//   ne = pays neutre, al = Alliés, su = URSS,
//   j30 = Japon et territoires tenus dès 1930,
//   j38 = conquêtes japonaises jusqu'en 1938, j42 = conquêtes jusqu'en 1942.
const COULEURS_PACIFIQUE = {
  ne: "#DEDED9",
  al: "#1A1A1A",
  su: "#B4B4AF",
  j30: "#9E1219",
  j38: "#E5262D",
  j42: "#F4A9A6",
};

/* ---------- 2. Lieux à repérer sur la carte ---------- */
// Chaque lieu : [longitude, latitude, nom, sous-titre (date), type de repère].
// Les longitudes au-delà de 180 (ex. 202.05 pour Pearl Harbor) évitent que la carte
// se coupe en deux au milieu du Pacifique : 202 degrés Est = 158 degrés Ouest.
// Types de repère :
//   "a" = attaque japonaise (rond rouge), "b" = bataille (triangle noir),
//   "base" = base de départ des bombardiers, "bomb" = ville bombardée (étoile rouge),
//   "cap" = capitale (carré blanc).
const LIEUX_PACIFIQUE = {
  ph: [202.05, 21.36, "Pearl Harbor", "déc. 1941", "a"],
  cs: [155.5, -14.5, "Mer de Corail", "mai 1942", "b"],
  mw: [182.63, 28.21, "Midway", "juin 1942", "b"],
  gc: [160.0, -9.5, "Guadalcanal", "1942-1943", "b"],
  ta: [172.98, 1.42, "Tarawa", "nov. 1943", "b"],
  kw: [167.73, 9.2, "Kwajalein", "fév. 1944", "b"],
  sa: [145.75, 15.18, "Saipan", "juin 1944", "b"],
  pe: [134.25, 7.0, "Peleliu", "sept. 1944", "b"],
  le: [124.9, 10.9, "Leyte", "oct. 1944", "b"],
  iw: [141.32, 24.78, "Iwo Jima", "fév. 1945", "b"],
  ok: [127.8, 26.33, "Okinawa", "avr. 1945", "b"],
  // pour Tinian, le sous-titre n'est pas une date mais l'heure de décollage du bombardier
  ti: [145.63, 15.0, "Tinian", "2 h 45", "base"],
  hi: [HYPOCENTRE_HIROSHIMA[0], HYPOCENTRE_HIROSHIMA[1], "Hiroshima", "6 août", "bomb"],
  na: [HYPOCENTRE_NAGASAKI[0], HYPOCENTRE_NAGASAKI[1], "Nagasaki", "9 août", "bomb"],
  tk: [139.69, 35.68, "Tokyo", "", "cap"],
};

/* ---------- 3. Flèches des avancées alliées ---------- */
// Chaque flèche est une suite de points [longitude, latitude], du départ vers la pointe.
// Le tracé sera ensuite lissé en courbe (voir courbeLissee dans 05-pacifique-dessin.js).
//   sw = poussée du sud-ouest (Nouvelle-Guinée vers les Philippines),
//   ce = poussée du centre du Pacifique (îles Gilbert et Marshall vers les Mariannes),
//   iw = vers Iwo Jima, ok = vers Okinawa.
const FLECHES_ALLIEES = {
  sw: [
    [158.5, -8.2],
    [149, -5.6],
    [139, -2.2],
    [131.5, 3.6],
    [126.4, 9.2],
  ],
  ce: [
    [174, -0.2],
    [169, 7.6],
    [160, 12.6],
    [147.6, 15.2],
  ],
  iw: [
    [145, 17.2],
    [141.9, 23.2],
  ],
  ok: [
    [125.6, 12.6],
    [127.4, 24.6],
  ],
};

/* ---------- 4. Contour de l'empire à son extension maximale (1942) ---------- */
// Tracé à la main d'après P. Souty (1995). Suite de points [longitude, latitude].
// Le contour est fermé plus tard, au moment du lissage.
const EXTENSION_1942 = [
  [157, 51.5],
  [173, 53.5],
  [179, 47],
  [168, 21],
  [176, 9],
  [177, -1.5],
  [164, -11.8],
  [149, -11.5],
  [128, -11.2],
  [114, -10],
  [104, -8.4],
  [94, 0],
  [91.5, 12],
  [91.5, 21.5],
  [96, 28],
  [99, 25],
  [106, 22.2],
  [111, 25],
  [113, 30],
  [111, 35.5],
  [112, 40.5],
  [116, 43],
  [116, 46.5],
  [119.5, 50.5],
  [125, 53.5],
  [133, 48.5],
  [141, 52.5],
];

/* ---------- 5. Noms des grandes régions ---------- */
// Chaque nom : [longitude, latitude, texte, style].
// Le style reprend les codes de catégorie du bloc 1 et choisit la couleur du texte.
// Deux styles en plus : "sea" = nom de mer ou d'océan, "jp" = le Japon lui-même.
// Les noms "j38" et "j42" n'apparaissent qu'une fois la conquête affichée.
const NOMS_REGIONS = [
  [104, 32, "Chine", "al"],
  [100, 59, "URSS", "su"],
  [78, 22.5, "Inde", "al"],
  [133, -25, "Australie", "al"],
  [104, 46, "Mongolie", "ne"],
  [125.5, 45.5, "Mandchourie", "j38"],
  [164, 30, "Océan Pacifique", "sea"],
  [80, -12, "Océan Indien", "sea"],
  [103, 15.5, "Indochine", "j42"],
  [114, -1, "Indes néerlandaises", "j42"],
  [147, 39, "Japon", "jp"],
];

/* ---------- 6. Étapes du récit ---------- */
// Une étape = une position de caméra et un état de la carte.
// Sens de chaque champ :
//   c   = centre de la vue [longitude, latitude] sur PC.
//   km  = largeur montrée par la carte, en kilomètres, sur PC (plus petit = plus zoomé).
//   mc, mkm = les mêmes réglages pour le téléphone (m comme « mobile »).
//         S'ils manquent, le téléphone reprend c et km.
//   yr  = année affichée en grand en fond de carte.
//   y38, y42 = visibilité des conquêtes de 1938 et de 1942 (0 = cachées, 1 = visibles).
//   ext = avancement du tracé du contour de 1942 (0 = rien, 1 = contour complet).
//   arr = avancement de chaque flèche alliée (0 à 1), par code de flèche (bloc 3).
//   mk  = liste des lieux à repérer (codes du bloc 2).
//   f   = lieu mis en avant par des cercles rouges (facultatif).
//   route = avancement du vol depuis Tinian vers Hiroshima et Nagasaki (0 à 1).
// Entre deux étapes, toutes ces valeurs sont mélangées en douceur
// (voir melangerEtapes dans 05-pacifique-dessin.js).
const ETAPES_PACIFIQUE = [
  // 1930 : le Japon et son empire de départ
  {
    mkm: 8600,
    mc: [129, 35],
    c: [133, 37],
    km: 5200,
    yr: "1930",
    y38: 0,
    y42: 0,
    ext: 0,
    arr: {},
    mk: ["tk"],
  },
  // 1938 : les conquêtes en Chine apparaissent
  {
    mkm: 8200,
    mc: [121, 37],
    c: [123, 40],
    km: 4600,
    yr: "1938",
    y38: 1,
    y42: 0,
    ext: 0,
    arr: {},
    mk: ["tk"],
  },
  // 1941 : zoom sur Pearl Harbor
  {
    mkm: 3000,
    c: [201.6, 21.0],
    km: 2400,
    yr: "1941",
    y38: 1,
    y42: 0,
    ext: 0,
    arr: {},
    mk: ["ph"],
    f: "ph",
  },
  // 1942 : vue très large, l'empire à son extension maximale et son contour rouge
  {
    mkm: 11500,
    mc: [138, 10],
    c: [150, 10],
    km: 13000,
    yr: "1942",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: {},
    mk: ["ph", "tk"],
  },
  // 1942 : Midway
  {
    mkm: 1700,
    c: [182.5, 28.1],
    km: 900,
    yr: "1942",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: {},
    mk: ["mw"],
    f: "mw",
  },
  // 1942 : Guadalcanal et la mer de Corail
  {
    mkm: 3600,
    mc: [158, -9],
    c: [158, -10],
    km: 2800,
    yr: "1942",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: {},
    mk: ["gc", "cs"],
    f: "gc",
  },
  // 1944 : poussée du centre du Pacifique (Tarawa, Kwajalein, Saipan)
  {
    mkm: 7000,
    mc: [154, 8],
    c: [158, 8],
    km: 5200,
    yr: "1944",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: { ce: 1 },
    mk: ["ta", "kw", "sa"],
    f: "sa",
  },
  // 1944 : poussée du sud-ouest (Peleliu, Leyte)
  {
    mkm: 7000,
    mc: [132, 5],
    c: [133, 3],
    km: 5200,
    yr: "1944",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: { ce: 1, sw: 1 },
    mk: ["pe", "le"],
    f: "le",
  },
  // 1945 : zoom serré sur Iwo Jima
  {
    mkm: 900,
    c: [141.31, 24.77],
    km: 320,
    yr: "1945",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: { ce: 1, sw: 1, iw: 1 },
    mk: ["iw"],
    f: "iw",
  },
  // 1945 : Okinawa
  {
    mkm: 1500,
    c: [127.9, 26.5],
    km: 1000,
    yr: "1945",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: { ce: 1, sw: 1, iw: 1, ok: 1 },
    mk: ["ok"],
    f: "ok",
  },
  // 1945 : Tinian, la base d'où partent les bombardiers
  {
    mkm: 1000,
    c: [145.66, 15.02],
    km: 520,
    yr: "1945",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: { ce: 1, sw: 1, iw: 1, ok: 1 },
    mk: ["ti"],
    f: "ti",
  },
  // 1945 : le vol de Tinian vers Hiroshima et Nagasaki
  {
    mkm: 6800,
    mc: [137, 25],
    c: [139, 24],
    km: 4400,
    yr: "1945",
    y38: 1,
    y42: 1,
    ext: 1,
    arr: { ce: 1, sw: 1, iw: 1, ok: 1 },
    mk: ["ti", "hi", "na", "tk"],
    route: 1,
  },
];

/* ---------- 7. Étapes pour PC et pour téléphone ---------- */
// ETAPES_PACIFIQUE_PC : les étapes telles quelles, pour l'écran large.
// CADRAGES_TELEPHONE : une copie de chaque étape où le centre (c) et la largeur (km)
// sont remplacés par mc et mkm quand ils existent. Sur téléphone, la carte n'occupe
// que le haut de l'écran, d'où un cadrage propre à chaque étape.
// p = une étape ; { ...p } recopie tous ses champs avant d'en remplacer deux.
const ETAPES_PACIFIQUE_PC = ETAPES_PACIFIQUE,
  CADRAGES_TELEPHONE = ETAPES_PACIFIQUE.map((p) => ({ ...p, c: p.mc || p.c, km: p.mkm || p.km }));

/* ---------- 8. Petits outils communs ---------- */
// Renvoie vrai si la fenêtre fait moins de 900 pixels de large (affichage téléphone).
const estTelephone = () => innerWidth < 900;

// Un degré de longitude est plus court qu'un degré de latitude, sauf à l'équateur.
// La carte du Pacifique utilise une valeur fixe, prise à 20 degrés de latitude
// (milieu de la zone montrée) : cos(20 degrés) = environ 0,94.
const ECHELLE_EST_OUEST = Math.cos(20 * DEG_EN_RAD);
