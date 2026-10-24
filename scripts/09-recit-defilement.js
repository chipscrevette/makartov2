/* =====================================================================
   RÉCIT AU DÉFILEMENT (PC)
   ---------------------------------------------------------------------
   Ce fichier relie les textes du récit à la grande carte. Quand un texte
   arrive au milieu de l'écran, la carte change de scène (Pacifique, ville
   avant ou après la bombe, bilan des bombes). Il gère aussi les boutons
   « déclencheurs » qu'on maintient appuyés pour lancer l'explosion, la
   « planche contact » (petites vignettes des trois villes) et la carte
   de Hiroshima dessinée en fond du grand titre.
   Utilise : allerVers, sceneActuelle, planche (07-scene-carte.js),
   VILLES, MOUVEMENT_REDUIT (01-reglages.js), dessinerVille (03-villes.js).
   Fournit : sceneDeLEtape (aussi utilisée par 13-lecteur-telephone.js),
   dessinerVignettes et dessinerOuverture (appelées par 14-demarrage.js).
   ===================================================================== */

/* ---------- 1. Étapes du récit : chaque texte choisit la scène de la carte ---------- */

// Tous les blocs de texte du récit, dans l'ordre de la page.
const etapesRecit = [...document.querySelectorAll("#steps .step")];

// Lit l'attribut data-s d'une étape et le traduit en « scène » pour la carte.
// el : l'élément HTML de l'étape. Son data-s vaut par exemple "pac:3", "bombs:0",
// "hiro:before" ou "hiro:after" (le nom avant les deux-points, la précision après).
// Renvoie un objet scène :
//   { kind: "pac", i: 3 } pour l'étape 3 du Pacifique ;
//   { kind: "bombs" } pour le bilan des bombes ;
//   { kind: "city", city: "hiro", after: true/false } pour une ville avant ou après.
function sceneDeLEtape(el) {
  // k = la partie avant ":", v = la partie après.
  const [k, v] = el.dataset.s.split(":");
  return k === "pac"
    ? { kind: "pac", i: +v }
    : k === "bombs"
      ? { kind: "bombs" }
      : { kind: "city", city: k, after: v === "after" };
}

// Retient, pour chaque ville ("hiro", "naga", "ren"), si le lecteur a déjà déclenché la bombe.
let declenche = {};

/* ---------- 2. Observateur : on repère le texte qui passe au milieu de l'écran ---------- */

// es : la liste des étapes dont la visibilité vient de changer ; e : une de ces étapes.
// La marge "-50% 0px -50% 0px" réduit la zone observée à une ligne au milieu de l'écran :
// une étape est « visible » seulement quand elle croise cette ligne.
const observateur = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const sc = sceneDeLEtape(e.target);
      // Si la bombe a déjà été déclenchée pour cette ville, on garde la vue « après ».
      if (sc.kind === "city" && !sc.after && declenche[sc.city]) sc.after = true;
      allerVers(sc);
    }),
  { rootMargin: "-50% 0px -50% 0px" },
);

etapesRecit.forEach((s) => observateur.observe(s));

// Quand on remonte au-dessus d'une étape « avant », on oublie le déclenchement.
// innerHeight * 0.6 : le haut de l'étape est descendu sous 60 % de la hauteur de l'écran.
addEventListener(
  "scroll",
  () => {
    for (const id in declenche) {
      const s = document.querySelector(`[data-s="${id}:before"]`);
      if (s.getBoundingClientRect().top > innerHeight * 0.6) declenche[id] = false;
    }
  },
  { passive: true },
);

/* ---------- 3. Boutons déclencheurs : maintenir appuyé pour lancer la bombe ---------- */

// Deux petites icônes SVG : "shut" (obturateur, avant le déclenchement)
// et "rew" (flèche de retour, pour revoir la ville avant).
const ICONES_DECLENCHEUR =
  '<svg class="shut" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M14.5 2.8 9 12.3M21.2 10 10.2 10.1M17.7 19.4 12.2 9.9M9.5 21.2 15 11.7M2.8 14l11-.1M6.3 4.6l5.5 9.5"/></svg><svg class="rew" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>';

