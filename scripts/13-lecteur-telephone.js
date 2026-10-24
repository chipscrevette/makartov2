/* =====================================================================
   LECTEUR SUR TÉLÉPHONE (RÉCIT ÉCRAN PAR ÉCRAN)
   ---------------------------------------------------------------------
   Sur téléphone (largeur < 900 px), la page ne défile pas : le récit est
   montré écran par écran, comme des « stories ». Ce fichier découpe les
   textes de la page en écrans, construit le lecteur (#player), gère les
   gestes (toucher, glisser, clavier) et affiche l'écran demandé avec sa
   carte, sa mini-carte et sa barre de progression.
   Utilise : LECTEUR (01-reglages.js), sceneDeLEtape (09), allerVers,
   majInterface, placerEtiquettes, legendeVille, legendePacifique,
   camera (07), choisirCouche (10), MINI_CARTE, afficherMiniCarte,
   miniCartePacifique, miniCarteVille (12).
   Fournit : construireEcrans, demarrerLecteur, allerAEcran
   (appelés par 14-demarrage.js).
   ===================================================================== */

/* ---------- 1. Découper la page en écrans ---------- */

// Parcourt la page et la découpe en une liste d'écrans (F), dans l'ordre de lecture.
// Chaque écran est un objet :
//   type = "hero" (ouverture), "text", "quote" (citation), "map" (étape avec carte),
//          "lab" (coulisses SIG) ou "end" (fin) ;
//   ch = nom du chapitre affiché en haut ; html = contenu à afficher ;
//   dark = fond sombre ; sub = sous-titre ; scene = scène de carte ; l = numéro de couche.
// Renvoie la liste des écrans.
function construireEcrans() {
  const F = [];
  // nom du chapitre selon la clé de l'étape (data-s="hiro:before" donne "hiro")
  const chap = {
    pac: "Pacifique",
    hiro: "Hiroshima",
    naga: "Nagasaki",
    bombs: "Bilan",
    ren: "Rennes",
  };
  // on prend, dans l'ordre de la page : l'ouverture, les textes, les étapes du récit,
  // les textes et étapes des coulisses SIG, et le pied de page
  document
    .querySelectorAll(
      ".hero, section.wrap > .prose, #story .step, .lab > .wrap > .prose, #labSteps .step, footer.credit",
    )
    .forEach((el) => {
      // ouverture : l'invitation « défiler » devient « Touchez pour commencer »
      if (el.matches(".hero")) {
        F.push({
          type: "hero",
          ch: "Markarto",
          html: el
            .querySelector(".in")
            .innerHTML.replace(
              /<span class="cue">[\s\S]*?<\/span>/,
              '<span class="pv-go">Touchez pour commencer</span>',
            ),
        });
        return;
      }
      // fin : le pied de page, suivi d'un bouton pour revoir le récit depuis le début
      if (el.matches("footer")) {
        F.push({
          type: "end",
          ch: "Fin",
          html:
            "<p>" + el.innerHTML + '</p><span class="pv-go" data-restart>Revoir le récit</span>',
        });
        return;
      }
      // bloc de texte : on le coupe en plusieurs écrans courts
      if (el.matches(".prose")) {
        // dark = texte des coulisses SIG (fond sombre) ; sec = la section qui le contient ;
        // ch = nom du chapitre, lu dans l'attribut aria-label de la section
        const dark = !!el.closest(".lab"),
          sec = el.closest("section"),
          ch = dark ? "Coulisses SIG" : sec.getAttribute("aria-label") || "";
        // k = le petit surtitre du bloc (.kicker) ;
        // kh = son HTML, répété en haut de chaque écran
        const k = el.querySelector(".kicker"),
          kh = k ? k.outerHTML : "";
        // cur = l'écran en cours de remplissage (null = il faut en commencer un nouveau)
        let cur = null;
        // n = chaque élément enfant du bloc (titre, paragraphe, citation…)
        [...el.children].forEach((n) => {
          if (n === k) return;
          // une citation occupe un écran à elle seule
          if (n.matches("blockquote")) {
            F.push({ type: "quote", ch, dark, html: n.innerHTML });
            cur = null;
            return;
          }
          // un titre (h2) commence toujours un nouvel écran
          if (n.matches("h2") || !cur) {
            cur = { type: "text", ch, dark, html: kh };
            F.push(cur);
          }
          cur.html += n.outerHTML;
          // un paragraphe ferme l'écran : un seul paragraphe par écran
          if (n.matches("p")) cur = null;
        });
        return;
      }
      // étape du récit avec carte (attribut data-s, par exemple "pac:3" ou "hiro:after")
      if (el.dataset.s) {
        // sc = la scène de carte de l'étape ; k = la clé du chapitre
        const sc = sceneDeLEtape(el),
          k = el.dataset.s.split(":")[0];
        // on copie la carte de texte pour la modifier sans toucher à la page
        const card = el.querySelector(".card").cloneNode(true);
        // le bouton de déclenchement devient une simple invitation à toucher l'écran
        card
          .querySelectorAll(".fire")
          .forEach((b) => (b.outerHTML = '<span class="pv-go">Touchez pour déclencher</span>'));
        // on retire la consigne « Maintiens le bouton… », prévue pour l'ordinateur
        card
          .querySelectorAll("p")
          .forEach((p) => (p.innerHTML = p.innerHTML.replace(/ ?Maintiens le bouton[^.]*\./, "")));
        // tp = le dernier libellé de l'en-tête de la carte, utilisé comme sous-titre
        const tp = card.querySelector(".top span:last-child");
        F.push({
          type: "map",
          ch: chap[k],
          sub: tp ? tp.textContent : "",
          scene: sc,
          html: card.innerHTML,
        });
        return;
      }
      // étape des coulisses SIG (attribut data-l = numéro de la couche à montrer)
      if (el.dataset.l != null) {
        const tp = el.querySelector(".top span:last-child");
        F.push({
          type: "lab",
          ch: "Coulisses SIG",
          sub: tp ? tp.textContent : "",
          l: +el.dataset.l,
          html: el.querySelector(".card").innerHTML,
        });
      }
    });
  return F;
}

