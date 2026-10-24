/* =====================================================================
   SCÈNE PRINCIPALE : LA GRANDE CARTE DU RÉCIT
   ---------------------------------------------------------------------
   Ce fichier gère le grand canevas qui sert de décor au récit. Il sait
   passer d'une « scène » à l'autre : carte du Pacifique, écran « Bilan »
   des bombes, ou carte d'une ville avant et après l'explosion. Il gère
   aussi les étiquettes HTML posées sur la carte, les légendes et les
   boutons « Maintenir pour déclencher », ainsi que les petites animations
   (fondu enchaîné, flash de l'explosion).
   Une scène est un petit objet : { kind: "pac", i } pour le Pacifique,
   { kind: "bombs" } pour le bilan, { kind: "city", city, after } pour une ville.
   Utilise : VILLES, MOUVEMENT_REDUIT, LECTEUR (01-reglages.js), cadrageVille, dessinerVille,
   bandeLibre (03-villes.js), zonesAEviter, chargerNiveauxDetail (05-pacifique-dessin.js),
   dessinerBombes (06-bilan-bombes.js), afficherPacifique, bouclePacifique, imagePacifique,
   fonduPacifique (08-pacifique-camera.js).
   Fournit : carte, pinceau, densite, sceneActuelle, camera, ajusterTaille,
   placerEtiquettes, majInterface, animer, allerVers.
   ===================================================================== */

/* ---------- 1. Éléments de la page et état partagé ---------- */

// carte = le canevas principal ; pinceau = son outil de dessin 2D ;
// decor = le bloc qui contient la carte et ses étiquettes ; eclair = le voile blanc du flash.
const carte = document.getElementById("map"),
  pinceau = carte.getContext("2d"),
  decor = document.getElementById("stage"),
  eclair = document.getElementById("flash");

// Légende des villes, planche contact (vignettes des villes) et légende du Pacifique.
const legendeVille = document.getElementById("legend"),
  planche = document.getElementById("strip"),
  legendePacifique = document.getElementById("legendPac");

// densite = pixels réels par pixel CSS (limitée à 2) ;
// sceneActuelle = la scène affichée ; cacheVilles = images de villes déjà dessinées ;
// animationEnCours = numéro de l'animation en cours (pour pouvoir l'arrêter) ;
// camera = position actuelle de la caméra du Pacifique.
let densite = 1,
  sceneActuelle = null,
  cacheVilles = {},
  animationEnCours = 0,
  camera = null;

/* ---------- 2. Taille du canevas ---------- */

// Donne au canevas une taille en pixels réels égale à sa taille affichée x la densité.
// La densité est limitée à 2 pour ne pas dessiner des images trop lourdes.
// Comme la taille change, on vide le cache des images de villes.
// Ne prend aucun paramètre et ne renvoie rien.
function ajusterTaille() {
  const r = carte.getBoundingClientRect();
  densite = Math.min(2, devicePixelRatio || 1);
  carte.width = Math.round(r.width * densite);
  carte.height = Math.round(r.height * densite);
  cacheVilles = {};
}

/* ---------- 3. Images préparées à l'avance ---------- */

// Renvoie l'image (un canevas hors écran) d'une ville, avant ou après l'explosion.
// Chaque image n'est dessinée qu'une fois, puis gardée en mémoire dans cacheVilles.
// id = identifiant de la ville ("hiro", "naga" ou "ren").
// after = true pour la ville après l'explosion, false pour avant.
function imageVille(id, after) {
  // k = clé du cache : l'id, puis « a » (après) ou « b » (avant).
  let k = id + (after ? "a" : "b");
  // Dans le lecteur du téléphone, le cadrage dépend de la bande libre de l'écran :
  // on ajoute sa position à la clé pour redessiner si elle change.
  if (LECTEUR.on) {
    const v = bandeLibre(carte.height, densite);
    k += Math.round(v.top) + "_" + Math.round(v.bot);
  }
  if (cacheVilles[k]) return cacheVilles[k];
  // o = un canevas hors écran, de même taille que la carte.
  const o = document.createElement("canvas");
  o.width = carte.width;
  o.height = carte.height;
  dessinerVille(o.getContext("2d"), o.width, o.height, densite, VILLES[id], after);
  return (cacheVilles[k] = o);
}

