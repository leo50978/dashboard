(function () {
  const NAV_ID = "kobposhV2DashboardNav";
  const STYLE_ID = "kobposhV2DashboardNavStyle";
  const currentPath = (() => {
    const pathname = String(window.location?.pathname || "");
    const last = pathname.split("/").filter(Boolean).pop() || "index.html";
    return last.toLowerCase();
  })();

  const items = [
    { href: "./index.html", label: "Accueil", match: ["index.html", ""] },
    { href: "./Dhero.html", label: "Hero", match: ["dhero.html"] },
    { href: "./Dwhatsapp.html", label: "WhatsApp", match: ["dwhatsapp.html"] },
    { href: "./Dacquisition.html", label: "Clients", match: ["dacquisition.html"] },
    { href: "./Dclient-reset.html", label: "Reset client", match: ["dclient-reset.html"] },
    { href: "./Dclient-review.html", label: "Revue client", match: ["dclient-review.html"] },
    { href: "./Dclient-unfreeze.html", label: "Debloquer compte", match: ["dclient-unfreeze.html"] },
    { href: "./Dpassword-recovery.html", label: "Mot de passe", match: ["dpassword-recovery.html"] },
    {
      href: "./Dwithdrawals.html",
      label: "Retraits",
      match: [
        "dwithdrawals.html",
        "dwithdrawals-pending.html",
        "dwithdrawals-approved.html",
        "dwithdrawals-rejected.html",
      ],
    },
    { href: "./Ddepositflow.html", label: "Flux depots", match: ["ddepositflow.html"] },
    { href: "./Dsite-visits.html", label: "Visites site", match: ["dsite-visits.html"] },
    { href: "./Dtransfers.html", label: "Transferts", match: ["dtransfers.html"] },
    { href: "./Dgames-volume.html", label: "Volume jeux", match: ["dgames-volume.html"] },
    { href: "./Dgame-availability.html", label: "Dispo jeux", match: ["dgame-availability.html"] },
    { href: "./Dai-advisor.html", label: "Conseiller IA", match: ["dai-advisor.html"] },
    { href: "./Dmorpion.html", label: "Analytics Morpion", match: ["dmorpion.html"] },
    { href: "./pilotagebot-pong.html", label: "Pilotage Pong", match: ["pilotagebot-pong.html"] },
    { href: "./pilotagebot-domino-classique.html", label: "Pilotage Domino", match: ["pilotagebot-domino-classique.html"] },
    { href: "./Dagentdeposit.html", label: "Depot agent", match: ["dagentdeposit.html"] },
    { href: "./Dpayment.html", label: "Methodes depot", match: ["dpayment.html"] },
    { href: "./Dorders-pending.html", label: "Depots attente", match: ["dorders-pending.html"] },
    { href: "./Dorders-approved.html", label: "Depots approuves", match: ["dorders-approved.html"] },
  ];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.kobposh-v2-dashboard-shell {
        padding-top: 88px;
      }
      #${NAV_ID} {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 7000;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        background: rgba(6, 12, 24, 0.82);
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        box-shadow: 0 20px 40px rgba(2, 8, 20, 0.22);
      }
      #${NAV_ID} .nav-inner {
        max-width: 1280px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 18px;
      }
      #${NAV_ID} .nav-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        color: #f8fbff;
        text-decoration: none;
      }
      #${NAV_ID} .nav-brand-badge {
        width: 38px;
        height: 38px;
        border-radius: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #1fb6ff, #2bc48a);
        color: #ffffff;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      #${NAV_ID} .nav-brand-text {
        display: flex;
        flex-direction: column;
      }
      #${NAV_ID} .nav-brand-title {
        font-size: 0.98rem;
        font-weight: 800;
        line-height: 1.1;
      }
      #${NAV_ID} .nav-brand-copy {
        font-size: 0.72rem;
        line-height: 1.2;
        color: rgba(191, 219, 254, 0.82);
      }
      #${NAV_ID} .nav-links {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      #${NAV_ID} .nav-links::-webkit-scrollbar {
        display: none;
      }
      #${NAV_ID} .nav-link {
        flex: 0 0 auto;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        padding: 10px 14px;
        color: rgba(226, 232, 240, 0.9);
        text-decoration: none;
        font-size: 0.88rem;
        font-weight: 700;
        transition: 160ms ease;
        background: rgba(255, 255, 255, 0.03);
      }
      #${NAV_ID} .nav-link:hover {
        transform: translateY(-1px);
        border-color: rgba(96, 165, 250, 0.38);
        color: #ffffff;
      }
      #${NAV_ID} .nav-link.is-active {
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.24), rgba(43, 196, 138, 0.22));
        border-color: rgba(96, 165, 250, 0.44);
        color: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
      }
      @media (max-width: 860px) {
        body.kobposh-v2-dashboard-shell {
          padding-top: 118px;
        }
        #${NAV_ID} .nav-inner {
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderNav() {
    if (!document.body || document.getElementById(NAV_ID)) return;
    ensureStyle();
    const nav = document.createElement("nav");
    nav.id = NAV_ID;
    nav.setAttribute("aria-label", "Navigation dashboard Kobposh V2");

    const linksHtml = items
      .map((item) => {
        const active = Array.isArray(item.match) && item.match.includes(currentPath) ? " is-active" : "";
        return `<a class="nav-link${active}" href="${item.href}">${item.label}</a>`;
      })
      .join("");

    nav.innerHTML = `
      <div class="nav-inner">
        <a class="nav-brand" href="./index.html">
          <span class="nav-brand-badge">KV</span>
          <span class="nav-brand-text">
            <span class="nav-brand-title">Kobposh V2</span>
            <span class="nav-brand-copy">Dashboard admin relie a la nouvelle base</span>
          </span>
        </a>
        <div class="nav-links">${linksHtml}</div>
      </div>
    `;

    document.body.classList.add("kobposh-v2-dashboard-shell");
    document.body.prepend(nav);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNav, { once: true });
  } else {
    renderNav();
  }
})();