/* ---------- 2. Construire le lecteur et ses gestes ---------- */

// Met en place le lecteur, une seule fois : découpe les écrans, crée l'élément #player,
// y déplace les cartes de la page, branche les gestes et le clavier,
// puis range les légendes et la mini-carte dans l'en-tête.
function demarrerLecteur() {
  // la classe "pl" sur <body> cache la page normale (voir styles/09-lecteur-telephone.css)
  document.body.classList.add("pl");
  LECTEUR.frames = construireEcrans();
  // P = le lecteur. Ses parties :
  //   pv-map = carte du récit ; pv-lab = pile de couches des coulisses ;
  //   pv-page = texte en pleine page ; pv-top = en-tête (segments de progression,
  //   chapitre, sous-titre, compteur, légende et mini-carte) ;
  //   pv-sheet = tiroir de texte en bas, par-dessus la carte ;
  //   pv-hint = bulle « Touchez à droite pour avancer », visible sur l'ouverture
  const P = document.createElement("div");
  P.id = "player";
  P.innerHTML = `<div class="pv-map"></div><div class="pv-lab"></div><div class="pv-page"></div>
    <div class="pv-top"><div class="pv-segs"></div><div class="pv-meta"><b></b><em></em><span></span></div><div class="pv-ctx"><div class="pv-leg"></div><canvas class="pv-loc off" aria-hidden="true"></canvas></div></div><div class="pv-sheet"></div>
    <div class="pv-hint" aria-hidden="true"><span>Touchez à droite pour avancer</span></div>`;
  document.body.appendChild(P);
  // les scènes de carte existantes sont déplacées (et non copiées) dans le lecteur
  P.querySelector(".pv-map").appendChild(document.querySelector("#story .stage"));
  P.querySelector(".pv-lab").appendChild(document.querySelector("#labStory .stage"));
  // Gestes : un toucher ou un glissement suffit, jamais de défilement.
  // x0, y0 = position du doigt au début du geste ; t0 = heure du début (en millisecondes)
  let x0, y0, t0;
  P.addEventListener("pointerdown", (e) => {
    x0 = e.clientX;
    y0 = e.clientY;
    t0 = performance.now();
  });
  P.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    // dx, dy = déplacement du doigt entre le début et la fin du geste
    const dx = e.clientX - x0,
      dy = e.clientY - y0;
    x0 = null;
    // bouton « Revoir le récit » : retour au premier écran
    if (e.target.closest("[data-restart]")) {
      allerAEcran(0);
      return;
    }
    // un lien ou un bloc dépliable garde son comportement normal
    if (e.target.closest("a,summary,details")) return;
    // glissement de plus de 36 px : on suit la direction la plus marquée ;
    // vers la gauche ou vers le haut (valeur négative) = écran suivant, sinon écran précédent
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 36) {
      allerAEcran(LECTEUR.i + ((Math.abs(dx) > Math.abs(dy) ? dx : dy) < 0 ? 1 : -1));
      return;
    }
    // simple toucher : dans les 30 % de gauche on recule, ailleurs on avance
    allerAEcran(LECTEUR.i + (e.clientX < innerWidth * 0.3 ? -1 : 1));
  });
  // clavier : flèches droite ou bas et barre d'espace avancent, flèches gauche ou haut reculent
  addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ")
      allerAEcran(LECTEUR.i + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") allerAEcran(LECTEUR.i - 1);
  });
  // la mini-carte de situation (12-mini-carte.js) dessinera dans ce canevas
  MINI_CARTE.cv = P.querySelector(".pv-loc");
  // les légendes rejoignent l'en-tête, avec des libellés plus courts
  const lg = P.querySelector(".pv-leg");
  lg.append(legendeVille, legendePacifique);
  // libellé long de la légende du Pacifique : libellé court qui le remplace
  const short = {
    "Japon en 1930": "Japon 1930",
    "Conquêtes jusqu'en 1938": "Conquis 1938",
    "Conquêtes en 1942": "Conquis 1942",
  };
  legendePacifique.querySelectorAll("span").forEach((sp) => {
    // t = le morceau de texte brut (nodeType 3 = nœud de texte) qui a un libellé court
    const t = [...sp.childNodes].find((n) => n.nodeType === 3 && short[n.textContent.trim()]);
    if (t) t.textContent = short[t.textContent.trim()];
  });
  LECTEUR.ready = true;
}

