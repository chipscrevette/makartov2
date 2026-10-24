/* =====================================================================
   MINI-CARTE DE SITUATION (TÉLÉPHONE)
   ---------------------------------------------------------------------
   Sur téléphone, une petite carte s'affiche dans l'en-tête du lecteur.
   Elle montre en permanence où se trouve la grande carte : le cadre
   visible sur le Pacifique, ou la ville étudiée au Japon ou en France.
   Les fonds (terres, contours) sont dessinés une seule fois puis gardés
   en mémoire ; à chaque image, on ne redessine que le repère rouge.
   Utilise : DEG_EN_RAD, VILLES (01-reglages.js), NIVEAUX_DETAIL,
   cadragePacifique (05), bandeLibre (03), ECHELLE_EST_OUEST (04),
   carte, densite (07), CONTOURS_FRANCE (donnees/france.js).
   Fournit : MINI_CARTE, afficherMiniCarte, miniCartePacifique,
   miniCarteVille (utilisés par 08-pacifique-camera.js et
   13-lecteur-telephone.js).
   ===================================================================== */

/* ---------- 1. Réglages de la mini-carte ---------- */

// W, H : taille de la mini-carte en pixels CSS (avant la densité de l'écran).
// ext : l'étendue de chaque fond, sous la forme
//   [longitude ouest, longitude est, latitude sud, latitude nord], en degrés.
//   pac = tout le Pacifique (les longitudes dépassent 180 pour ne pas couper l'océan en deux),
//   jp = le Japon, fr = la France.
// base : les fonds déjà dessinés, rangés par clé (pac, jp, fr), pour ne pas les refaire.
// cv : le <canvas> de la mini-carte, placé dans l'en-tête par 13-lecteur-telephone.js.
const MINI_CARTE = {
  W: 124,
  H: 86,
  ext: { pac: [92, 205, -22, 52], jp: [128.3, 146.6, 30.2, 45.8], fr: [-5.6, 10, 41.2, 51.3] },
  base: {},
  cv: null,
};

/* ---------- 2. Projection : des degrés vers les pixels ---------- */

// Calcule comment placer des longitudes et latitudes sur la mini-carte.
// Projection simple : les degrés de longitude sont resserrés par le cosinus de la latitude
// du milieu, pour que les formes ne soient pas trop étirées vers l'est et l'ouest.
// k : clé du fond ("pac", "jp" ou "fr") ; w, h : largeur et hauteur du canevas en pixels réels.
// Renvoie { kx, ky, ox, oy, p } :
//   kx, ky = pixels par degré de longitude et de latitude,
//   ox, oy = position en pixels du point longitude 0, latitude 0,
//   p(lo, la) = fonction qui donne la position [x, y] en pixels d'un point (lo, la).
function projeterMiniCarte(k, w, h) {
  // a, b = longitudes ouest et est ; c, e = latitudes sud et nord ;
  // cl = cosinus de la latitude du milieu
  const [a, b, c, e] = MINI_CARTE.ext[k],
    cl = Math.cos(((c + e) / 2) * DEG_EN_RAD);
  // on prend l'échelle qui fait tenir l'étendue en largeur ET en hauteur,
  // puis 0.94 laisse une marge de 3 % de chaque côté
  const sx = w / ((b - a) * cl),
    sy = h / (e - c),
    sc = Math.min(sx, sy) * 0.94;
  // on décale pour que le milieu de l'étendue tombe au milieu du canevas
  const ox = w / 2 - ((a + b) / 2) * cl * sc,
    oy = h / 2 + ((c + e) / 2) * sc;
  return { kx: cl * sc, ky: sc, ox, oy, p: (lo, la) => [ox + lo * cl * sc, oy - la * sc] };
}

/* ---------- 3. Fond de la mini-carte (dessiné une seule fois) ---------- */

