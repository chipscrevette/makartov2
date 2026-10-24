/* =====================================================================
   CAMÉRA DE LA CARTE DU PACIFIQUE
   ---------------------------------------------------------------------
   Sur la carte du Pacifique, une « caméra » se déplace d'une étape du
   récit à l'autre (centre, zoom, années, flèches des offensives...).
   Sur ordinateur, la caméra avance avec le défilement de la page, puis
   se pose pendant la lecture de chaque carte de texte. Sur téléphone,
   le lecteur choisit directement l'étape. La caméra rejoint sa cible en
   douceur, image après image, quel que soit le rythme du défilement.
   Utilise : MOUVEMENT_REDUIT, LECTEUR (01-reglages.js), adoucir (02-outils-geographiques.js),
   FLECHES_ALLIEES, ETAPES_PACIFIQUE_PC, CADRAGES_TELEPHONE, estTelephone
   (04-pacifique-donnees.js), dessinerPacifique, melangerEtapes (05-pacifique-dessin.js),
   carte, pinceau, densite, sceneActuelle, camera (07-scene-carte.js),
   miniCartePacifique (12-mini-carte.js).
   Fournit : fonduPacifique, imagePacifique, afficherPacifique, bouclePacifique.
   ===================================================================== */

/* ---------- 1. Étapes du récit et état de la boucle ---------- */

// Les blocs de texte du récit qui concernent le Pacifique (data-s commence par « pac: »).
const etapesPacifique = [...document.querySelectorAll('#steps [data-s^="pac:"]')];

// fonduPacifique = true pendant le fondu d'entrée sur le Pacifique (la boucle attend alors).
// imagePacifique = numéro de la prochaine image demandée au navigateur (0 = boucle à l'arrêt).
let fonduPacifique = false,
  imagePacifique = 0;

/* ---------- 2. Cible de la caméra selon le défilement ---------- */

// Calcule l'état que la caméra doit viser maintenant.
// Renvoie un état de caméra (centre, zoom, années, flèches...), mélange de deux étapes
// (voir le sens de chaque champ dans 04-pacifique-donnees.js, bloc « Étapes du récit »).
function etatPacifique() {
  // Dans le lecteur du téléphone : l'étape choisie par le lecteur, sans mélange.
  if (LECTEUR.on && LECTEUR.pac != null) {
    const P = estTelephone() ? CADRAGES_TELEPHONE : ETAPES_PACIFIQUE_PC;
    return melangerEtapes(P[LECTEUR.pac], P[LECTEUR.pac], 1);
  }
  // PS = liste des étapes, avec les cadrages adaptés au téléphone sur petit écran.
  const PS = estTelephone() ? CADRAGES_TELEPHONE : ETAPES_PACIFIQUE_PC;
  // mid = milieu de la fenêtre (en hauteur) ; cs = milieu vertical de chaque bloc de texte.
  const mid = innerHeight * 0.5,
    cs = etapesPacifique.map((e) => {
      const r = e.getBoundingClientRect();
      return r.top + r.height / 2;
    });
  // Avant le premier bloc ou après le dernier : on reste sur la première ou la dernière étape.
  if (mid <= cs[0]) return melangerEtapes(PS[0], PS[0], 1);
  const n = cs.length - 1;
  if (mid >= cs[n]) return melangerEtapes(PS[n], PS[n], 1);
  // i = numéro du bloc juste au-dessus du milieu de la fenêtre.
  let i = 0;
  while (i < n - 1 && mid >= cs[i + 1]) i++;
  // f = avancement entre le bloc i et le bloc i + 1 (de 0 à 1).
  const f = (mid - cs[i]) / (cs[i + 1] - cs[i]);
  // La caméra reste immobile sur les 12 premiers et les 12 derniers pour cent du trajet
  // (le temps de lire le texte), et se déplace sur les 76 % du milieu.
  const t = Math.min(1, Math.max(0, (f - 0.12) / 0.76));
  return melangerEtapes(PS[i], PS[i + 1], adoucir(t));
}

/* ---------- 3. Mouvement doux de la caméra ---------- */