/* ---------- 3. Afficher un écran ---------- */

// Affiche l'écran numéro i : en-tête, texte, carte en arrière-plan et mini-carte.
// i : numéro de l'écran voulu (ramené entre le premier et le dernier écran).
function allerAEcran(i) {
  i = Math.max(0, Math.min(LECTEUR.frames.length - 1, i));
  // rien à faire si cet écran est déjà affiché
  if (i === LECTEUR.i && LECTEUR.shown) return;
  // back = on revient en arrière (le texte entre alors dans l'autre sens)
  const back = i < LECTEUR.i;
  LECTEUR.i = i;
  LECTEUR.shown = true;
  // f = l'écran à afficher ; P = le lecteur
  const f = LECTEUR.frames[i],
    P = document.getElementById("player");
  // repère posé sur <body> dès qu'un écran a été montré
  // (aucune feuille de style ne l'utilise pour l'instant)
  document.body.classList.add("pl-seen");
  // le type d'écran et le fond sombre pilotent la mise en page en CSS
  P.dataset.type = f.type;
  P.classList.toggle("dark", !!f.dark || f.type === "lab");
  // En-tête : un segment par écran du chapitre en cours.
  // same = liste de paires [écran, numéro] des écrans du même chapitre
  const same = LECTEUR.frames.map((g, k) => [g, k]).filter(([g]) => g.ch === f.ch);
  const segs = P.querySelector(".pv-segs");
  // segment "done" = déjà vu, "on" = écran actuel, sans classe = à venir
  segs.innerHTML = same
    .map(([g, k]) => `<i class="${k < i ? "done" : k === i ? "on" : ""}"></i>`)
    .join("");
  P.querySelector(".pv-meta b").textContent = f.ch;
  P.querySelector(".pv-meta em").textContent = f.sub || "";
  // compteur « 2 / 5 » : rang de l'écran dans son chapitre
  P.querySelector(".pv-meta span").textContent =
    same.findIndex(([, k]) => k === i) + 1 + " / " + same.length;
  // Le texte : l'ancien s'efface, le nouveau monte ligne par ligne.
  // host = l'endroit qui reçoit le texte : le tiroir du bas (pv-sheet) quand une carte
  // reste visible derrière, sinon la pleine page (pv-page)
  const host =
    f.type === "map" || f.type === "lab" || f.type === "hero"
      ? P.querySelector(".pv-sheet")
      : P.querySelector(".pv-page");
  // tous les anciens textes sortent, et sont retirés après 260 ms,
  // le temps de leur animation de sortie
  P.querySelectorAll(".pv-in").forEach((o) => {
    o.classList.add("out");
    setTimeout(() => o.remove(), 260);
  });
  // n = le nouveau bloc de texte ; la consigne « Fais défiler » devient « Avance »
  const n = document.createElement("div");
  n.className = "pv-in" + (back ? " back" : "");
  n.innerHTML = f.html.replace(/Fais défiler/g, "Avance");
  // --k = rang de chaque ligne : le CSS décale leur apparition l'une après l'autre
  [...n.children].forEach((c, k) => c.style.setProperty("--k", k));
  host.appendChild(n);
  // on cache celui des deux emplacements de texte qui n'est pas utilisé
  P.querySelector(".pv-sheet").classList.toggle("off", host !== P.querySelector(".pv-sheet"));
  P.querySelector(".pv-page").classList.toggle("off", host !== P.querySelector(".pv-page"));
  // La hauteur du texte fixe la bande où la carte se cadre (voir bandeLibre, 03-villes.js).
  // --sheet = hauteur du tiroir plus 12 px de marge
  if (host === P.querySelector(".pv-sheet")) {
    LECTEUR.sheet = n.offsetHeight;
    P.style.setProperty("--sheet", n.offsetHeight + 12 + "px");
  }
  // La scène derrière le texte.
  // LECTEUR.pac = numéro de l'étape du Pacifique à montrer (null hors Pacifique)
  if (f.type === "map") {
    LECTEUR.pac = f.scene.kind === "pac" ? f.scene.i : null;
    allerVers(f.scene);
  } else if (f.type === "hero") {
    // l'ouverture montre Hiroshima avant la bombe
    LECTEUR.pac = null;
    allerVers({ kind: "city", city: "hiro", after: false });
  }
  // coulisses SIG : on montre la couche de l'étape
  if (f.type === "lab") choisirCouche(f.l);
  // mini-carte : le Pacifique entier, le Japon ou la France selon le chapitre
  const sc = f.type === "map" ? f.scene : null;
  if (sc && sc.kind === "pac") {
    afficherMiniCarte("pac");
    if (camera) miniCartePacifique(camera);
  } else if (sc && sc.kind === "city") {
    afficherMiniCarte("city");
    miniCarteVille(sc.city);
  } else afficherMiniCarte(null);
  // à l'image suivante (une fois la mise en page faite), on replace boutons et étiquettes
  requestAnimationFrame(() => {
    majInterface();
    placerEtiquettes();
  });
}