// Fait une copie de ce que montre la carte en ce moment.
// Cette copie sert au fondu enchaîné vers la scène suivante.
// Renvoie un canevas hors écran contenant la copie.
function photographierCarte() {
  const o = document.createElement("canvas");
  o.width = carte.width;
  o.height = carte.height;
  o.getContext("2d").drawImage(carte, 0, 0);
  return o;
}

/* ---------- 4. Étiquettes HTML posées sur une carte de ville ---------- */

// Place les étiquettes d'une ville (hypocentre, lieux connus, cercles 1, 2 et 3 km).
// Ce sont des blocs HTML posés par-dessus le canevas, pas des dessins.
// Une étiquette qui sort de la carte ou qui touche une légende n'est pas gardée.
// Ne prend aucun paramètre et ne renvoie rien.
function placerEtiquettes() {
  // On retire d'abord les anciennes étiquettes.
  decor.querySelectorAll(".label").forEach((l) => l.remove());
  if (!sceneActuelle || sceneActuelle.kind !== "city") return;
  const c = VILLES[sceneActuelle.city];
  // Cadrage de la ville : K = correction d'échelle de Mercator, s = échelle,
  // cx, cy = position de l'hypocentre en pixels, tf = convertit (lo, la) en pixels.
  const { K, s, cx, cy, tf } = cadrageVille(c, carte.width, carte.height, densite);
  // mob = petit écran (moins de 900 px CSS de large).
  const mob = carte.clientWidth < 900;
  const after = sceneActuelle.after;
  // avoid = rectangles à ne pas recouvrir : légende, planche contact et,
  // dans le lecteur du téléphone, son en-tête et son tiroir de texte.
  const avoid = [
    legendeVille,
    planche,
    ...(LECTEUR.on ? [...document.querySelectorAll("#player .pv-top,#player .pv-sheet")] : []),
  ]
    .filter((e) => !e.classList.contains("off") && getComputedStyle(e).display !== "none")
    .map((e) => e.getBoundingClientRect());
  // put : pose une étiquette au point (x, y), en pixels réels.
  // html = son contenu ; cls = classe CSS en plus (ex. "left", "ring", "plain").
  const put = (x, y, html, cls) => {
    // Hors de la carte, ou trop haut (sous l'en-tête) ou trop bas : on ne pose rien.
    if (
      x < 0 ||
      y < (LECTEUR.on ? bandeLibre(carte.height, densite).top + 6 * densite : 60 * densite) ||
      x > carte.width ||
      y > carte.height - 8 * densite
    )
      return;
    const el = document.createElement("div");
    el.className = "label" + (cls ? " " + cls : "");
    el.innerHTML = html;
    // Le style CSS attend des pixels CSS : on divise par la densité.
    el.style.left = x / densite + "px";
    el.style.top = y / densite + "px";
    decor.appendChild(el);
    // Si l'étiquette touche une zone à éviter (avec 6 px de marge), on la retire.
    const r = el.getBoundingClientRect();
    if (
      avoid.some(
        (q) =>
          r.left < q.right + 6 &&
          r.right > q.left - 6 &&
          r.top < q.bottom + 6 &&
          r.bottom > q.top - 6,
      )
    )
      el.remove();
  };
  // Étiquette du centre (« Hypocentre », ou « Centre » pour Rennes), décalée à droite du point.
  put(cx, cy, c.center || "Hypocentre", "off");
  // Lieux connus : lo, la = position ; t = texte ; cls = "left" pour mettre le point à droite ;
  // opt = lieu facultatif, caché sur petit écran ; style = "plain" pour un texte sans point.
  for (const [lo, la, t, cls, opt, style] of c.poi) {
    if (opt && mob) continue;
    const p = tf(lo, la);
    if (style === "plain") put(p[0], p[1], t, "plain");
    else if (cls === "left") put(p[0], p[1], t + "<i></i>", "left");
    else put(p[0], p[1], "<i></i>" + t);
  }
  // Après l'explosion : étiquettes « 1 km », « 2 km », « 3 km » sur les cercles de distance.
  if (after)
    [1, 2, 3].forEach((k) => {
      // a = angle où l'on pose les étiquettes : 0,17 x pi (environ 31 degrés, en bas à droite)
      // sur grand écran, 0,62 x pi (environ 112 degrés, en bas à gauche) sur petit écran.
      // r = rayon du cercle en pixels : k km en mètres, x K (Mercator), x s (échelle).
      const a = mob ? Math.PI * 0.62 : Math.PI * 0.17,
        r = k * 1000 * K * s;
      put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, k + " km", "ring");
    });
}

