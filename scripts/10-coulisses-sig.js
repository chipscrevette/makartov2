/* =====================================================================
   COULISSES SIG : LA CARTE ÉCLATÉE
   ---------------------------------------------------------------------
   Ce fichier construit la section « Coulisses SIG » : une pile de calques
   (eau, rues, bâti, zones de 1945, repères, transposition à Rennes) qui
   s'ouvre en 3D pendant le défilement. Chaque texte de la section met un
   calque en avant. La pile bouge en douceur : on lui donne une cible, et
   elle s'en approche un peu à chaque image. Une étiquette à plat suit
   chaque calque.
   Utilise : VILLES, MOUVEMENT_REDUIT, LECTEUR (01-reglages.js),
   dessinerVille (03-villes.js).
   Fournit : dessinerCouches, coulissesAuDefilement, animerPile
   (appelées par 14-demarrage.js), choisirCouche (utilisée par
   13-lecteur-telephone.js).
   ===================================================================== */

/* ---------- 1. Liste des calques et construction de la pile ---------- */

// Chaque calque : [code utilisé par dessinerVille, nom affiché sur l'étiquette].
const COUCHES = [
  ["eau", "Eau"],
  ["rues", "Rues"],
  ["bati", "Bâti"],
  ["zones", "Zones de 1945"],
  ["reperes", "Repères"],
  ["ren", "Transposition"],
];

// Le conteneur HTML qui reçoit les calques.
const pile = document.getElementById("stack");

// Pour chaque calque (k = code, t = nom, i = position dans la pile), on crée :
// - un bloc .layer avec un canevas et quatre points .pt invisibles posés aux quatre coins
//   (ils servent à retrouver où se trouve chaque coin une fois le calque incliné en 3D) ;
// - une étiquette .ltag avec le nom du calque.
// Le premier calque porte en plus la classe "base" (le fond de la pile).
COUCHES.forEach(([k, t], i) => {
  const l = document.createElement("div");
  l.className = "layer" + (i === 0 ? " base" : "");
  l.dataset.k = k;
  l.innerHTML = `<canvas></canvas><i class="pt" style="left:0;top:0"></i><i class="pt" style="right:0;top:0"></i><i class="pt" style="right:0;bottom:0"></i><i class="pt" style="left:0;bottom:0"></i>`;
  pile.appendChild(l);
  const g = document.createElement("div");
  g.className = "ltag";
  g.innerHTML = `<span>${t}</span>`;
  document.getElementById("ltags").appendChild(g);
});

/* ---------- 2. Dessin de chaque calque ---------- */

// Dessine le contenu de chaque calque dans son canevas. Ne renvoie rien.
// l : un calque ; i : sa position ; c : son canevas ; d : densité de l'écran (pixels réels
// par pixel CSS, plafonnée à 2) ; W et H : largeur et hauteur du canevas en pixels réels ;
// x : le « pinceau » 2D du canevas ; k : le code du calque.
// span: 7000 : on montre une zone d'environ 7 km de large, plus serrée que la carte du récit.
function dessinerCouches() {
  const ls = [...pile.children];
  ls.forEach((l, i) => {
    const c = l.querySelector("canvas"),
      r = c.getBoundingClientRect(),
      d = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(c.offsetWidth * d),
      H = Math.round(c.offsetHeight * d);
    // Canevas caché (largeur nulle) : rien à dessiner.
    if (!W) return;
    c.width = W;
    c.height = H;
    const x = c.getContext("2d");
    const k = COUCHES[i][0];
    // Seul le calque du fond reçoit un fond plein (couleur papier) ; les autres restent
    // transparents pour laisser voir ceux du dessous.
    if (i === 0) {
      x.fillStyle = "#F4F4F1";
      x.fillRect(0, 0, W, H);
    }
    // Dernier calque : les zones de 1945 reportées sur Rennes.
    if (k === "ren") {
      dessinerVille(x, W, H, d, { ...VILLES.ren, span: 7000 }, true, { thumb: 1, only: "zones" });
      return;
    }
    // Autres calques : un seul élément de Hiroshima (option only). Les repères sont dessinés
    // en taille normale (thumb faux) pour que leurs noms restent affichés.
    dessinerVille(x, W, H, d, { ...VILLES.hiro, span: 7000 }, true, {
      only: k,
      thumb: k !== "reperes"
    });
  });
}

/* ---------- 3. Suivi du défilement : quel calque mettre en avant ---------- */

// Les textes de la section ; chacun porte data-l = numéro du calque mis en avant
// (0 = vue d'ensemble, 1 à 6 = un calque, au-delà = pile refermée).
const etapesCoulisses = [...document.querySelectorAll("#labSteps .step")];

// La pile suit le défilement en douceur : on vise une cible, et on s'en approche à chaque image.
// etatPile = l'état affiché maintenant : open = ouverture de la pile (0 fermée, 1 ouverte),
// lift = de combien chaque calque est soulevé (0 à 1).
const etatPile = { open: 0, lift: COUCHES.map(() => 0) };

// ciblePile = l'état à atteindre (cur = numéro du calque en avant, -1 = aucun) ;
// imagePile = numéro de l'image d'animation demandée (0 si aucune n'est en attente).
let ciblePile = { open: 0, cur: -1 },
  imagePile = 0;

// Appelée à chaque défilement sur PC. Cherche le dernier texte dont le haut est passé
// au-dessus de 60 % de la hauteur de l'écran, puis met en avant son calque.
// Sur téléphone (lecteur actif), c'est 13-lecteur-telephone.js qui s'en charge.
function coulissesAuDefilement() {
  if (LECTEUR.on) return;
  let cur = -1;
  etapesCoulisses.forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.top < innerHeight * 0.6) cur = +s.dataset.l;
  });
  choisirCouche(cur);
}

