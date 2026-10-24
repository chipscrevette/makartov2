/* =====================================================================
   DESSIN DE LA CARTE DU PACIFIQUE
   ---------------------------------------------------------------------
   Ce fichier dessine, dans le canevas, la carte de la guerre du Pacifique :
   fond quadrillé, terres colorées selon qui les contrôle, noms des régions,
   contour de l'empire en 1942, flèches des avancées alliées, vol vers
   Hiroshima et Nagasaki, repères des lieux, année en fond et échelle.
   Il gère aussi les niveaux de détail des terres (plus fins quand on zoome)
   et une image en cache pour rester fluide pendant les mouvements de caméra.
   Utilise : COULEURS_PACIFIQUE, LIEUX_PACIFIQUE, FLECHES_ALLIEES, EXTENSION_1942,
   NOMS_REGIONS, ECHELLE_EST_OUEST (04), TERRES_PACIFIQUE (donnees/pacifique.js),
   ROUGE, LECTEUR, HYPOCENTRE_HIROSHIMA, HYPOCENTRE_NAGASAKI (01),
   arcGrandCercle, distanceKm (02), bandeLibre (03), sceneActuelle, camera,
   pinceau, carte, densite (07 et 08).
   Fournit : cadragePacifique, dessinerPacifique, melangerEtapes,
   chargerNiveauxDetail, etiquetteSurCarte, zonesAEviter.
   ===================================================================== */

/* Conventions utilisées dans tout le fichier :
   W et H = largeur et hauteur du canevas en pixels réels.
   d = densité de l'écran (nombre de pixels réels par pixel CSS).
   lo, la = longitude et latitude en degrés.
   tf = fonction qui transforme (lo, la) en position [x, y] sur le canevas.
   st = état de la carte (une étape, ou un mélange de deux étapes, voir 04). */

/* ---------- 1. Cadrage : passer des degrés aux pixels ---------- */

// Calcule comment placer la carte dans le canevas pour une caméra donnée.
// cam = caméra ou étape : cam.c = centre [lo, la], cam.km = largeur montrée en km.
// La projection est simple : un degré de latitude vaut 110,57 km, un degré de
// longitude vaut 111,32 km multiplié par ECHELLE_EST_OUEST (valeur fixe prise à 20 degrés).
// Renvoie { s, tf } : s = nombre de pixels par kilomètre, tf = fonction (lo, la) => [x, y].
function cadragePacifique(cam, W, H, d) {
  // desk = vrai sur un écran large (900 pixels CSS ou plus)
  const desk = W / d >= 900;
  const s = W / cam.km;
  // Point de l'écran où se place le centre de la caméra.
  // Sur PC : à 62 % de la largeur (le texte occupe la gauche), à mi-hauteur.
  // Sur téléphone : au milieu en largeur ; en hauteur, au centre de la bande libre
  // du lecteur s'il est ouvert, sinon à 30 % de la hauteur.
  const cx = W * (desk ? 0.62 : 0.5),
    cy = desk ? H * 0.5 : LECTEUR.on ? bandeLibre(H, d).c : H * 0.3;
  return {
    s,
    // On mesure l'écart au centre en km, puis on le convertit en pixels.
    // Le signe moins sert car, sur le canevas, y augmente vers le bas.
    tf: (lo, la) => [
      cx + (lo - cam.c[0]) * 111.32 * ECHELLE_EST_OUEST * s,
      cy - (la - cam.c[1]) * 110.57 * s,
    ],
  };
}

/* ---------- 2. Courbes et polygones ---------- */

// Transforme une ligne brisée en courbe douce qui passe par tous les points
// (méthode de Catmull-Rom).
// pts = liste de points [x, y] ; n = nombre de points calculés entre deux points d'origine.
// Renvoie la nouvelle liste de points, plus serrée.
function courbeLissee(pts, n = 14) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    // On utilise 4 points : le précédent (p0), les deux qui bornent le tronçon (p1, p2)
    // et le suivant (p3). Aux extrémités, on répète le point du bout.
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    for (let k = 0; k < n; k++) {
      // t va de 0 (en p1) à presque 1 (en p2)
      const t = k / n,
        t2 = t * t,
        t3 = t2 * t;
      // Formule de Catmull-Rom, appliquée séparément à x (j = 0) et à y (j = 1)
      out.push(
        [0, 1].map(
          (j) =>
            0.5 *
            (2 * p1[j] +
              (-p0[j] + p2[j]) * t +
              (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
              (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3),
        ),
      );
    }
  }
  // On ajoute le tout dernier point, que la boucle n'atteint jamais
  out.push(pts[pts.length - 1]);
  return out;
}

