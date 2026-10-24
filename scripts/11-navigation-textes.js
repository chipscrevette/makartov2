/* =====================================================================
   NAVIGATION ET TEXTES DU RÉCIT
   ---------------------------------------------------------------------
   Ce fichier allume, dans le menu du haut, le chapitre en cours de lecture
   et fait avancer la barre rouge de progression. Sur téléphone, il pose
   aussi chaque texte en bas de l'écran (« épinglé ») et l'anime : il
   apparaît en montant, puis s'efface quand le suivant le pousse. Toucher
   un texte le range en bas pour voir la carte entière.
   Utilise : estTelephone (04-pacifique-donnees.js).
   Fournit : auDefilement, epinglerTextes, estomperTextes
   (appelées par 14-demarrage.js).
   ===================================================================== */

/* ---------- 1. Menu des chapitres et barre de progression ---------- */

// Les liens du menu ; chacun porte data-c = l'identifiant de la section visée.
const liensMenu = [...document.querySelectorAll(".nav a")];

// Les sections des chapitres, dans le même ordre que les liens.
const chapitres = liensMenu.map((a) => document.getElementById(a.dataset.c));

// Appelée à chaque défilement. Ne renvoie rien.
// y : la ligne de repère, au milieu de l'écran (50 % de la hauteur) ;
// on : position du chapitre en cours (-1 = aucun).
function auDefilement() {
  const y = innerHeight * 0.5;
  let on = -1;
  // Le chapitre en cours est le dernier dont le haut est passé au-dessus du milieu de l'écran.
  chapitres.forEach((s, i) => {
    if (s.getBoundingClientRect().top <= y) on = i;
  });
  // Un chapitre se termine où commence le suivant. La section « Héritage », placée après
  // Rennes (chapitre n° 3 en comptant depuis 0), n'appartient à aucun chapitre.
  const her = document.querySelector('[aria-label="Héritage"]').getBoundingClientRect();
  if (on === 3 && her.top < y) on = -1;
  liensMenu.forEach((a, i) => a.classList.toggle("on", i === on));
  // h : la distance totale qu'on peut faire défiler. La barre est remplie en pourcentage
  // de cette distance (0 % si la page ne défile pas).
  const h = document.documentElement.scrollHeight - innerHeight;
  document.getElementById("progress").style.width = (h > 0 ? (scrollY / h) * 100 : 0) + "%";
}

addEventListener("scroll", auDefilement, { passive: true });

/* ---------- 2. Textes épinglés en bas de l'écran (téléphone) ---------- */

// La hauteur où chaque texte se pose dépend de sa propre hauteur : le bas du texte
// arrive à 8 px du bas de l'écran. Ne renvoie rien.
// mob : vrai sur téléphone ; sb : marge du bas de la page (zone réservée par le téléphone,
// par exemple la barre de geste), lue dans le CSS. Le résultat va dans la variable CSS --pin
// (position du haut du texte) ; sur PC, --pin vaut "auto".
function epinglerTextes() {
  const mob = estTelephone(),
    sb = parseFloat(getComputedStyle(document.documentElement).paddingBottom) || 0;
  document
    .querySelectorAll(".step .card")
    .forEach((c) =>
      c.style.setProperty(
        "--pin",
        mob ? Math.round(innerHeight - c.offsetHeight - 8 - sb) + "px" : "auto",
      ),
    );
}

/* ---------- 3. Toucher un texte pour le ranger (téléphone) ---------- */

// Tous les textes du récit. Le texte qui part s'efface aussitôt poussé, au lieu de remonter
// sur toute la carte.
const textesEpingles = [...document.querySelectorAll(".step .card")];

// Sur téléphone, toucher le texte le range en bas pour voir la carte entière ;
// il revient à l'étape suivante. texteActif = le texte posé en ce moment.
let texteActif = null;

// La classe "peek" sur la page fait glisser les textes vers le bas (voir 08-telephone.css).
// On ignore les touchers sur un bouton ou un lien placé dans le texte.
textesEpingles.forEach((c) =>
  c.addEventListener("click", (e) => {
    if (!estTelephone() || e.target.closest("button,a")) return;
    document.body.classList.toggle("peek");
  }),
);

/* ---------- 4. Arrivée et départ animés des textes (téléphone) ---------- */

// Appelée à chaque défilement. Règle la transparence et la taille de chaque texte selon
// sa distance à sa place épinglée. Ne renvoie rien.
// H : hauteur de l'écran en pixels CSS ; ez : courbe d'adoucissement (rapide au début,
// lente à la fin), x va de 0 à 1 ; act : le texte posé à sa place ; pk : vrai si les textes
// sont rangés en bas (classe "peek").
function estomperTextes() {
  // Sur PC, on retire tous les effets et on s'arrête là.
  if (!estTelephone()) {
    textesEpingles.forEach((c) => {
      c.style.opacity = "";
      c.style.transform = "";
      [...c.children].forEach((k) => (k.style.transform = ""));
    });
    return;
  }
  const H = innerHeight,
    ez = (x) => 1 - Math.pow(1 - x, 3);
  let act = null;
  const pk = document.body.classList.contains("peek");
  textesEpingles.forEach((c) => {
    // pin : la place épinglée du texte ; top : sa position actuelle. Si le texte est rangé
    // en bas, on retire le décalage du rangement (il ne laisse dépasser que 40 px).
    const pin = parseFloat(c.style.getPropertyValue("--pin")) || 0,
      top = c.getBoundingClientRect().top - (pk ? c.offsetHeight - 40 : 0);
    // Le texte est « posé » s'il est à moins de 2 px de sa place, ou juste en dessous
    // (moins de 10 % de la hauteur de l'écran).
    if (Math.abs(top - pin) < 2 || (top > pin && top < pin + H * 0.1)) act = c;
    if (top > pin + 0.5) {
      // Arrivée : le texte monte, se dévoile et ses lignes se rangent l'une après l'autre.
      // p va de 0 (texte encore à 45 % d'écran sous sa place) à 1 (arrivé).
      const p = ez(Math.max(0, Math.min(1, 1 - (top - pin) / (H * 0.45))));
      c.style.opacity = p.toFixed(3);
      // Taille de 94 % à 100 %.
      c.style.transform = `scale(${(0.94 + 0.06 * p).toFixed(4)})`;
      // Chaque ligne k part un peu plus bas que la précédente (14 px, puis 12 px de plus).
      [...c.children].forEach(
        (k, i) => (k.style.transform = `translateY(${((1 - p) * (14 + i * 12)).toFixed(1)}px)`),
      );
    } else {
      // Départ : poussé par le suivant, il recule et s'efface.
      // q va de 0 (à sa place) à 1 (monté de 18 % de la hauteur de l'écran).
      const q = Math.max(0, Math.min(1, (pin - top) / (H * 0.18)));
      c.style.opacity = (1 - q).toFixed(3);
      // Taille de 100 % à 94 %, et léger recul vers le haut (jusqu'à 10 px).
      c.style.transform = `scale(${(1 - 0.06 * q).toFixed(4)}) translateY(${(-q * 10).toFixed(1)}px)`;
      [...c.children].forEach((k) => (k.style.transform = ""));
    }
  });
  // Quand un nouveau texte se pose, on fait remonter les textes rangés.
  if (act !== texteActif) {
    texteActif = act;
    document.body.classList.remove("peek");
  }
}

addEventListener("scroll", estomperTextes, { passive: true });
