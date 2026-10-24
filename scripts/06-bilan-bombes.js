/* =====================================================================
   BILAN DES DEUX BOMBES (Little Boy et Fat Man)
   ---------------------------------------------------------------------
   Ce fichier dessine l'écran « Bilan » du récit. Chaque bombe est
   dessinée en silhouette, à ses vraies proportions. L'intérieur de la
   silhouette se remplit comme une jauge : la part de la ville rasée,
   la part endommagée (ou incendiée) et la part épargnée.
   Sur ordinateur, des pastilles blanches donnent les surfaces en km².
   Utilise : ROUGE (01-reglages.js), motifHachures (03-villes.js).
   Fournit : BOMBES et dessinerBombes (appelée par 07-scene-carte.js).
   ===================================================================== */

/* ---------- 1. Données des deux bombes ---------- */

// name = nom de la bombe ; city = ville visée ; kt = puissance en kilotonnes.
// km = surfaces en km², dans l'ordre : [rasée, endommagée ou incendiée, épargnée].
const BOMBES = [
  { name: "Little Boy", city: "Hiroshima", kt: "16 kt", km: [11.1, 10.8, 6.5] },
  { name: "Fat Man", city: "Nagasaki", kt: "21 kt", km: [1.6, 1.0, 5] },
];

/* ---------- 2. Silhouettes des bombes ---------- */

// Les silhouettes respectent les proportions réelles, nez en haut.
// Little Boy : 3 m de long pour 0,71 m de diamètre ; Fat Man : 3,25 m pour 1,52 m.

// Trace le contour de Little Boy (un long tube à nez arrondi, avec un empennage en bas).
// x, y = point du haut de la bombe (milieu du nez), en pixels.
// L = hauteur totale de la bombe, en pixels.
// Renvoie { p, w } : p = le contour (Path2D), w = la demi-largeur la plus grande.
function silhouetteLittleBoy(x, y, L) {
  // r = rayon du tube : 0,118 x L, soit un diamètre de 0,236 x L (0,71 m / 3 m).
  const p = new Path2D(),
    r = L * 0.118;
  // Nez : un demi-cercle en haut.
  p.moveTo(x - r, y + r);
  p.arc(x, y + r, r, Math.PI, 0);
  // Côté droit : le tube descend jusqu'à 80 % de la hauteur, se resserre un peu,
  // puis l'empennage (un peu plus large, 1,08 x r) va jusqu'en bas.
  p.lineTo(x + r, y + L * 0.8);
  p.lineTo(x + r * 0.8, y + L * 0.83);
  p.lineTo(x + r * 1.08, y + L * 0.835);
  p.lineTo(x + r * 1.08, y + L);
  // Côté gauche : le même tracé en miroir, en remontant.
  p.lineTo(x - r * 1.08, y + L);
  p.lineTo(x - r * 1.08, y + L * 0.835);
  p.lineTo(x - r * 0.8, y + L * 0.83);
  p.lineTo(x - r, y + L * 0.8);
  p.closePath();
  return { p, w: r * 1.08 };
}

// Trace le contour de Fat Man (un gros corps en forme d'oeuf, avec un empennage carré en bas).
// x, y = point du haut de la bombe, en pixels ; L = hauteur totale, en pixels.
// Renvoie { p, w } : p = le contour (Path2D), w = la demi-largeur du corps.
function silhouetteFatMan(x, y, L) {
  // rx = demi-largeur du corps : 0,234 x L (1,52 m / 3,25 m / 2).
  // ry = hauteur qui règle l'arrondi des courbes du corps.
  const p = new Path2D(),
    rx = L * 0.234,
    ry = L * 0.36;
  // Côté droit du corps : une courbe de Bézier du sommet jusqu'à 73,5 % de la hauteur.
  p.moveTo(x, y);
  p.bezierCurveTo(x + rx * 1.34, y, x + rx * 1.34, y + ry * 2, x + rx * 0.42, y + L * 0.735);
  // Empennage : une boîte de 76 % de la hauteur jusqu'en bas.
  p.lineTo(x + rx * 0.42, y + L * 0.76);
  p.lineTo(x + rx * 0.92, y + L * 0.76);
  p.lineTo(x + rx * 0.92, y + L);
  p.lineTo(x - rx * 0.92, y + L);
  p.lineTo(x - rx * 0.92, y + L * 0.76);
  p.lineTo(x - rx * 0.42, y + L * 0.76);
  p.lineTo(x - rx * 0.42, y + L * 0.735);
  // Côté gauche du corps : la même courbe en miroir, qui remonte au sommet.
  p.bezierCurveTo(x - rx * 1.34, y + ry * 2, x - rx * 1.34, y, x, y);
  p.closePath();
  return { p, w: rx };
}

/* ---------- 3. Pastille de surface (ex. « 11,1 km² rasés ») ---------- */