// Contour de 1942 lissé et fermé. On ajoute les deux premiers points à la fin pour que
// la courbe revienne en douceur au départ. On retire ensuite les 14 derniers points
// (le tronçon en trop) : la courbe se termine ainsi pile sur le point de départ.
const EXTENSION_1942_LISSEE = courbeLissee(
  [...EXTENSION_1942, EXTENSION_1942[0], EXTENSION_1942[1]]
).slice(0, -14);

// Construit un tracé (Path2D) à partir d'anneaux de points [lo, la].
// rings = liste d'anneaux (chaque anneau est un contour fermé) ; tf = conversion en pixels.
// Renvoie le tracé, prêt à être rempli ou contouré.
function tracerPolygone(rings, tf) {
  const p = new Path2D();
  for (const r of rings) {
    // c = un point [lo, la] ; i = son rang. Premier point : moveTo, les autres : lineTo.
    r.forEach((c, i) => {
      const q = tf(c[0], c[1]);
      i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]);
    });
    p.closePath();
  }
  return p;
}

/* ---------- 3. Zones de l'écran à ne pas couvrir ---------- */
// Rectangles { l, t, r, b } (gauche, haut, droite, bas, en pixels réels) occupés par
// l'interface : légende, barre de navigation, lecteur téléphone.
// Remplie par majInterface (07-scene-carte.js). Les étiquettes évitent ces zones.
let zonesAEviter = [];

/* ---------- 4. Niveaux de détail des terres ---------- */
// Trois versions des terres, de la plus légère à la plus fine.
// tol = précision du tracé, en degrés (0.04 = les détails plus petits que 0,04 degré
// ont été effacés). La première version est déjà chargée (donnees/pacifique.js) ;
// les deux autres sont lues plus tard depuis des fichiers JSON (url).
// Chaque niveau est découpé en tuiles de 10 degrés sur 10. Chaque tuile garde ses tracés
// tout prêts (Path2D en degrés). À chaque image, on choisit seulement le niveau,
// on écarte les tuiles hors de l'écran et on pose une transformation : rien n'est recalculé.
const NIVEAUX_DETAIL = [
  { tol: 0.04, data: TERRES_PACIFIQUE },
  { tol: 0.01, url: "donnees/pacifique-detail-moyen.json" },
  { tol: 0.0025, url: "donnees/pacifique-detail-fin.json" },
];

// Range les terres d'un niveau dans des tuiles de 10 degrés.
// L = le niveau à remplir ; data = liste de [catégorie, anneaux].
// Ne renvoie rien : remplit L.tiles. Chaque tuile contient :
//   b = cadre englobant [lo min, la min, lo max, la max],
//   p = un tracé Path2D par catégorie (c),
//   n = nombre de points, qui sert à estimer le coût du dessin.
function preparerNiveau(L, data) {
  // T = tuiles déjà créées, rangées par clé "colonne,ligne"
  const T = new Map();
  for (const [c, rs] of data)
    for (const r of rs) {
      // Cadre englobant de l'anneau r. On part de valeurs énormes (1e9 = un milliard)
      // pour que le premier point les remplace forcément.
      let b = [1e9, 1e9, -1e9, -1e9];
      for (const [x, y] of r) {
        if (x < b[0]) b[0] = x;
        if (y < b[1]) b[1] = y;
        if (x > b[2]) b[2] = x;
        if (y > b[3]) b[3] = y;
      }
      // L'anneau va dans la tuile qui contient son coin sud-ouest
      const k = Math.floor(b[0] / 10) + "," + Math.floor(b[1] / 10);
      let t = T.get(k);
      if (!t) T.set(k, (t = { b: [...b], p: {}, n: 0 }));
      t.n += r.length;
      // On agrandit le cadre de la tuile pour qu'il contienne aussi cet anneau
      t.b = [
        Math.min(t.b[0], b[0]),
        Math.min(t.b[1], b[1]),
        Math.max(t.b[2], b[2]),
        Math.max(t.b[3], b[3]),
      ];
      const p = t.p[c] || (t.p[c] = new Path2D());
      r.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
    }
  L.tiles = [...T.values()];
  // Les données brutes ne servent plus : on les libère
  L.data = null;
}

// Le niveau le plus léger est préparé tout de suite
preparerNiveau(NIVEAUX_DETAIL[0], TERRES_PACIFIQUE);

// Vrai dès que le chargement des niveaux fins a commencé (pour ne le lancer qu'une fois)
let niveauxEnChargement = false;