/* ---------- 5. Mise à jour des légendes et des boutons ---------- */

// Montre ou cache les légendes selon la scène, et met à jour leurs textes.
// Calcule aussi zonesAEviter : les rectangles (en pixels réels du canevas) que les
// étiquettes de la carte du Pacifique ne doivent pas recouvrir.
// Ne prend aucun paramètre et ne renvoie rien.
function majInterface() {
  // city = true si la scène actuelle est une carte de ville.
  const city = sceneActuelle && sceneActuelle.kind === "city";
  legendeVille.classList.toggle("off", !city);
  planche.classList.toggle("off", !city);
  legendePacifique.classList.toggle("off", !(sceneActuelle && sceneActuelle.kind === "pac"));
  // Zones à éviter : légende du Pacifique, chaque élément de la barre du haut,
  // et dans le lecteur du téléphone son en-tête et son tiroir de texte.
  zonesAEviter = [
    legendePacifique,
    document.querySelector(".bar"),
    ...(LECTEUR.on ? [...document.querySelectorAll("#player .pv-top,#player .pv-sheet")] : []),
  ]
    .filter((e) => !e.classList.contains("off") && getComputedStyle(e).display !== "none")
    // La barre du haut est remplacée par ses enfants, pour ne bloquer que ses parties visibles.
    .flatMap((e) => (e.classList.contains("bar") ? [...e.children] : [e]))
    .filter((e) => getComputedStyle(e).display !== "none")
    // On passe des pixels CSS de la page aux pixels réels du canevas :
    // l, t, r, b = bords gauche, haut, droit et bas.
    .map((e) => {
      const r = e.getBoundingClientRect(),
        o = carte.getBoundingClientRect();
      return {
        l: (r.left - o.left) * densite,
        t: (r.top - o.top) * densite,
        r: (r.right - o.left) * densite,
        b: (r.bottom - o.top) * densite,
      };
    });
  if (city) {
    // Légende : « Endommagé » ou « Incendié » selon la ville ; zones grisées avant l'explosion.
    document.getElementById("lg-par").textContent = VILLES[sceneActuelle.city].par;
    legendeVille
      .querySelectorAll(".z")
      .forEach((z) => z.classList.toggle("dim", !sceneActuelle.after));
    // Planche contact : on signale la vignette de la ville affichée.
    planche
      .querySelectorAll(".frame")
      .forEach((f) =>
        f.setAttribute("aria-current", f.dataset.city === sceneActuelle.city ? "true" : "false"),
      );
  }
  // Boutons « Maintenir pour déclencher » : leur texte change une fois l'explosion montrée.
  document.querySelectorAll(".fire").forEach((b) => {
    // done = true si ce bouton correspond à la ville affichée après l'explosion.
    const done =
      sceneActuelle &&
      sceneActuelle.kind === "city" &&
      sceneActuelle.city === b.dataset.fire &&
      sceneActuelle.after;
    b.classList.toggle("done", !!done);
    b.querySelector("[data-t]").textContent = done
      ? "Revoir la ville avant"
      : b.dataset.fire === "ren"
        ? "Maintenir pour superposer"
        : "Maintenir pour déclencher";
    b.querySelector("[data-s]").textContent = done
      ? "Un clic suffit"
      : "Appui long, ou continue de défiler";
  });
}

/* ---------- 6. Petit moteur d'animation ---------- */

// Joue une animation image par image, en arrêtant d'abord celle qui était en cours.
// dur = durée en millisecondes.
// frame = fonction appelée à chaque image avec t, l'avancement de 0 à 1.
// done = fonction facultative appelée à la fin.
// Si l'utilisateur préfère moins d'animations (MOUVEMENT_REDUIT) ou si dur vaut 0,
// on affiche tout de suite la dernière image.
function animer(dur, frame, done) {
  cancelAnimationFrame(animationEnCours);
  if (MOUVEMENT_REDUIT || dur === 0) {
    frame(1);
    done && done();
    return;
  }
  // t0 = heure de départ ; step = dessine une image et demande la suivante.
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, Math.max(0, (now - t0) / dur));
    frame(t);
    if (t < 1) animationEnCours = requestAnimationFrame(step);
    else done && done();
  };
  animationEnCours = requestAnimationFrame(step);
}