// Avance la caméra d'un petit pas vers sa cible.
// À chaque image, elle parcourt 8,5 % du chemin restant.
// c = position actuelle de la caméra ; t = position visée.
// Renvoie la nouvelle position. Sans position actuelle, ou si l'utilisateur préfère
// moins d'animations, on saute directement à la cible.
function suivreCible(c, t) {
  if (!c || MOUVEMENT_REDUIT) return t;
  // k = part du chemin parcourue à chaque image ; m(x, y) = avance de x vers y.
  const k = 0.085,
    m = (x, y) => x + (y - x) * k;
  // arr = avancement du tracé de chaque flèche d'offensive alliée.
  const arr = {};
  for (const a in FLECHES_ALLIEES) arr[a] = m(c.arr[a] || 0, t.arr[a] || 0);
  return {
    ...t,
    // c = centre [longitude, latitude].
    c: [m(c.c[0], t.c[0]), m(c.c[1], t.c[1])],
    // km = largeur de vue en kilomètres. On avance sur son logarithme pour que
    // le zoom paraisse régulier, qu'on zoome de près ou de loin.
    km: Math.exp(m(Math.log(c.km), Math.log(t.km))),
    // y38, y42 = visibilité des conquêtes de 1938 et de 1942 ;
    // ext = avancement du tracé du contour de 1942 ;
    // route = avancement du vol depuis Tinian vers Hiroshima et Nagasaki.
    y38: m(c.y38, t.y38),
    y42: m(c.y42, t.y42),
    ext: m(c.ext, t.ext),
    route: m(c.route || 0, t.route || 0),
    arr,
  };
}

// Dit si la caméra est arrivée (assez près de sa cible pour qu'on ne voie plus de différence).
// c = position actuelle ; t = position visée. Renvoie true ou false.
// Seuils : 0,01 degré pour le centre, 0,2 % pour le zoom, 0,003 pour les autres réglages.
function cameraPosee(c, t) {
  return (
    Math.abs(c.c[0] - t.c[0]) + Math.abs(c.c[1] - t.c[1]) < 0.01 &&
    Math.abs(Math.log(c.km / t.km)) < 0.002 &&
    Math.abs(c.ext - t.ext) +
      Math.abs(c.y42 - t.y42) +
      Math.abs(c.y38 - t.y38) +
      Math.abs((c.route || 0) - (t.route || 0)) <
      0.003 &&
    Object.keys(FLECHES_ALLIEES).every((a) => Math.abs((c.arr[a] || 0) - (t.arr[a] || 0)) < 0.003)
  );
}

/* ---------- 4. Dessin et boucle d'animation ---------- */

// Dessine une image de la carte du Pacifique avec la caméra à jour.
// snap = true pour placer la caméra directement sur sa cible, sans glissement.
// Renvoie true si la caméra est posée sur sa cible, false si elle bouge encore.
function afficherPacifique(snap) {
  const t = etatPacifique();
  // Pas encore de caméra (ou caméra d'une autre forme) : on part directement de la cible.
  camera = snap || !camera || !camera.arr ? t : suivreCible(camera, t);
  dessinerPacifique(pinceau, carte.width, carte.height, densite, camera);
  // Dans le lecteur du téléphone, la mini-carte suit la caméra.
  if (LECTEUR.on) miniCartePacifique(camera);
  return cameraPosee(camera, t);
}

// Boucle d'animation : redessine à chaque image tant que la caméra bouge.
// Elle s'arrête si l'on a quitté le Pacifique ou pendant le fondu d'entrée.
// Quand la caméra est posée, on fait un dernier dessin en mode « immobile »
// (dernier paramètre à true : contours des terres plus fins et plus détaillés).
function bouclePacifique() {
  imagePacifique = 0;
  if (!sceneActuelle || sceneActuelle.kind !== "pac" || fonduPacifique) return;
  if (!afficherPacifique()) imagePacifique = requestAnimationFrame(bouclePacifique);
  else dessinerPacifique(pinceau, carte.width, carte.height, densite, camera, true);
}

/* ---------- 5. Relance de la boucle au défilement ---------- */

// À chaque défilement, si le Pacifique est affiché et que la boucle est à l'arrêt, on la relance.
// passive: true indique au navigateur que l'on ne bloque pas le défilement.
addEventListener(
  "scroll",
  () => {
    if (sceneActuelle && sceneActuelle.kind === "pac" && !fonduPacifique && !imagePacifique)
      imagePacifique = requestAnimationFrame(bouclePacifique);
  },
  { passive: true },
);
