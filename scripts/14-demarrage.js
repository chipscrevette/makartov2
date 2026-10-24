/* =====================================================================
   DÉMARRAGE DU SITE
   ---------------------------------------------------------------------
   Dernier fichier chargé : il lance tout. On attend d'abord que les
   images des villes et les polices soient prêtes, puis on dessine la
   page, en mode ordinateur (récit au défilement) ou en mode téléphone
   (lecteur écran par écran). Quand la fenêtre change de taille, on
   redessine, ou on recharge la page si l'on passe d'un mode à l'autre.
   Utilise : LECTEUR, VILLES (01), chargerVille (03),
   chargerNiveauxDetail (05), ajusterTaille, allerVers, sceneActuelle (07),
   dessinerVignettes, dessinerOuverture (09), dessinerCouches,
   animerPile, coulissesAuDefilement (10), epinglerTextes,
   estomperTextes, auDefilement (11), demarrerLecteur, allerAEcran (13).
   Fournit : demarrer, POLICES, minuterieRedim.
   ===================================================================== */

/* ---------- 1. Dessiner la page selon le mode ---------- */

// Dessine (ou redessine) tout le site. Appelée au chargement puis à chaque
// changement de taille de la fenêtre.
function demarrer() {
  // mode téléphone : le lecteur écran par écran
  if (LECTEUR.on) {
    // le lecteur n'est construit qu'une seule fois
    if (!LECTEUR.ready) demarrerLecteur();
    ajusterTaille();
    dessinerCouches();
    animerPile();
    // on oublie l'écran et la scène affichés pour forcer allerAEcran à tout redessiner
    LECTEUR.shown = false;
    sceneActuelle = null;
    allerAEcran(LECTEUR.i);
    return;
  }
  // mode ordinateur : le récit avance au défilement
  epinglerTextes();
  estomperTextes();
  chargerNiveauxDetail();
  ajusterTaille();
  dessinerOuverture();
  dessinerVignettes();
  dessinerCouches();
  // on remontre la scène en cours (ou la première étape du Pacifique au premier passage) ;
  // true = forcer le dessin même si la scène n'a pas changé
  const s = sceneActuelle;
  sceneActuelle = null;
  allerVers(s || { kind: "pac", i: 0 }, true);
  // on met tout de suite à jour ce qui dépend de la position de défilement
  coulissesAuDefilement();
  auDefilement();
}

/* ---------- 2. Attendre les polices et les images, puis démarrer ---------- */

// POLICES : promesse tenue quand la police Geist est chargée dans ses trois graisses
// (400 = normal, 500 = moyen, 600 = demi-gras). En cas d'échec, on continue quand même
// (catch renvoie 0). Si le navigateur ne connaît pas document.fonts, on n'attend rien.
const POLICES = document.fonts
  ? Promise.all(["400", "500", "600"].map((w) => document.fonts.load(w + " 16px Geist"))).catch(
      () => 0,
    )
  : 0;

// on charge les images de toutes les villes et les polices, on attend que toutes
// les polices de la page soient prêtes, puis on lance le dessin
Promise.all([...Object.keys(VILLES).map(chargerVille), POLICES])
  .then(() => (document.fonts ? document.fonts.ready : 0))
  .then(demarrer);

/* ---------- 3. Changement de taille de la fenêtre ---------- */

// minuterie qui regroupe les redimensionnements rapprochés en un seul redessin
let minuterieRedim;

// on attend 200 ms sans nouveau redimensionnement avant d'agir ;
// si l'on franchit le seuil de 900 px (téléphone / ordinateur), la page est rechargée,
// car les deux modes n'ont pas la même structure ; sinon, on redessine simplement
addEventListener("resize", () => {
  clearTimeout(minuterieRedim);
  minuterieRedim = setTimeout(() => {
    if (innerWidth < 900 !== LECTEUR.on) location.reload();
    else demarrer();
  }, 200);
});