/* ---------- 7. Passage d'une scène à une autre ---------- */

// Affiche une nouvelle scène, avec la transition qui convient.
// next = la scène à afficher (voir le format en tête de fichier).
// force = true pour redessiner même si la scène demandée est déjà affichée.
// Ne renvoie rien.
function allerVers(next, force) {
  const prev = sceneActuelle;
  // Même scène qu'avant (et pas de force) : rien à faire.
  if (!force && prev && JSON.stringify(prev) === JSON.stringify(next)) return;
  sceneActuelle = next;
  majInterface();
  placerEtiquettes();
  // 7a. Carte du Pacifique.
  if (next.kind === "pac") {
    // Déjà sur le Pacifique : on relance seulement la boucle de la caméra.
    if (prev && prev.kind === "pac") {
      if (!imagePacifique) imagePacifique = requestAnimationFrame(bouclePacifique);
      return;
    }
    // On charge les contours détaillés des terres (une seule fois).
    chargerNiveauxDetail();
    // snap = copie de l'ancienne scène, qui s'efface en 500 ms par-dessus le Pacifique.
    const snap = prev ? photographierCarte() : null;
    // Pendant ce fondu, la boucle de la caméra (08-pacifique-camera.js) ne dessine pas.
    fonduPacifique = true;
    animer(
      prev ? 500 : 0,
      (t) => {
        afficherPacifique(true);
        if (snap) {
          pinceau.globalAlpha = 1 - t;
          pinceau.drawImage(snap, 0, 0);
          pinceau.globalAlpha = 1;
        }
      },
      () => {
        fonduPacifique = false;
      },
    );
    return;
  }
  // 7b. Écran « Bilan » des bombes : animation de 2 s, l'ancienne scène s'efface
  // pendant les 30 premiers pour cent.
  if (next.kind === "bombs") {
    const snap = prev ? photographierCarte() : null;
    eclair.style.opacity = 0;
    animer(2000, (t) => {
      dessinerBombes(pinceau, carte.width, carte.height, densite, t);
      if (snap && t < 0.3) {
        pinceau.globalAlpha = 1 - t / 0.3;
        pinceau.drawImage(snap, 0, 0);
        pinceau.globalAlpha = 1;
      }
    });
    return;
  }
  // 7c. Carte d'une ville : b = image avant l'explosion, a = image après.
  const b = imageVille(next.city, false),
    a = imageVille(next.city, true);
  // Même ville, on passe de « avant » à « après » : on joue l'explosion.
  if (prev && prev.kind === "city" && prev.city === next.city && !prev.after && next.after) {
    // Le flash : un cercle part de l'hypocentre (cx, cy) et dévoile l'image « après ».
    const { cx, cy } = cadrageVille(VILLES[next.city], carte.width, carte.height, densite);
    // Rm = diagonale du canevas : le cercle grandit jusqu'à 80 % de cette diagonale,
    // ce qui suffit à couvrir l'écran.
    const Rm = Math.hypot(carte.width, carte.height);
    animer(
      2200,
      (t) => {
        // e = avancement adouci (rapide au début, lent à la fin).
        const e = 1 - Math.pow(1 - t, 3);
        pinceau.drawImage(b, 0, 0);
        pinceau.save();
        pinceau.beginPath();
        pinceau.arc(cx, cy, e * 0.8 * Rm, 0, Math.PI * 2);
        pinceau.clip();
        pinceau.drawImage(a, 0, 0);
        pinceau.restore();
        // Le voile blanc disparaît vite : il est éteint dès t = 1 / 3,2 (environ 31 %).
        eclair.style.opacity = Math.max(0, 1 - t * 3.2);
      },
      () => {
        pinceau.drawImage(a, 0, 0);
        eclair.style.opacity = 0;
      },
    );
    return;
  }
  // Autres cas : simple fondu enchaîné de 450 ms depuis l'ancienne scène.
  const snap = prev ? photographierCarte() : null,
    img = next.after ? a : b;
  eclair.style.opacity = 0;
  animer(snap ? 450 : 0, (t) => {
    pinceau.drawImage(img, 0, 0);
    if (snap) {
      pinceau.globalAlpha = 1 - t;
      pinceau.drawImage(snap, 0, 0);
      pinceau.globalAlpha = 1;
    }
  });
}