// b : un bouton .fire. Son data-fire donne la ville ("hiro", "naga" ou "ren").
document.querySelectorAll(".fire").forEach((b) => {
  // On remplit le bouton : l'icône, puis un titre (data-t) et un sous-titre (data-s),
  // dont le texte est écrit plus tard par majInterface (07-scene-carte.js).
  b.innerHTML = `<span class="ico" aria-hidden="true">${ICONES_DECLENCHEUR}</span><span class="lbl"><span data-t></span><small data-s></small></span>`;
  const id = b.dataset.fire;
  // h : numéro de l'animation en cours (pour pouvoir l'arrêter) ;
  // h0 : l'instant, en millisecondes, où l'appui a commencé.
  let h, h0;

  // Lance l'explosion : on note le déclenchement et on passe la ville en vue « après ».
  const fire = () => {
    declenche[id] = true;
    allerVers({ kind: "city", city: id, after: true });
  };

  // Remplit peu à peu le bouton pendant l'appui. now : l'instant actuel en millisecondes.
  // p va de 0 à 1 en 800 ms (0,8 seconde d'appui). La variable CSS --p sert à dessiner
  // la barre de chargement. Arrivé à 1, on remet la barre à zéro et on déclenche.
  const charge = (now) => {
    const p = Math.min(1, (now - h0) / 800);
    b.style.setProperty("--p", p);
    if (p < 1) h = requestAnimationFrame(charge);
    else {
      b.style.setProperty("--p", 0);
      h = null;
      fire();
    }
  };

  // Début de l'appui (souris, doigt ou stylet).
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    // Bouton déjà utilisé (classe "done") : un appui ramène la ville à la vue « avant ».
    if (b.classList.contains("done")) {
      declenche[id] = false;
      allerVers({ kind: "city", city: id, after: false });
      return;
    }
    // Si la carte ne montre pas encore cette ville, on l'affiche d'abord en vue « avant ».
    if (!sceneActuelle || sceneActuelle.kind !== "city" || sceneActuelle.city !== id)
      allerVers({ kind: "city", city: id, after: false });
    h0 = performance.now();
    h = requestAnimationFrame(charge);
  });

  // Si on relâche trop tôt (ou si le pointeur sort du bouton), on annule le chargement.
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
    b.addEventListener(ev, () => {
      if (h) {
        cancelAnimationFrame(h);
        h = null;
        b.style.setProperty("--p", 0);
      }
    }),
  );

  // Au clavier, Espace ou Entrée déclenche tout de suite (ou revient à la vue « avant »).
  b.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (b.classList.contains("done")) {
        declenche[id] = false;
        allerVers({ kind: "city", city: id, after: false });
      } else fire();
    }
  });

  // On bloque le menu du clic droit (ou de l'appui long sur téléphone) sur le bouton.
  b.addEventListener("contextmenu", (e) => e.preventDefault());
});

/* ---------- 4. Planche contact : une vignette cliquable par ville ---------- */

const VILLES_PLANCHE = ["hiro", "naga", "ren"];

// Pour chaque ville, on crée un bouton avec un petit canevas et le nom de la ville.
// c : la fiche de la ville (dans VILLES) ; f : le bouton créé.
VILLES_PLANCHE.forEach((id) => {
  const c = VILLES[id],
    f = document.createElement("button");
  f.className = "frame";
  f.dataset.city = id;
  f.setAttribute("aria-label", "Aller à " + c.name);
  f.innerHTML = `<canvas></canvas><span><b style="font-weight:500">${c.num}</b>${c.name}</span>`;
  planche.appendChild(f);
  // Un clic fait défiler la page jusqu'au premier texte de la ville (étape « avant »).
  // Si l'utilisateur préfère moins d'animations, le saut est immédiat.
  f.addEventListener("click", () =>
    document
      .querySelector(`[data-s="${id}:before"]`)
      .scrollIntoView({ behavior: MOUVEMENT_REDUIT ? "auto" : "smooth", block: "center" }),
  );
});

// Dessine la carte miniature de chaque ville dans sa vignette (vue « après »).
// t : le canevas d'une vignette ; i : sa position, qui donne la ville dans VILLES_PLANCHE ;
// r : sa taille à l'écran ; d = 2 : on dessine toujours avec 2 pixels réels par pixel CSS,
// pour une image nette. Ne renvoie rien.
function dessinerVignettes() {
  planche.querySelectorAll("canvas").forEach((t, i) => {
    const r = t.getBoundingClientRect();
    // Vignette cachée (largeur nulle) : rien à dessiner.
    if (!r.width) return;
    const d = 2;
    t.width = Math.round(r.width * d);
    t.height = Math.round(r.height * d);
    dessinerVille(t.getContext("2d"), t.width, t.height, d, VILLES[VILLES_PLANCHE[i]], true, {
      thumb: 1
    });
  });
}

/* ---------- 5. Ouverture : la carte de Hiroshima sous le grand titre ---------- */

// Dessine Hiroshima (vue « avant ») dans le canevas #heroMap du haut de la page.
// h : le canevas ; r : sa taille à l'écran ; d : densité de l'écran (pixels réels par
// pixel CSS), plafonnée à 2 pour ne pas trop alourdir le dessin.
// zoom 0.9 : on montre la ville un peu plus serrée que par défaut. Ne renvoie rien.
function dessinerOuverture() {
  const h = document.getElementById("heroMap"),
    r = h.getBoundingClientRect(),
    d = Math.min(2, devicePixelRatio || 1);
  h.width = Math.round(r.width * d);
  h.height = Math.round(r.height * d);
  dessinerVille(h.getContext("2d"), h.width, h.height, d, VILLES.hiro, false, { zoom: 0.9 });
}
