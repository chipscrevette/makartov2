/* =====================================================================
   OUTILS GÉOGRAPHIQUES
   ---------------------------------------------------------------------
   Petites fonctions de calcul utilisées par toutes les cartes : passage
   des degrés en coordonnées Web Mercator, tracé d'une forme GeoJSON,
   distance entre deux points, arc de grand cercle et courbe d'animation.
   Le fichier écrit aussi dans la page la distance entre Tinian et Hiroshima.
   Utilise : DEG_EN_RAD, RAYON_TERRE, HYPOCENTRE_HIROSHIMA (01-reglages.js).
   Fournit : versMercator, tracerGeometrie, distanceKm, arcGrandCercle, adoucir.
   ===================================================================== */

/* ---------- 1. Projection Web Mercator ---------- */
// Convertit une position en degrés en coordonnées Web Mercator, en mètres.
// lo, la : longitude et latitude en degrés.
// Renvoie [x, y]. Le y est mis en négatif : sur un canevas, y augmente vers le bas,
// donc le nord se retrouve bien en haut.
const versMercator = (lo, la) => [
  RAYON_TERRE * lo * DEG_EN_RAD,
  -RAYON_TERRE * Math.log(Math.tan(Math.PI / 4 + (la * DEG_EN_RAD) / 2))
];

/* ---------- 2. Tracé d'une forme GeoJSON ---------- */
// Transforme une forme GeoJSON (Polygon ou MultiPolygon) en tracé prêt à dessiner.
// geom : la forme GeoJSON (peut être vide : on renvoie alors un tracé vide).
// tf   : fonction qui reçoit (longitude, latitude) et renvoie [x, y] en pixels.
// Renvoie un objet Path2D, que l'on peut remplir (fill) ou contourner (stroke).
function tracerGeometrie(geom, tf) {
  const p = new Path2D();
  if (!geom) return p;
  // Un Polygon est ramené à une liste d'un seul polygone, comme un MultiPolygon.
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  // Chaque polygone contient des anneaux (le contour, puis les trous éventuels).
  for (const poly of polys)
    for (const ring of poly) {
      // c : un point [longitude, latitude] ; i : sa place dans l'anneau.
      // Le premier point démarre le tracé (moveTo), les suivants le prolongent (lineTo).
      ring.forEach((c, i) => {
        const q = tf(c[0], c[1]);
        i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]);
      });
      p.closePath();
    }
  return p;
}

/* ---------- 3. Distance entre deux points ---------- */
// Calcule la distance « à vol d'oiseau » sur la Terre (formule de haversine).
// a, b : deux points [longitude, latitude] en degrés.
// Renvoie la distance en kilomètres. 6371.0088 = rayon moyen de la Terre en km.
function distanceKm(a, b) {
  // dl : écart de latitude ; dn : écart de longitude (en radians).
  const dl = (b[1] - a[1]) * DEG_EN_RAD,
    dn = (b[0] - a[0]) * DEG_EN_RAD;
  const h =
    Math.sin(dl / 2) ** 2 +
    Math.cos(a[1] * DEG_EN_RAD) * Math.cos(b[1] * DEG_EN_RAD) * Math.sin(dn / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

/* ---------- 4. Arc de grand cercle ---------- */
// Calcule le chemin le plus court entre deux points du globe (route d'un avion).
// a, b : points de départ et d'arrivée [longitude, latitude] en degrés.
// n    : nombre de segments (80 par défaut), soit n + 1 points.
// Renvoie une liste de points [longitude, latitude].
function arcGrandCercle(a, b, n = 80) {
  // v : place un point sur une sphère de rayon 1, en coordonnées 3D (x, y, z).
  const v = ([lo, la]) => [
    Math.cos(la * DEG_EN_RAD) * Math.cos(lo * DEG_EN_RAD),
    Math.cos(la * DEG_EN_RAD) * Math.sin(lo * DEG_EN_RAD),
    Math.sin(la * DEG_EN_RAD),
  ];
  // w : angle entre les deux points, vu depuis le centre de la Terre.
  const A = v(a),
    B = v(b),
    w = Math.acos(A[0] * B[0] + A[1] * B[1] + A[2] * B[2]);
  const out = [];
  for (let i = 0; i <= n; i++) {
    // t va de 0 (départ) à 1 (arrivée). s1 et s2 dosent le poids de chaque extrémité
    // pour rester sur la surface du globe (interpolation sphérique).
    const t = i / n,
      s1 = Math.sin((1 - t) * w) / Math.sin(w),
      s2 = Math.sin(t * w) / Math.sin(w);
    const x = s1 * A[0] + s2 * B[0],
      y = s1 * A[1] + s2 * B[1],
      z = s1 * A[2] + s2 * B[2];
    // On revient en degrés. Les longitudes sont gardées entre 0 et 360 :
    // le trajet ne « saute » pas d'un bord à l'autre de la carte du Pacifique.
    let lo = Math.atan2(y, x) / DEG_EN_RAD;
    if (lo < 0) lo += 360;
    out.push([lo, Math.atan2(z, Math.hypot(x, y)) / DEG_EN_RAD]);
  }
  return out;
}

/* ---------- 5. Courbe d'animation ---------- */
// Rend un mouvement plus doux : lent au début, rapide au milieu, lent à la fin.
// t : avancement de 0 à 1. Renvoie l'avancement adouci, aussi de 0 à 1.
const adoucir = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------- 6. Distance Tinian - Hiroshima affichée dans la page ---------- */
// [145.63, 15.0] = île de Tinian, d'où sont partis les bombardiers.
// La distance est arrondie à 10 km près, puis écrite à la française (ex. « 2 530 »).
document.querySelector('[data-km="tinH"]').textContent = (
  Math.round(distanceKm([145.63, 15.0], HYPOCENTRE_HIROSHIMA) / 10) * 10
).toLocaleString("fr-FR");