// Télécharge les niveaux moyen puis fin, l'un après l'autre.
// Après chaque niveau prêt, on redessine la carte si la scène du Pacifique est affichée.
// En cas d'erreur, on ignore : la carte garde simplement le niveau plus léger.
function chargerNiveauxDetail() {
  if (niveauxEnChargement) return;
  niveauxEnChargement = true;
  // reduce enchaîne les téléchargements : q = promesse précédente, L = niveau suivant
  NIVEAUX_DETAIL.slice(1).reduce(
    (q, L) =>
      q.then(() =>
        fetch(L.url)
          .then((r) => r.json())
          .then((d) => {
            // ici d = données JSON du niveau (et non la densité)
            preparerNiveau(L, d);
            if (sceneActuelle && sceneActuelle.kind === "pac" && camera)
              dessinerPacifique(pinceau, carte.width, carte.height, densite, camera, true);
          })
          .catch(() => {}),
      ),
    Promise.resolve(),
  );
}

/* ---------- 5. Étiquettes des lieux ---------- */

// Dessine une étiquette en forme de pilule à côté d'un repère, sans chevaucher les autres.
// ctx = pinceau du canevas ; x, y = position du repère en pixels ;
// name = nom du lieu (écrit en majuscules) ; sub = sous-titre (date), peut être vide ;
// o = options : o.hot = étiquette rouge, o.left = essayer d'abord à gauche du repère ;
// placed = rectangles déjà occupés (l'étiquette posée y est ajoutée).
// Renvoie true si l'étiquette a pu être posée, false sinon.
function etiquetteSurCarte(ctx, x, y, name, sub, d, o = {}, placed) {
  // On mesure la largeur du nom (graisse 500), puis celle du sous-titre (graisse 400)
  ctx.font = `500 ${11 * d}px Geist, system-ui, sans-serif`;
  const t1 = name.toUpperCase();
  const w1 = ctx.measureText(t1).width;
  ctx.font = `400 ${11 * d}px Geist, system-ui, sans-serif`;
  // 8 pixels CSS d'écart entre le nom et le sous-titre
  const w2 = sub ? ctx.measureText(sub).width + 8 * d : 0;
  // h = hauteur de la pilule (22 px CSS), pad = marge intérieure (10 px), w = largeur totale
  const h = 22 * d,
    pad = 10 * d,
    w = w1 + w2 + pad * 2;
  // On essaie les deux côtés du repère, à 15 px CSS de distance
  for (const left of o.left ? [true, false] : [false, true]) {
    const x0 = left ? x - w - 15 * d : x + 15 * d,
      y0 = y - h / 2,
      r = { l: x0, t: y0, r: x0 + w, b: y0 + h };
    // Côté refusé si l'étiquette sort du canevas (marge de 4 px CSS)
    if (
      r.l < 4 * d ||
      r.r > ctx.canvas.width - 4 * d ||
      r.t < 4 * d ||
      r.b > ctx.canvas.height - 4 * d
    )
      continue;
    // Côté refusé si elle touche une étiquette, un repère ou une zone d'interface
    // (q = rectangle déjà occupé, avec 2 px CSS d'écart minimum)
    if (
      [...placed, ...zonesAEviter].some(
        (q) => r.l < q.r + 2 * d && r.r > q.l - 2 * d && r.t < q.b + 2 * d && r.b > q.t - 2 * d,
      )
    )
      continue;
    placed.push(r);
    // Fond de la pilule : rouge si o.hot, sinon blanc presque opaque
    ctx.fillStyle = o.hot ? ROUGE : "rgba(255,255,255,.96)";
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, h / 2);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.font = `500 ${11 * d}px Geist, system-ui, sans-serif`;
    ctx.fillStyle = o.hot ? "#fff" : "#111";
    // + 0.5 * d : léger décalage vers le bas pour centrer le texte à l'œil
    ctx.fillText(t1, x0 + pad, y + 0.5 * d);
    if (sub) {
      ctx.font = `400 ${11 * d}px Geist, system-ui, sans-serif`;
      ctx.fillStyle = o.hot ? "rgba(255,255,255,.8)" : "#7A7A7F";
      ctx.fillText(sub, x0 + pad + w1 + 8 * d, y + 0.5 * d);
    }
    return true;
  }
  return false;
}

/* ---------- 6. Flèches des avancées alliées ---------- */