// Renvoie le fond de la mini-carte pour la clé k ("pac", "jp" ou "fr").
// Le fond est dessiné dans un canevas à part, la première fois seulement,
// puis gardé dans MINI_CARTE.base pour les fois suivantes.
// d = densité de l'écran (pixels réels par pixel CSS), limitée à 2 pour rester léger.
function fondMiniCarte(k) {
  if (MINI_CARTE.base[k]) return MINI_CARTE.base[k];
  const d = Math.min(2, devicePixelRatio || 1),
    w = MINI_CARTE.W * d,
    h = MINI_CARTE.H * d,
    o = document.createElement("canvas");
  o.width = w;
  o.height = h;
  const g = o.getContext("2d");
  // fond couleur papier
  g.fillStyle = "#F4F4F1";
  g.fillRect(0, 0, w, h);
  const P = projeterMiniCarte(k, w, h);
  if (k === "fr") {
    // France : on remplit une liste de contours (rs = liste d'anneaux de points [lo, la])
    // avec la couleur col
    const fill = (rs, col) => {
      g.fillStyle = col;
      g.beginPath();
      rs.forEach((r) =>
        r.forEach(([x, y], i) => {
          const q = P.p(x, y);
          // premier point : on lève le crayon (moveTo), ensuite on trace (lineTo)
          i ? g.lineTo(...q) : g.moveTo(...q);
        }),
      );
      g.fill();
    };
    // la France en gris clair, la Bretagne en gris plus foncé
    fill(CONTOURS_FRANCE.fr, "#CFCFCA");
    fill(CONTOURS_FRANCE.bre, "#9C9C97");
  } else {
    // Pacifique ou Japon : on réutilise les tracés des terres déjà prêts (en degrés).
    // La transformation convertit directement les degrés en pixels ; le signe moins
    // retourne l'axe vertical, car les latitudes montent alors que les pixels descendent.
    g.save();
    g.setTransform(P.kx, 0, 0, -P.ky, P.ox, P.oy);
    // niveau de détail le plus léger : largement suffisant à cette taille
    const L = NIVEAUX_DETAIL[0];
    // t = une tuile de terres ; c = sa catégorie (j30 = Japon en 1930, etc.)
    for (const t of L.tiles)
      for (const c in t.p) {
        // Pacifique : Japon de 1930 en rouge sombre ; Japon seul : Japon en gris très foncé ;
        // toutes les autres terres en gris clair
        g.fillStyle =
          k === "pac" ? (c === "j30" ? "#9E1219" : "#CFCFCA") : c === "j30" ? "#3B3B40" : "#CFCFCA";
        g.fill(t.p[c]);
      }
    g.restore();
  }
  return (MINI_CARTE.base[k] = o);
}

/* ---------- 4. Afficher ou cacher la mini-carte ---------- */

// Affiche la mini-carte si k est donné, la cache si k est vide (null).
// k : "pac" pour le Pacifique, "city" pour une ville, ou null.
// La classe "off" masque le canevas (voir styles/09-lecteur-telephone.css).
function afficherMiniCarte(k) {
  const c = MINI_CARTE.cv;
  if (!c) return;
  c.classList.toggle("off", !k);
  // on retient le fond affiché ; miniCartePacifique ne dessine que si c'est "pac"
  MINI_CARTE.k = k;
}

/* ---------- 5. Mini-carte du Pacifique : le cadre visible ---------- */

// Redessine la mini-carte du Pacifique avec un rectangle rouge qui montre
// la partie du monde visible en ce moment sur la grande carte.
// st : l'état de la caméra du Pacifique (st.c = centre [lo, la], st.yr = année affichée).
// Appelée à chaque image par afficherPacifique (08-pacifique-camera.js).
function miniCartePacifique(st) {
  if (!MINI_CARTE.cv || MINI_CARTE.k !== "pac") return;
  // d = densité de l'écran ; w, h = taille de la mini-carte en pixels réels
  const c = MINI_CARTE.cv,
    d = Math.min(2, devicePixelRatio || 1),
    w = MINI_CARTE.W * d,
    h = MINI_CARTE.H * d;
  // on ne change la taille du canevas que si elle a changé (cela l'efface)
  if (c.width !== w) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext("2d");
  g.drawImage(fondMiniCarte("pac"), 0, 0);
  const P = projeterMiniCarte("pac", w, h);
  // Ce que l'écran montre, reporté sur la mini-carte.
  // W, H = largeur et hauteur de la GRANDE carte en pixels réels ;
  // s = pixels par kilomètre sur la grande carte ;
  // vb = bande libre de l'écran (entre l'en-tête et le texte du bas) ;
  // kx, ky = pixels par degré de longitude et de latitude
  //   (111.32 km par degré de longitude à l'équateur, 110.57 km par degré de latitude) ;
  // cx = milieu horizontal de l'écran (50 % de la largeur).
  const W = carte.width,
    H = carte.height,
    { s } = cadragePacifique(st, W, H, densite),
    vb = bandeLibre(H, densite),
    kx = 111.32 * ECHELLE_EST_OUEST * s,
    ky = 110.57 * s,
    cx = W * 0.5;
  // on traduit les bords de l'écran en degrés :
  // lo0, lo1 = longitudes des bords gauche et droit ;
  // la1, la0 = latitudes du haut et du bas de la bande libre
  const lo0 = st.c[0] + (0 - cx) / kx,
    lo1 = st.c[0] + (W - cx) / kx,
    la1 = st.c[1] + (vb.c - vb.top) / ky,
    la0 = st.c[1] - (vb.bot - vb.c) / ky;
  // a = coin haut gauche, b = coin bas droit sur la mini-carte ; rw, rh = largeur, hauteur
  const a = P.p(lo0, la1),
    b = P.p(lo1, la0),
    rw = b[0] - a[0],
    rh = b[1] - a[1];
  g.strokeStyle = "#E5262D";
  g.lineWidth = 1.6 * d;
  g.fillStyle = "rgba(229,38,45,.14)";
  if (rw < 7 * d) {
    // cadre trop petit pour être lisible (moins de 7 pixels CSS de large) :
    // on dessine plutôt un point rouge entouré d'un cercle
    const m = P.p(st.c[0], st.c[1]);
    g.beginPath();
    g.arc(m[0], m[1], 3 * d, 0, Math.PI * 2);
    g.fillStyle = "#E5262D";
    g.fill();
    g.beginPath();
    g.arc(m[0], m[1], 7 * d, 0, Math.PI * 2);
    g.stroke();
  } else {
    // sinon, un rectangle rouge transparent aux coins arrondis
    g.beginPath();
    g.roundRect(a[0], a[1], rw, rh, 2 * d);
    g.fill();
    g.stroke();
  }
  // l'année de l'étape, écrite en bas à gauche (marge de 7 pixels CSS)
  if (st.yr) {
    g.font = `600 ${11 * d}px Geist, system-ui, sans-serif`;
    g.fillStyle = "#111";
    g.textBaseline = "alphabetic";
    g.fillText(st.yr, 7 * d, h - 7 * d);
  }
}

