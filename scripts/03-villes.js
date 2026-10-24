/* =====================================================================
   CARTES DES VILLES (HIROSHIMA, NAGASAKI, RENNES)
   ---------------------------------------------------------------------
   Ce fichier charge les fonds de carte de chaque ville (eau, rues, bâti)
   et dessine la carte d'une ville dans un canevas : avant la bombe, ou
   après avec les zones rasée et endommagée et les cercles de 1, 2 et 3 km.
   Il calcule aussi le cadrage (zoom et centre) selon la taille de l'écran.
   Utilise : VILLES, LECTEUR, ROUGE, DEG_EN_RAD (01), versMercator, tracerGeometrie,
             distanceKm (02), DONNEES_VILLES (donnees/villes.js).
   Fournit : chargerVille, cadrageVille, dessinerVille, bandeLibre, empriseZone.
   ===================================================================== */

// Conventions utilisées dans tout le fichier :
//   W, H : largeur et hauteur du canevas, en pixels réels.
//   d    : densité de l'écran (nombre de pixels réels par pixel CSS).
//   c    : fiche d'une ville, prise dans VILLES (voir 01-reglages.js).
//   lo, la : longitude et latitude en degrés.
//   Emprise « box » : [ouest, est, sud, nord] en mètres autour de l'hypocentre.

/* ---------- 1. Chargement des fonds de carte ----------
   Chaque ville a trois images (masques) à environ 3 m par pixel :
   l'eau, les rues et le bâti. */
// IMAGES_VILLES : pour chaque ville, les images chargées et la promesse « ready ».
const IMAGES_VILLES = {};

// Nom de chaque couche dans les noms de fichiers d'images.
const NOMS_FICHIERS_COUCHES = { water: "eau", road: "rues", bld: "bati" };

// Lance le chargement des trois images d'une ville (une seule fois par ville).
// id : code de la ville ("hiro", "naga" ou "ren").
// Renvoie une promesse tenue quand les trois images sont chargées. Une image
// manquante ne bloque pas le site : son erreur est traitée comme une fin de chargement.
// Exemple de fichier : images/fonds-de-carte/hiroshima-eau.webp
function chargerVille(id) {
  if (IMAGES_VILLES[id]) return IMAGES_VILLES[id].ready;
  const o = (IMAGES_VILLES[id] = {});
  // n : nom de la couche ("water", "road" ou "bld") ; res : signale la fin du chargement.
  o.ready = Promise.all(
    ["water", "road", "bld"].map(
      (n) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => {
            o[n] = im;
            res();
          };
          im.onerror = res;
          im.src = `images/fonds-de-carte/${VILLES[id].name.toLowerCase()}-${NOMS_FICHIERS_COUCHES[n]}.webp`;
        }),
    ),
  );
  return o.ready;
}

/* ---------- 2. Coloriage d'un masque ---------- */
// Canevas de travail réutilisé d'un dessin à l'autre (recréé si la taille change).
let canevasTemporaire;

// Peint une image masque (eau, rues ou bâti) d'une seule couleur, puis la pose sur la carte.
// ctx   : contexte 2D du canevas de la carte.
// im    : image masque (si elle n'est pas chargée, on ne fait rien).
// box   : position de l'image en pixels [gauche, haut, largeur, hauteur].
// col   : couleur à appliquer ; alpha : opacité de 0 (invisible) à 1 (opaque).
function teinterMasque(ctx, im, box, col, alpha) {
  if (!im) return;
  const W = ctx.canvas.width,
    H = ctx.canvas.height;
  if (!canevasTemporaire || canevasTemporaire.width !== W || canevasTemporaire.height !== H) {
    canevasTemporaire = document.createElement("canvas");
    canevasTemporaire.width = W;
    canevasTemporaire.height = H;
  }
  const t = canevasTemporaire.getContext("2d");
  // « copy » : l'image remplace tout le contenu précédent du canevas de travail.
  t.globalCompositeOperation = "copy";
  t.drawImage(im, ...box);
  // « source-in » : la couleur ne s'applique que là où l'image a des pixels.
  t.globalCompositeOperation = "source-in";
  t.fillStyle = col;
  t.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(canevasTemporaire, 0, 0);
  ctx.restore();
}