// Dessine une pastille blanche arrondie avec une valeur en gras et un libellé en gris.
// ctx = le pinceau du canevas ; x, y = point d'accroche (y = milieu vertical de la pastille).
// v = la valeur (ex. « 11,1 km² ») ; lab = le libellé (ex. « rasés »).
// d = densité de l'écran (pixels réels par pixel CSS).
// right = true : la pastille part vers la droite à partir de x ; sinon elle se termine en x.
// Ne renvoie rien.
function pastille(ctx, x, y, v, lab, d, right) {
  // On mesure la largeur des deux textes, chacun dans sa police.
  ctx.font = `600 ${13 * d}px Geist, system-ui, sans-serif`;
  const w1 = ctx.measureText(v).width;
  ctx.font = `400 ${12 * d}px Geist, system-ui, sans-serif`;
  const w2 = ctx.measureText(lab).width;
  // h = hauteur (26 px CSS) ; w = largeur totale, avec 28 px CSS de marges et d'espace.
  const h = 26 * d,
    w = w1 + w2 + 28 * d,
    x0 = right ? x : x - w;
  // Fond blanc avec une ombre légère.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.12)";
  ctx.shadowBlur = 10 * d;
  ctx.shadowOffsetY = 2 * d;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(x0, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  // Valeur en noir gras, puis libellé en gris juste après.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${13 * d}px Geist, system-ui, sans-serif`;
  ctx.fillStyle = "#111";
  ctx.fillText(v, x0 + 11 * d, y + 0.5 * d);
  ctx.font = `400 ${12 * d}px Geist, system-ui, sans-serif`;
  ctx.fillStyle = "#7A7A7F";
  ctx.fillText(lab, x0 + w1 + 17 * d, y + 0.5 * d);
}

/* ---------- 4. Dessin complet de l'écran « Bilan » ---------- */

// Dessine les deux bombes côte à côte, remplies selon les parts de chaque ville.
// ctx = le pinceau du canevas.
// W, H = largeur et hauteur du canevas en pixels réels.
// d = densité de l'écran (pixels réels par pixel CSS).
// t = avancement de l'animation, de 0 (début) à 1 (fin).
// Ne renvoie rien.
function dessinerBombes(ctx, W, H, d, t) {
  // Fond beige clair sur tout le canevas.
  ctx.fillStyle = "#F4F4F1";
  ctx.fillRect(0, 0, W, H);
  // desk = true sur un écran large (900 px CSS ou plus), comme un ordinateur.
  const desk = W / d >= 900;
  // Zone libre : à droite de la carte de texte sur ordinateur (on laisse les 34 % de gauche),
  // au-dessus du texte sur téléphone (on s'arrête à 64 % de la hauteur).
  const area = desk
    ? { x0: W * 0.34, x1: W - 40 * d, y0: 90 * d, y1: H - 40 * d }
    : { x0: 16 * d, x1: W - 16 * d, y0: 80 * d, y1: H * 0.64 };
  // L = hauteur des bombes : la plus petite des deux limites suivantes.
  // 1. La hauteur de la zone, moins la place des titres sous les bombes (70 ou 46 px CSS).
  // 2. Une part de la largeur de la zone (42 % sur ordinateur, 62 % sur téléphone).
  const L = Math.min(
    area.y1 - area.y0 - (desk ? 70 : 46) * d,
    (area.x1 - area.x0) * (desk ? 0.42 : 0.62),
  );
  // gap = distance entre les axes des deux bombes.
  const gap = desk ? L * 0.95 : L * 0.78;
  // cx = milieu de la zone ; top = haut des bombes, centrées verticalement avec leurs titres ;
  // xs = position horizontale de chaque bombe.
  const cx = (area.x0 + area.x1) / 2,
    top = area.y0 + (area.y1 - area.y0 - (L + (desk ? 70 : 46) * d)) / 2,
    xs = [cx - gap / 2, cx + gap / 2];
  // Ligne de sol très discrète sous les deux bombes.
  ctx.strokeStyle = "rgba(17,17,17,.08)";
  ctx.lineWidth = 1 * d;
  ctx.beginPath();
  ctx.moveTo(area.x0 + 20 * d, top + L);
  ctx.lineTo(area.x1 - 20 * d, top + L);
  ctx.stroke();
  // Pour chaque bombe (b = ses données, i = 0 pour Little Boy, 1 pour Fat Man).
  BOMBES.forEach((b, i) => {
    const x = xs[i],
      { p, w } = (i ? silhouetteFatMan : silhouetteLittleBoy)(x, top, L);
    // fr = part de chaque surface (entre 0 et 1) ; pc = la même part en pourcentage arrondi.
    const tot = b.km[0] + b.km[1] + b.km[2];
    const fr = b.km.map((k) => k / tot),
      pc = fr.map((f) => Math.round(f * 100));
    // e = avancement adouci du remplissage, de 0 à 1 (départ rapide, fin lente).
    // t x 1,3 : le remplissage finit avant la fin de l'animation ;
    // - i x 0,2 : la seconde bombe démarre un peu après la première.
    const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, t * 1.3 - i * 0.2)), 3);
    // y1 = fin de la bande « rasée » ; y2 = fin de la bande « endommagée » (ou « incendiée »).
    const y1 = top + L * fr[0] * e,
      y2 = y1 + L * fr[1] * e;
    // On ne peint qu'à l'intérieur de la silhouette (clip), par bandes horizontales.
    ctx.save();
    ctx.clip(p);
    // Fond blanc, puis partie épargnée en noir (en bas).
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - L, top, 2 * L, L);
    ctx.fillStyle = "#111";
    ctx.fillRect(x - L, y2, 2 * L, top + L - y2);
    // Partie rasée en rose (en haut).
    ctx.fillStyle = "#F7D2D0";
    ctx.fillRect(x - L, top, 2 * L, y1 - top);
    // Partie endommagée : rose très pâle, recouvert de hachures rouges.
    ctx.fillStyle = "#F7EEEC";
    ctx.fillRect(x - L, y1, 2 * L, y2 - y1);
    ctx.fillStyle = ctx.createPattern(motifHachures(d), "repeat");
    ctx.fillRect(x - L, y1, 2 * L, y2 - y1);
    // Lignes rouges en pointillés aux deux limites entre les bandes.
    ctx.strokeStyle = ROUGE;
    ctx.setLineDash([6 * d, 4 * d]);
    ctx.lineWidth = 1.8 * d;
    ctx.beginPath();
    ctx.moveTo(x - L, y1);
    ctx.lineTo(x + L, y1);
    ctx.moveTo(x - L, y2);
    ctx.lineTo(x + L, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Contour noir de la silhouette.
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1.4 * d;
    ctx.stroke(p);
    // Pourcentages dans la silhouette, surfaces en pastilles sur le côté.
    // bands = début et fin (en y) de chaque bande ; labs = libellé de chaque bande.
    const bands = [
      [top, y1],
      [y1, y2],
      [y2, top + L],
    ];
    const labs = ["rasés", i ? "incendiés" : "endommagés", "épargnés"];
    // Pour chaque bande : a = haut, z = bas, j = numéro de la bande (0, 1 ou 2).
    bands.forEach(([a, z], j) => {
      // Bande vide (moins d'un pixel) : rien à écrire.
      if (z - a < 1) return;
      let mid = (a + z) / 2;
      // Fat Man, bande épargnée : on remonte le texte dans le corps large de la bombe
      // (au-dessus de 70 % de sa hauteur), car l'empennage du bas est trop étroit.
      if (i && j === 2) mid = Math.min(mid, (a + top + L * 0.7) / 2);
      // fs = taille du texte. La bande principale de chaque bombe est écrite en grand
      // (rasés pour Little Boy, épargnés pour Fat Man), les autres en plus petit.
      const fs = (j === (i ? 2 : 0) ? (desk ? 30 : 20) : desk ? 16 : 12) * d;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // On écrit le pourcentage seulement si la bande est assez haute pour le texte.
      if (z - a > fs * 1.15) {
        ctx.font = `600 ${fs}px Geist, system-ui, sans-serif`;
        // Couleur lisible sur chaque fond : clair sur noir, rouge sur rose, noir sur hachures.
        ctx.fillStyle = j === 2 ? "#F4F4F1" : j === 0 ? ROUGE : "#111";
        ctx.fillText(Math.round(pc[j] * e) + " %", x, mid + 1 * d);
      }
      // Sur ordinateur, une fois le remplissage presque fini (plus de 95 %),
      // on pose la pastille de surface : à gauche de Little Boy, à droite de Fat Man.
      if (desk && e > 0.95) {
        const side = i ? 1 : -1;
        pastille(
          ctx,
          x + side * (w + 22 * d),
          mid,
          (b.km[j] + "").replace(".", ",") + " km²",
          labs[j],
          d,
          i === 1,
        );
      }
    });
    // Sous la bombe : son nom en gros, puis la ville et la puissance en gris.
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${(desk ? 24 : 16) * d}px Geist, system-ui, sans-serif`;
    ctx.fillStyle = "#111";
    ctx.fillText(b.name, x, top + L + (desk ? 40 : 26) * d);
    ctx.font = `400 ${(desk ? 13 : 11) * d}px Geist, system-ui, sans-serif`;
    ctx.fillStyle = "#7A7A7F";
    ctx.fillText(b.city + ", " + b.kt, x, top + L + (desk ? 62 : 42) * d);
  });
  // On remet l'alignement du texte par défaut pour les dessins suivants.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