/* ---------- 6. Mini-carte d'une ville : un point et son nom ---------- */

// Dessine la mini-carte d'une ville : le fond du Japon ou de la France,
// un point rouge sur l'hypocentre et le nom de la ville.
// id : identifiant de la ville ("hiro", "naga" ou "ren", voir VILLES).
function miniCarteVille(id) {
  // Rennes se place sur la France, Hiroshima et Nagasaki sur le Japon
  const k = id === "ren" ? "fr" : "jp";
  MINI_CARTE.k = k;
  // d = densité de l'écran ; w, h = taille de la mini-carte en pixels réels
  const c = MINI_CARTE.cv,
    d = Math.min(2, devicePixelRatio || 1),
    w = MINI_CARTE.W * d,
    h = MINI_CARTE.H * d;
  if (c.width !== w) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext("2d");
  g.drawImage(fondMiniCarte(k), 0, 0);
  // m = position en pixels de l'hypocentre de la ville
  const P = projeterMiniCarte(k, w, h),
    m = P.p(...VILLES[id].hyp);
  // un halo rouge pâle (rayon 9) puis un point rouge plein (rayon 3,5)
  g.fillStyle = "rgba(229,38,45,.18)";
  g.beginPath();
  g.arc(m[0], m[1], 9 * d, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#E5262D";
  g.beginPath();
  g.arc(m[0], m[1], 3.5 * d, 0, Math.PI * 2);
  g.fill();
  // le nom de la ville, en majuscules espacées
  g.font = `600 ${9.5 * d}px Geist, system-ui, sans-serif`;
  g.letterSpacing = 0.6 * d + "px";
  g.fillStyle = "#111";
  g.textBaseline = "middle";
  // t = texte du nom ; tw = sa largeur en pixels
  const t = VILLES[id].name.toUpperCase(),
    tw = g.measureText(t).width;
  g.textAlign = "center";
  // lx : centré sur le point, mais gardé à 6 pixels CSS des bords pour ne pas être coupé ;
  // ly : si le point est dans la moitié basse, le nom va au-dessus, sinon en dessous (17 px)
  const lx = Math.max(tw / 2 + 6 * d, Math.min(w - tw / 2 - 6 * d, m[0])),
    ly = m[1] > h * 0.5 ? m[1] - 17 * d : m[1] + 17 * d;
  // un contour épais couleur papier autour des lettres les rend lisibles sur le fond
  g.lineJoin = "round";
  g.strokeStyle = "#F4F4F1";
  g.lineWidth = 3.5 * d;
  g.strokeText(t, lx, ly);
  g.fillText(t, lx, ly);
  // on remet les réglages de texte par défaut
  g.textAlign = "left";
  g.letterSpacing = "0px";
}