// Met en avant un calque. cur : numéro du calque (1 à 6), ou une autre valeur pour
// aucun calque (pile fermée). Ne renvoie rien.
// Classes CSS posées sur les calques : "hot" = calque choisi, "dim" = les autres, estompés,
// "gone" = le calque Rennes, masqué quand la pile est fermée.
function choisirCouche(cur) {
  // La pile s'ouvre seulement si un calque de 1 à 6 est choisi.
  ciblePile = { open: cur >= 1 && cur <= 6 ? 1 : 0, cur };
  [...pile.children].forEach((l, i) => {
    const on = cur >= 1 && cur <= 6;
    // cur commence à 1 alors que i commence à 0 : d'où le « cur - 1 ».
    l.classList.toggle("dim", on && i !== cur - 1);
    l.classList.toggle("hot", on && i === cur - 1);
    l.classList.toggle("gone", !on && i === COUCHES.length - 1);
  });
  [...document.getElementById("ltags").children].forEach((g, i) =>
    g.classList.toggle("on", cur >= 1 && cur <= 6 && i === cur - 1),
  );
  // On lance l'animation seulement si elle ne tourne pas déjà.
  if (!imagePile) imagePile = requestAnimationFrame(animerPile);
}

/* ---------- 4. Animation de la pile en 3D ---------- */

// Fait avancer la pile d'un petit pas vers sa cible, puis redemande une image tant que
// la cible n'est pas atteinte. Ne renvoie rien.
// k : part du chemin restant parcourue à chaque image (0.075 = 7,5 %, d'où un mouvement
// qui ralentit en arrivant) ; avec moins d'animations demandé, k = 1 : saut direct.
// mob : vrai si l'écran fait moins de 900 px de large (téléphone).
function animerPile() {
  imagePile = 0;
  const k = MOUVEMENT_REDUIT ? 1 : 0.075;
  let moving = false;
  const mob = innerWidth < 900;
  // Un pas : v = valeur actuelle, t = valeur cible. Renvoie la nouvelle valeur.
  // Si on est à moins de 0.001 de la cible, on s'y pose directement ; sinon on note
  // qu'il faudra encore une image.
  const step = (v, t) => {
    const n = v + (t - v) * k;
    if (Math.abs(t - n) > 0.001) moving = true;
    else return t;
    return n;
  };
  etatPile.open = step(etatPile.open, ciblePile.open);
  etatPile.lift = etatPile.lift.map((v, i) => step(v, ciblePile.cur - 1 === i ? 1 : 0));
  // e : ouverture actuelle (0 à 1) ; gap : écart en pixels entre deux calques
  // (42 px sur téléphone, 72 px sur PC, quand la pile est grande ouverte).
  const e = etatPile.open,
    gap = (mob ? 42 : 72) * e;
  // On incline la pile : jusqu'à 54 degrés vers l'arrière et -36 degrés de rotation à plat.
  pile.style.setProperty("--rx", 54 * e + "deg");
  pile.style.setProperty("--rz", -36 * e + "deg");
  // On écarte les calques en profondeur. (i - 2.5) centre les 6 calques autour du milieu.
  // Le calque choisi monte en plus de 40 px (téléphone) ou 70 px (PC).
  [...pile.children].forEach((l, i) => {
    l.style.transform = `translateZ(${(i - 2.5) * gap + etatPile.lift[i] * (mob ? 40 : 70) * e}px)`;
  });
  placerEtiquettesCouches();
  if (moving) imagePile = requestAnimationFrame(animerPile);
}

/* ---------- 5. Étiquettes des calques ---------- */

// Étiquettes à plat : accrochées au coin le plus à droite de chaque calque, sans rotation.
// st : position et taille de la scène qui contient la pile ; tags : les étiquettes ;
// pts : les quatre coins d'un calque à l'écran ; p : le coin le plus à droite ;
// h et w : hauteur et largeur de l'étiquette (30 et 120 px par défaut si pas encore mesurées).
// Ne renvoie rien.
function placerEtiquettesCouches() {
  const st = pile.parentElement.getBoundingClientRect(),
    tags = [...document.getElementById("ltags").children];
  [...pile.children].forEach((l, i) => {
    const pts = [...l.querySelectorAll(".pt")].map((p) => p.getBoundingClientRect());
    const p = pts.reduce((a, b) => (b.left > a.left ? b : a));
    const g = tags[i],
      h = g.offsetHeight || 30,
      w = g.offsetWidth || 120;
    // Position voulue : 6 px à droite du coin, mesurée depuis le coin haut gauche de la scène.
    let x = p.left - st.left + 6,
      y = p.top - st.top;
    // On empêche l'étiquette de sortir à droite (marge de 12 px).
    x = Math.min(x, st.width - w - 12);
    // tp : limite haute. Sur téléphone, juste sous la barre du haut du lecteur (+ 8 px) ;
    // sur PC, 76 px depuis le haut de la scène.
    const tp = LECTEUR.on
      ? document.querySelector("#player .pv-top").getBoundingClientRect().bottom - st.top + 8
      : 76;
    // On garde l'étiquette entre cette limite haute et le bas de la scène (marge de 12 px).
    y = Math.max(tp + h / 2, Math.min(st.height - h / 2 - 12, y));
    g.style.transform = `translate(${x}px,${y - h / 2}px)`;
  });
}

/* ---------- 6. Branchement sur le défilement ---------- */

addEventListener("scroll", coulissesAuDefilement, { passive: true });