// Dessine une flèche effilée : fine au départ, épaisse vers la pointe,
// avec une tête en chevron.
// pts = points de la flèche [lo, la] ; t = avancement de 0 à 1 (part de la flèche dessinée) ;
// tf = conversion en pixels. Ne renvoie rien.
function dessinerFleche(ctx, pts, t, tf, d) {
  // sp = la courbe lissée (24 points par tronçon), déjà en pixels
  const sp = courbeLissee(pts, 24).map((p) => tf(...p));
  // On ne garde que la part déjà parcourue (au moins 3 points)
  const n = Math.max(3, Math.round(sp.length * t));
  const q = sp.slice(0, n);
  // L[i] = distance parcourue depuis le départ jusqu'au point i, en pixels
  const L = [0];
  for (let i = 1; i < q.length; i++)
    L.push(L[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
  // tot = longueur totale (1 si nulle, pour éviter une division par zéro)
  const tot = L[L.length - 1] || 1;
  // Longueur de la tête : 22 px CSS, mais jamais plus de 40 % de la flèche
  const head = Math.min(22 * d, tot * 0.4);
  // On recule depuis la pointe pour trouver où s'arrête le corps et où commence la tête
  let k = q.length - 1;
  while (k > 1 && tot - L[k] < head * 0.7) k--;
  const body = q.slice(0, k + 1);
  // On calcule les deux bords du corps (left et right), de part et d'autre de la ligne
  const left = [],
    right = [];
  body.forEach((p, i) => {
    // a et b = points voisins ; (nx, ny) = direction perpendiculaire à la ligne, longueur 1
    const a = body[Math.max(0, i - 1)],
      b = body[Math.min(body.length - 1, i + 1)];
    let nx = -(b[1] - a[1]),
      ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // Demi-épaisseur : 0,6 px CSS au départ, jusqu'à 4 px (0,6 + 3,4) près de la tête
    const w = (0.6 + 3.4 * Math.pow(L[i] / tot, 0.8)) * d;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  });
  // tip = pointe ; base = début de la tête ; ang = direction de la tête ;
  // hw = demi-largeur de la tête (9 px CSS)
  const tip = q[q.length - 1],
    base = body[body.length - 1],
    ang = Math.atan2(tip[1] - base[1], tip[0] - base[0]),
    hw = 9 * d;
  // Forme complète : bord gauche, coin gauche de la tête, pointe, coin droit,
  // puis bord droit parcouru à l'envers
  const shape = new Path2D();
  left.forEach((p, i) => (i ? shape.lineTo(...p) : shape.moveTo(...p)));
  shape.lineTo(
    base[0] + Math.cos(ang + Math.PI / 2) * hw,
    base[1] + Math.sin(ang + Math.PI / 2) * hw,
  );
  shape.lineTo(tip[0], tip[1]);
  shape.lineTo(
    base[0] + Math.cos(ang - Math.PI / 2) * hw,
    base[1] + Math.sin(ang - Math.PI / 2) * hw,
  );
  for (let i = right.length - 1; i >= 0; i--) shape.lineTo(...right[i]);
  shape.closePath();
  // Un liseré clair autour de la flèche, puis la flèche noire par-dessus
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(244,244,241,.95)";
  ctx.lineWidth = 4 * d;
  ctx.stroke(shape);
  ctx.fillStyle = "#111";
  ctx.fill(shape);
  // Petit rond blanc cerclé de noir au point de départ
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.5 * d;
  ctx.beginPath();
  ctx.arc(q[0][0], q[0][1], 3.5 * d, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/* ---------- 7. Dessin des terres ---------- */

// Dessine les terres : on prend le niveau le plus léger dont l'erreur reste sous maxErr,
// et seulement les tuiles visibles.
// kx, ky = nombre de pixels par degré de longitude et de latitude ;
// ox, oy = position en pixels du point lo = 0, la = 0 (souvent hors de l'écran) ;
// st = état de la carte (st.y38 et st.y42 règlent l'apparition des conquêtes) ;
// maxErr = erreur de tracé acceptée, en pixels ; lines = vrai pour tracer les frontières.
function dessinerTerres(ctx, W, H, d, kx, ky, ox, oy, st, maxErr, lines) {
  const L = choisirNiveau(kx, maxErr);
  // Fenêtre visible en degrés : lo0 à lo1 (gauche à droite), la0 à la1 (bas en haut)
  const lo0 = -ox / kx,
    lo1 = (W - ox) / kx,
    la1 = oy / ky,
    la0 = (oy - H) / ky;
  // vis = tuiles dont le cadre touche la fenêtre visible (t = une tuile)
  const vis = L.tiles.filter(
    (t) => t.b[2] >= lo0 && t.b[0] <= lo1 && t.b[3] >= la0 && t.b[1] <= la1,
  );
  ctx.save();
  // Les tracés sont en degrés : cette transformation les convertit en pixels.
  // -ky retourne l'axe vertical, car y augmente vers le bas sur le canevas.
  ctx.setTransform(kx, 0, 0, -ky, ox, oy);
  // Remplit toutes les terres de la catégorie k avec la couleur col et l'opacité a (0 à 1)
  const fill = (k, col, a = 1) => {
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    for (const t of vis) if (t.p[k]) ctx.fill(t.p[k]);
    ctx.globalAlpha = 1;
  };
  // D'abord les couleurs de base
  fill("ne", COULEURS_PACIFIQUE.ne);
  fill("su", COULEURS_PACIFIQUE.su);
  fill("al", COULEURS_PACIFIQUE.al);
  fill("j30", COULEURS_PACIFIQUE.j30);
  // Conquêtes de 1938 : peintes d'abord comme alliées (leur état d'avant),
  // puis recouvertes de rouge selon st.y38 (fondu progressif)
  fill("j38", COULEURS_PACIFIQUE.al);
  fill("j38", COULEURS_PACIFIQUE.j38, st.y38);
  // Conquêtes de 1942 : même principe. j42n = territoires conquis en 1942
  // qui étaient neutres avant (d'où la couleur neutre de départ).
  fill("j42", COULEURS_PACIFIQUE.al);
  fill("j42n", COULEURS_PACIFIQUE.ne);
  fill("j42", COULEURS_PACIFIQUE.j42, st.y42);
  fill("j42n", COULEURS_PACIFIQUE.j42, st.y42);
  if (lines) {
    // Frontières claires. L'épaisseur est divisée par kx car on dessine en degrés.
    ctx.strokeStyle = "rgba(244,244,241,.55)";
    ctx.lineWidth = (0.7 * d) / kx;
    ctx.lineJoin = "round";
    for (const t of vis) for (const k in t.p) ctx.stroke(t.p[k]);
  }
  ctx.restore();
}

// Choisit le niveau de détail à dessiner, parmi ceux déjà chargés.
// kx = pixels par degré ; maxErr = erreur acceptée en pixels.
// Erreur d'un niveau à l'écran = sa précision (tol, en degrés) multipliée par kx.
// Renvoie le premier niveau (le plus léger) assez précis, sinon le plus fin disponible.
function choisirNiveau(kx, maxErr) {
  const ready = NIVEAUX_DETAIL.filter((l) => l.tiles);
  return ready.find((l) => l.tol * kx <= maxErr) || ready[ready.length - 1];
}

// Estime le coût du dessin des terres : le nombre de points des tuiles visibles.
// kx, ky = pixels par degré ; o0 = position [x, y] en pixels du point lo = 0, la = 0.
// 2.4 = erreur acceptée en pixels pour cette estimation.
// Renvoie le nombre de points.
function coutDessinTerres(W, H, kx, ky, o0) {
  const L = choisirNiveau(kx, 2.4),
    lo0 = -o0[0] / kx,
    lo1 = (W - o0[0]) / kx,
    la1 = o0[1] / ky,
    la0 = (o0[1] - H) / ky;
  let n = 0;
  for (const t of L.tiles)
    if (t.b[2] >= lo0 && t.b[0] <= lo1 && t.b[3] >= la0 && t.b[1] <= la1) n += t.n;
  return n;
}

/* ---------- 8. Image des terres en cache ---------- */
// Image des terres dessinée avec une marge autour de l'écran. Tant que la caméra reste
// proche, on recadre cette image au lieu de tout redessiner.
// cv = canevas caché (jamais affiché) ; k = description de ce qu'il contient
// (taille, niveau de détail, opacités, échelle et position), ou null s'il est vide.
const cacheTerres = { cv: document.createElement("canvas"), k: null };

// Dessine les terres en réutilisant l'image en cache quand c'est possible.
// kx, ky = pixels par degré ; o0 = position en pixels du point lo = 0, la = 0 ;
// st = état de la carte. Ne renvoie rien.
function dessinerTerresAvecCache(ctx, W, H, d, kx, ky, o0, st) {
  // m = marge autour de l'écran : 30 % du plus grand côté
  const m = Math.round(0.3 * Math.max(W, H)),
    c = cacheTerres.cv,
    k = cacheTerres.k;
  // lod = nombre de niveaux de détail chargés (si un niveau arrive, on redessine).
  // y38 et y42 sont arrondis au vingtième (pas de 0,05) : de petites variations
  // d'opacité n'obligent pas à tout redessiner.
  const lod = NIVEAUX_DETAIL.filter((l) => l.tiles).length,
    y38 = Math.round(st.y38 * 20) / 20,
    y42 = Math.round(st.y42 * 20) / 20;
  // ok = vrai si l'image en cache peut servir telle quelle
  let ok = k && k.W === W && k.H === H && k.lod === lod && k.y38 === y38 && k.y42 === y42;
  if (ok) {
    // r = rapport de zoom entre maintenant et le moment où l'image a été faite.
    // On accepte de 0,7 à 1,45 fois (au-delà, l'image serait trop floue ou trop petite),
    // et il faut que l'écran entier tienne encore dans l'image avec sa marge.
    const r = kx / k.kx;
    ok =
      r > 0.7 &&
      r < 1.45 &&
      (0 - o0[0]) / r + k.ox + m >= 0 &&
      (W - o0[0]) / r + k.ox + m <= c.width &&
      (0 - o0[1]) / r + k.oy + m >= 0 &&
      (H - o0[1]) / r + k.oy + m <= c.height;
  }
  if (!ok) {
    // On refait l'image : taille de l'écran plus la marge de chaque côté
    if (c.width !== W + 2 * m || c.height !== H + 2 * m) {
      c.width = W + 2 * m;
      c.height = H + 2 * m;
    }
    const g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    // Origine décalée de m pour tenir compte de la marge ; erreur acceptée : 1,2 px CSS
    dessinerTerres(
      g, c.width, c.height, d, kx, ky, o0[0] + m, o0[1] + m, { ...st, y38, y42 }, 1.2 * d, true
    );
    cacheTerres.k = { W, H, lod, y38, y42, kx, ox: o0[0], oy: o0[1] };
  }
  // On pose l'image en cache sur l'écran, agrandie ou réduite (r) et déplacée
  // pour tomber pile sous la caméra actuelle
  const K = cacheTerres.k,
    r = kx / K.kx;
  ctx.save();
  ctx.setTransform(r, 0, 0, r, o0[0] - r * (K.ox + m), o0[1] - r * (K.oy + m));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}

/* ---------- 9. Dessin complet de la carte du Pacifique ---------- */

// Dessine toute la carte du Pacifique pour l'état st.
// ctx = pinceau du canevas ; st = état de la carte (caméra et éléments à montrer) ;
// still = vrai quand la caméra est posée : on dessine alors le détail le plus fin.
// Ne renvoie rien.
function dessinerPacifique(ctx, W, H, d, st, still) {
  const { s, tf } = cadragePacifique(st, W, H, d);
  // Fond couleur papier
  ctx.fillStyle = "#F4F4F1";
  ctx.fillRect(0, 0, W, H);
  // Quadrillage très léger, tous les 10 degrés : méridiens puis parallèles
  ctx.strokeStyle = "rgba(17,17,17,.06)";
  ctx.lineWidth = 1 * d;
  ctx.beginPath();
  for (let lo = 60; lo <= 220; lo += 10) {
    const a = tf(lo, -50),
      b = tf(lo, 75);
    ctx.moveTo(...a);
    ctx.lineTo(...b);
  }
  for (let la = -50; la <= 70; la += 10) {
    const a = tf(55, la),
      b = tf(225, la);
    ctx.moveTo(...a);
    ctx.lineTo(...b);
  }
  ctx.stroke();
  // Terres. En mouvement, on réutilise une image déjà dessinée (simplement déplacée
  // et agrandie). Le détail complet n'est redessiné qu'une fois la caméra posée.
  // kx, ky = pixels par degré ; o0 = position du point lo = 0, la = 0.
  const kx = 111.32 * ECHELLE_EST_OUEST * s,
    ky = 110.57 * s,
    o0 = tf(0, 0);
  // Dessin direct si la caméra est posée ou si le dessin est léger (moins de 25 000 points).
  // Erreur acceptée : 0,7 px CSS à l'arrêt, 1,2 px CSS en mouvement.
  if (still || coutDessinTerres(W, H, kx, ky, o0) < 25000)
    dessinerTerres(ctx, W, H, d, kx, ky, o0[0], o0[1], st, still ? 0.7 * d : 1.2 * d, true);
  else dessinerTerresAvecCache(ctx, W, H, d, kx, ky, o0, st);
  // Noms des régions (t = texte, k = style, voir NOMS_REGIONS dans 04)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [lo, la, t, k] of NOMS_REGIONS) {
    const [x, y] = tf(lo, la);
    // On saute les noms hors de l'écran
    if (x < 0 || x > W || y < 0 || y > H) continue;
    // On saute les noms des conquêtes tant qu'elles sont à moins de moitié visibles
    if ((k === "j38" && st.y38 < 0.5) || (k === "j42" && st.y42 < 0.5)) continue;
    const sea = k === "sea";
    // Mers : texte fin et un peu plus grand ; terres : texte moyen
    ctx.font = `${sea ? 400 : 500} ${(sea ? 13 : 12) * d}px Geist, system-ui, sans-serif`;
    ctx.letterSpacing = (sea ? 0.3 : 0.18) * 12 * d + "px";
    // Couleur du texte : gris pour les mers, clair sur les pays alliés (fond noir),
    // rouge foncé pour le Japon, blanc sur les conquêtes de 1938, gris foncé sinon
    ctx.fillStyle = sea
      ? "#9A9A9E"
      : k === "al"
        ? "rgba(244,244,241,.8)"
        : k === "jp"
          ? COULEURS_PACIFIQUE.j30
          : k === "j38"
            ? "#fff"
            : "#3B3B40";
    ctx.fillText(t.toUpperCase(), x, y);
  }
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
  // Contour de l'extension maximale (1942), tracé petit à petit selon st.ext
  if (st.ext > 0) {
    const q = EXTENSION_1942_LISSEE.map((p) => tf(...p));
    const n = Math.round(q.length * st.ext);
    ctx.strokeStyle = ROUGE;
    ctx.lineWidth = 2.4 * d;
    ctx.lineJoin = "round";
    ctx.beginPath();
    q.slice(0, n).forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    // Contour fermé seulement une fois entièrement tracé
    if (st.ext >= 1) ctx.closePath();
    ctx.stroke();
  }
  // Avancées alliées : une flèche par code, dessinée dès 2 % d'avancement
  for (const k in FLECHES_ALLIEES) {
    const t = st.arr[k] || 0;
    if (t > 0.02) dessinerFleche(ctx, FLECHES_ALLIEES[k], t, tf, d);
  }
  // Vol depuis Tinian : ligne rouge en tirets vers Hiroshima (opaque)
  // et vers Nagasaki (à moitié transparente, a = opacité)
  if (st.route > 0) {
    [
      [HYPOCENTRE_HIROSHIMA, 1],
      [HYPOCENTRE_NAGASAKI, 0.5],
    ].forEach(([to, a]) => {
      // Trajet le plus court sur le globe, de Tinian jusqu'à la ville (to)
      const pts = arcGrandCercle([145.63, 15.0], to);
      const n = Math.max(2, Math.round(pts.length * st.route));
      ctx.strokeStyle = ROUGE;
      ctx.globalAlpha = a;
      ctx.lineWidth = 2.6 * d;
      // Tirets : 8 px CSS de trait, 6 px de vide
      ctx.setLineDash([8 * d, 6 * d]);
      ctx.beginPath();
      pts.slice(0, n).forEach((p, i) => {
        const q = tf(...p);
        i ? ctx.lineTo(...q) : ctx.moveTo(...q);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  }
  // Repères des lieux. placed = rectangles déjà occupés, pour que les étiquettes
  // ne se posent ni sur un repère ni sur une autre étiquette.
  const placed = [];
  // Lieu mis en avant (st.f) : trois cercles rouges de plus en plus grands et pâles
  // (r = rayon en px CSS, a = opacité)
  if (st.f) {
    const [x, y] = tf(LIEUX_PACIFIQUE[st.f][0], LIEUX_PACIFIQUE[st.f][1]);
    ctx.strokeStyle = ROUGE;
    [
      [16, 0.9],
      [30, 0.35],
      [46, 0.15],
    ].forEach(([r, a]) => {
      ctx.globalAlpha = a;
      ctx.lineWidth = 2 * d;
      ctx.beginPath();
      ctx.arc(x, y, r * d, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  // Premier passage : les symboles (kind = type de repère, voir LIEUX_PACIFIQUE dans 04)
  for (const k of st.mk) {
    const [lo, la, name, sub, kind] = LIEUX_PACIFIQUE[k];
    const [x, y] = tf(lo, la);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.lineWidth = 1.6 * d;
    ctx.strokeStyle = "#fff";
    if (kind === "b" && k === st.f && st.km < 1200) {
      // Bataille mise en avant et vue de près (moins de 1 200 km de large) :
      // un simple point rouge, pour ne pas cacher l'île
      ctx.fillStyle = ROUGE;
      ctx.beginPath();
      ctx.arc(x, y, 3 * d, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "b") {
      // Bataille : triangle noir pointe en haut (r = taille, 7 px CSS)
      const r = 7 * d;
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.9, y + r * 0.6);
      ctx.lineTo(x - r * 0.9, y + r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === "bomb") {
      // Ville bombardée : étoile rouge à 8 branches.
      // 16 sommets, un sur deux loin du centre (9 px CSS), l'autre proche (4 px).
      ctx.fillStyle = ROUGE;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8,
          r = (i % 2 ? 4 : 9) * d;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (kind === "cap") {
      // Capitale : carré blanc bordé de noir, 9 px CSS de côté
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#111";
      ctx.fillRect(x - 4.5 * d, y - 4.5 * d, 9 * d, 9 * d);
      ctx.strokeRect(x - 4.5 * d, y - 4.5 * d, 9 * d, 9 * d);
    } else {
      // Autres repères : rond de 6 px CSS de rayon.
      // Rouge bordé de blanc pour une attaque ("a"), blanc bordé de noir pour la base.
      ctx.fillStyle = kind === "a" ? ROUGE : "#fff";
      ctx.strokeStyle = kind === "a" ? "#fff" : "#111";
      ctx.beginPath();
      ctx.arc(x, y, 6 * d, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Le repère occupe un carré de 16 px CSS : les étiquettes l'éviteront
    placed.push({ l: x - 8 * d, t: y - 8 * d, r: x + 8 * d, b: y + 8 * d });
  }
  // Second passage : les étiquettes, une fois tous les repères connus.
  // Étiquette rouge pour les villes bombardées et l'attaque de Pearl Harbor.
  // Nagasaki, Okinawa et Leyte placent d'abord leur étiquette à gauche,
  // pour ne pas gêner leurs voisins.
  for (const k of st.mk) {
    const [lo, la, name, sub, kind] = LIEUX_PACIFIQUE[k];
    const [x, y] = tf(lo, la);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    etiquetteSurCarte(
      ctx,
      x,
      y,
      name,
      sub,
      d,
      { hot: kind === "bomb" || kind === "a", left: k === "na" || k === "ok" || k === "le" },
      placed,
    );
  }
  // L'année, en grand et très pâle, pour situer la lecture.
  // Elle n'est pas affichée dans le lecteur téléphone.
  if (st.yr && !LECTEUR.on) {
    // dk = écran large ; fs = taille du texte (150 px CSS sur PC, 76 px sinon)
    const dk = W / d >= 900,
      fs = (dk ? 150 : 76) * d;
    ctx.font = `600 ${fs}px Geist, system-ui, sans-serif`;
    ctx.letterSpacing = -(dk ? 7 : 3.5) * d + "px";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(17,17,17,.07)";
    // Sur PC : en bas à droite. Sinon : en haut à droite, sous l'en-tête
    // (78 px d'en-tête plus 76 px de hauteur du texte).
    ctx.fillText(st.yr, W - (dk ? 28 : 14) * d, dk ? H - 52 * d : (78 + 76) * d);
    ctx.letterSpacing = "0px";
    ctx.textAlign = "left";
  }
  // Barre d'échelle, sur PC seulement : la plus grande longueur ronde (en km)
  // qui tient dans 16 % de la largeur ; 50 km par défaut.
  // px = longueur en pixels ; x0, y0 = bout gauche de la barre (24 px du bord droit,
  // 30 px du bas, en px CSS).
  if (W / d >= 900) {
    const km =
        [5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter((k) => k * s <= W * 0.16).pop() || 50,
      px = km * s,
      x0 = W - 24 * d - px,
      y0 = H - 30 * d;
    // Barre en forme de U renversé : deux petits traits de 5 px CSS aux extrémités
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2 * d;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 5 * d);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + px, y0);
    ctx.lineTo(x0 + px, y0 - 5 * d);
    ctx.stroke();
    ctx.font = `500 ${11 * d}px Geist, system-ui, sans-serif`;
    ctx.fillStyle = "#111";
    ctx.textBaseline = "bottom";
    // Texte au-dessus de la barre, avec les espaces des milliers à la française
    ctx.fillText(km.toLocaleString("fr-FR") + " km", x0, y0 - 8 * d);
  }
}

/* ---------- 10. Passage en douceur d'une étape à l'autre ---------- */

// Mélange deux étapes pour obtenir un état intermédiaire de la carte.
// a = étape de départ ; b = étape d'arrivée ;
// e = avancement de 0 (tout a) à 1 (tout b).
// Renvoie un état au même format qu'une étape (voir ETAPES_PACIFIQUE dans 04).
function melangerEtapes(a, b, e) {
  // m = mélange linéaire de deux nombres x et y
  const m = (x, y) => x + (y - x) * e;
  const arr = {};
  for (const k in FLECHES_ALLIEES) arr[k] = m(a.arr[k] || 0, b.arr[k] || 0);
  // far = effet de survol : si les deux vues sont éloignées (distance plus grande que
  // la moitié de leur largeur), la caméra prend du recul au milieu du trajet.
  // 0.7 règle la force de ce recul.
  const far = Math.max(0, distanceKm(a.c, b.c) / Math.max(a.km, b.km) - 0.5) * 0.7;
  return {
    // Les valeurs qui ne se mélangent pas basculent à mi-chemin
    yr: e < 0.5 ? a.yr : b.yr,
    f: e < 0.5 ? a.f : b.f,
    c: [m(a.c[0], b.c[0]), m(a.c[1], b.c[1])],
    // Zoom mélangé par multiplication (et non par addition) pour un zoom régulier,
    // plus le recul de survol, maximal à mi-chemin (sin(pi * e) vaut 1 quand e = 0,5)
    km: a.km * Math.pow(b.km / a.km, e) * (1 + far * Math.sin(Math.PI * e)),
    y38: m(a.y38, b.y38),
    y42: m(a.y42, b.y42),
    ext: m(a.ext, b.ext),
    arr,
    route: m(a.route || 0, b.route || 0),
    mk: e < 0.5 ? a.mk : b.mk,
  };
}