/* ---------- 3. Cadrage de la carte d'une ville ---------- */
// Calcule l'échelle et la position de la carte dans le canevas.
// c : fiche de la ville ; W, H : taille du canevas ; d : densité de l'écran.
// o : options facultatives { zoom : agrandissement, thumb : vrai pour une vignette }.
// Renvoie { K, s, cx, cy, tf } :
//   K  : facteur d'agrandissement de Mercator à cette latitude (1 m réel = K m Mercator)
//   s  : échelle, en pixels par mètre Mercator
//   cx, cy : position de l'hypocentre dans le canevas, en pixels
//   tf : fonction (lo, la) qui renvoie la position [x, y] en pixels
function cadrageVille(c, W, H, d, o = {}) {
  const O = versMercator(...c.hyp),
    K = 1 / Math.cos(c.hyp[1] * DEG_EN_RAD);
  // desk : écran large (900 pixels CSS ou plus).
  // fit  : lecteur téléphone, hors vignette ; la carte doit tenir dans la bande libre (vb).
  const desk = W / d >= 900,
    fit = LECTEUR.on && !desk && !o.thumb,
    vb = fit ? bandeLibre(H, d) : null;
  // Sur téléphone : toute la zone (rasée et endommagée) tient dans la bande libre,
  // et le fond de carte remplit la bande sans laisser de vide.
  let s, cx, cy;
  if (fit) {
    // [x0, x1, y0, y1] : emprise du fond de carte ; [zx0, zx1, zy0, zy1] : emprise des zones.
    // bot : le fond de carte descend 14 pixels CSS sous la bande, derrière le texte.
    const [x0, x1, y0, y1] = DONNEES_VILLES[c.id].box,
      [zx0, zx1, zy0, zy1] = empriseZone(c),
      bot = vb.bot + 14 * d;
    // pm : pixels par mètre réel. Les zones occupent au plus 90 % de la largeur
    // et 88 % de la hauteur de la bande.
    let pm = Math.min((W * 0.9) / (zx1 - zx0), (vb.h * 0.88) / (zy1 - zy0)) * (o.zoom || 1);
    // On zoome au moins assez pour que le fond de carte couvre toute la largeur et la bande.
    pm = Math.max(pm, W / (x1 - x0), (bot - vb.top) / (y1 - y0));
    // On centre les zones dans la bande (y vers le nord, donc soustrait à l'écran).
    cx = W / 2 - ((zx0 + zx1) / 2) * pm;
    cy = vb.c + ((zy0 + zy1) / 2) * pm;
    // On décale si besoin pour que les bords du fond de carte ne laissent aucun vide.
    cx = Math.min(-x0 * pm, Math.max(W - x1 * pm, cx));
    cy = Math.min(vb.top + y1 * pm, Math.max(bot + y0 * pm, cy));
    s = pm / K;
  } else {
    // span : terrain visible en mètres Mercator. Vignette : 80 % de c.span ;
    // PC : 100 % ; petit écran sans lecteur : 62 % (vue plus serrée).
    const span = c.span * (o.zoom || 1) * (o.thumb ? 0.8 : desk ? 1 : 0.62) * K;
    s = Math.max(W, H) / span;
    // Hypocentre à 60 % de la largeur sur PC (le texte est à gauche), au centre ailleurs.
    // Sur petit écran, il est placé à 36 % de la hauteur, au-dessus du texte.
    cx = W * (o.thumb ? 0.5 : desk ? 0.6 : 0.5);
    cy = o.thumb ? H * 0.5 : desk ? H * 0.5 : H * 0.36;
  }
  return {
    K,
    s,
    cx,
    cy,
    tf: (lo, la) => {
      const p = versMercator(lo, la);
      return [cx + (p[0] - O[0]) * s, cy + (p[1] - O[1]) * s];
    },
  };
}

/* ---------- 4. Motif de hachures ---------- */
// Crée un petit carré avec une diagonale rouge, répété pour hachurer la zone endommagée.
// d : densité de l'écran. Le carré fait 7 pixels CSS de côté (au moins 4 pixels réels).
// Renvoie le petit canevas qui sert de motif.
function motifHachures(d) {
  const hp = document.createElement("canvas");
  hp.width = hp.height = Math.max(4, Math.round(7 * d));
  const hx = hp.getContext("2d");
  hx.strokeStyle = "rgba(229,38,45,.55)";
  hx.lineWidth = 1 * d;
  hx.beginPath();
  hx.moveTo(0, hp.height);
  hx.lineTo(hp.width, 0);
  hx.stroke();
  return hp;
}

/* ---------- 5. Dessin complet de la carte d'une ville ---------- */
// Dessine la carte d'une ville dans un canevas.
// ctx   : contexte 2D du canevas ; W, H : sa taille ; d : densité de l'écran.
// c     : fiche de la ville ; after : vrai pour l'état « après la bombe ».
// o     : options facultatives :
//   zoom  : agrandissement ;  thumb : vrai pour une vignette (dessin simplifié) ;
//   only  : une seule couche, pour la vue éclatée ("eau", "rues", "bati", "zones", "reperes").
// Ne renvoie rien : le dessin est fait directement dans ctx.
function dessinerVille(ctx, W, H, d, c, after, o = {}) {
  // g : données des zones ; L : images du fond de carte (vide si pas encore chargées).
  const g = DONNEES_VILLES[c.id],
    L = IMAGES_VILLES[c.id] || {};
  const { K, s, cx, cy, tf } = cadrageVille(c, W, H, d, o);
  const only = o.only;
  // box : place des images du fond de carte en pixels [gauche, haut, largeur, hauteur].
  // Mètres réels x K x s = pixels.
  const [x0, x1, y0, y1] = g.box,
    box = [cx + x0 * K * s, cy - y1 * K * s, (x1 - x0) * K * s, (y1 - y0) * K * s];
  // Fond couleur papier (sauf en vue éclatée, où chaque couche est seule).
  if (!only) {
    ctx.fillStyle = "#F4F4F1";
    ctx.fillRect(0, 0, W, H);
  }
  // tot : zone rasée ; par : zone endommagée ; hit : les deux réunies.
  const tot = tracerGeometrie(g.total, tf),
    par = tracerGeometrie(g.partial, tf);
  const hit = new Path2D();
  hit.addPath(tot);
  hit.addPath(par);
  // Après la bombe : on remplit les zones (rose pour la zone rasée, rose pâle hachuré
  // pour la zone endommagée).
  if (after && (!only || only === "zones")) {
    ctx.fillStyle = "#F7D2D0";
    ctx.fill(tot, "evenodd");
    ctx.fillStyle = "#F7EEEC";
    ctx.fill(par, "evenodd");
    ctx.fillStyle = ctx.createPattern(motifHachures(d), "repeat");
    ctx.fill(par, "evenodd");
  }
  // Eau en gris bleu ; rues en noir léger (18 % en vignette, 24 % sinon).
  if (!only || only === "eau") teinterMasque(ctx, L.water, box, "#AEBBCB", 1);
  if (!only || only === "rues") teinterMasque(ctx, L.road, box, "#111", o.thumb ? 0.18 : 0.24);
  // Bâti.
  if (!only || only === "bati") {
    if (!after || only) {
      // Avant la bombe (ou vue éclatée) : tout le bâti à 90 % d'opacité.
      ctx.save();
      ctx.globalAlpha = 0.9;
      L.bld && ctx.drawImage(L.bld, ...box);
      ctx.restore();
    } else {
      // Après la bombe : bâti intact hors des zones (90 %). Le tracé « out » couvre
      // tout le canevas sauf les zones (règle evenodd : les zones font des trous).
      ctx.save();
      const out = new Path2D();
      out.rect(0, 0, W, H);
      out.addPath(hit);
      ctx.clip(out, "evenodd");
      ctx.globalAlpha = 0.9;
      L.bld && ctx.drawImage(L.bld, ...box);
      ctx.restore();
      // Zone endommagée : bâti à moitié effacé (42 %).
      ctx.save();
      ctx.clip(par, "evenodd");
      ctx.globalAlpha = 0.42;
      L.bld && ctx.drawImage(L.bld, ...box);
      ctx.restore();
      // Zone rasée : bâti presque disparu (12 %).
      ctx.save();
      ctx.clip(tot, "evenodd");
      ctx.globalAlpha = 0.12;
      L.bld && ctx.drawImage(L.bld, ...box);
      ctx.restore();
    }
  }
  // Contour en pointillés rouges de la zone endommagée (plus fin en vignette).
  if (after && (!only || only === "zones")) {
    ctx.strokeStyle = ROUGE;
    ctx.lineJoin = "round";
    ctx.setLineDash([6 * d, 4 * d]);
    ctx.lineWidth = (o.thumb ? 0.9 : 1.8) * d;
    ctx.stroke(par);
    ctx.setLineDash([]);
  }
  // Une vignette s'arrête ici : pas de cercles ni de marque d'hypocentre.
  if (o.thumb) return;
  // Cercles de 1, 2 et 3 km autour de l'hypocentre (k x 1000 m convertis en pixels).
  if (after && (!only || only === "reperes")) {
    ctx.save();
    ctx.strokeStyle = "rgba(17,17,17,.85)";
    ctx.lineWidth = 1.6 * d;
    ctx.setLineDash([7 * d, 5 * d]);
    [1, 2, 3].forEach((k) => {
      ctx.beginPath();
      ctx.arc(cx, cy, k * 1000 * K * s, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }
  // Marque de l'hypocentre : disque blanc, puis point noir (après) ou viseur (avant).
  if (!only || only === "reperes") {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, 9 * d, 0, Math.PI * 2);
    ctx.fill();
    if (after || only) {
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5 * d, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Viseur : un cercle et une croix de 12 pixels CSS de chaque côté.
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.4 * d;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 * d, 0, Math.PI * 2);
      ctx.moveTo(cx - 12 * d, cy);
      ctx.lineTo(cx + 12 * d, cy);
      ctx.moveTo(cx, cy - 12 * d);
      ctx.lineTo(cx, cy + 12 * d);
      ctx.stroke();
    }
  }
}

/* ---------- 6. Bande libre sur téléphone ---------- */
// Calcule la bande de carte visible sur téléphone : sous l'en-tête, au-dessus du texte.
// H : hauteur du canevas ; d : densité de l'écran.
// Renvoie { top, bot, h, c } en pixels réels : haut, bas, hauteur et milieu de la bande.
function bandeLibre(H, d) {
  // Le haut est 6 pixels CSS sous l'en-tête du lecteur (100 pixels si l'en-tête est absent).
  const t = document.querySelector("#player .pv-top");
  // Le bas est 10 pixels CSS au-dessus du texte. Si sa hauteur n'est pas encore connue,
  // on compte 32 % de l'écran. La bande garde au moins la moitié haute de l'écran.
  const top = ((t ? t.getBoundingClientRect().bottom : 100) + 6) * d,
    bot = Math.max(H * 0.5, H - ((LECTEUR.sheet || (H / d) * 0.32) + 10) * d);
  return { top, bot, h: bot - top, c: (top + bot) / 2 };
}

/* ---------- 7. Emprise des zones détruites ---------- */
// Résultats déjà calculés, rangés par code de ville.
const cacheEmprises = {};

// Calcule le rectangle qui contient les zones rasée et endommagée d'une ville.
// c : fiche de la ville.
// Renvoie [ouest, est, sud, nord] en mètres autour de l'hypocentre (x vers l'est,
// y vers le nord). Le rectangle fait au moins 1800 m de chaque côté.
function empriseZone(c) {
  if (cacheEmprises[c.id]) return cacheEmprises[c.id];
  // lo0, la0 : hypocentre. kx : mètres par degré de longitude à cette latitude
  // (111 320 m à l'équateur, moins vers les pôles). 110 574 : mètres par degré de latitude.
  const g = DONNEES_VILLES[c.id],
    [lo0, la0] = c.hyp,
    kx = 111320 * Math.cos(la0 * DEG_EN_RAD);
  const b = [-1800, 1800, -1800, 1800];
  for (const geom of [g.total, g.partial]) {
    if (!geom) continue;
    const P = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    // On élargit le rectangle pour chaque point des contours.
    for (const poly of P)
      for (const ring of poly)
        for (const [lo, la] of ring) {
          const x = (lo - lo0) * kx,
            y = (la - la0) * 110574;
          b[0] = Math.min(b[0], x);
          b[1] = Math.max(b[1], x);
          b[2] = Math.min(b[2], y);
          b[3] = Math.max(b[3], y);
        }
  }
  return (cacheEmprises[c.id] = b);
}
