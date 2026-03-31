(function () {
  const NAV_ID = "dlkDashboardNav";
  const STYLE_ID = "dlkDashboardNavStyle";
  const SW_URL = "./sw.js";
  const currentPath = (() => {
    const pathname = String(window.location?.pathname || "");
    const last = pathname.split("/").filter(Boolean).pop() || "index.html";
    return last.toLowerCase();
  })();

  const items = [
    { href: "./index.html", label: "Accueil", key: "index.html" },
    { href: "./Dpayment.html", label: "Paiements", key: "dpayment.html" },
    { href: "./Dagentdeposit.html", label: "Depot agent", key: "dagentdeposit.html" },
    { href: "./Ddepositflow.html", label: "Flux depots", key: "ddepositflow.html" },
    { href: "./pilotagebot.html", label: "Pilotage bots", key: "pilotagebot.html" },
    { href: "./Dacquisition.html", label: "Acquisition", key: "dacquisition.html" },
    { href: "./sondage.html", label: "Sondages", key: "sondage.html" },
    { href: "./Danalytics.html", label: "Analytics", key: "danalytics.html" },
    { href: "./Dduel.html", label: "Duel 2 joueurs", key: "dduel.html" },
    { href: "./Drecrutement.html", label: "Recrutement", key: "drecrutement.html" },
    { href: "./Ddiscussion.html", label: "Discussion", key: "ddiscussion.html" },
    { href: "./ambassader.html", label: "Ambassadeur", key: "ambassader.html" },
    { href: "./createambassadeur.html", label: "Créer", key: "createambassadeur.html" },
  ];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.dlk-dashboard-shell {
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
      #${NAV_ID} .dlk-dashboard-nav-inner {
        max-width: 1280px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 18px;
      }
      #${NAV_ID} .dlk-dashboard-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        color: #f8fbff;
        text-decoration: none;
      }
      #${NAV_ID} .dlk-dashboard-brand-badge {
        width: 38px;
        height: 38px;
        border-radius: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #1fb6ff, #8b5cf6);
        color: #ffffff;
        font-weight: 800;
        letter-spacing: 0.08em;
        box-shadow: 0 14px 28px rgba(56, 189, 248, 0.28);
      }
      #${NAV_ID} .dlk-dashboard-brand-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      #${NAV_ID} .dlk-dashboard-brand-title {
        font-size: 0.98rem;
        font-weight: 800;
        line-height: 1.1;
      }
      #${NAV_ID} .dlk-dashboard-brand-copy {
        font-size: 0.72rem;
        line-height: 1.2;
        color: rgba(191, 219, 254, 0.82);
      }
      #${NAV_ID} .dlk-dashboard-links {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      #${NAV_ID} .dlk-dashboard-links::-webkit-scrollbar {
        display: none;
      }
      #${NAV_ID} .dlk-dashboard-link {
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
      #${NAV_ID} .dlk-dashboard-link:hover {
        transform: translateY(-1px);
        border-color: rgba(96, 165, 250, 0.38);
        color: #ffffff;
      }
      #${NAV_ID} .dlk-dashboard-link.is-active {
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.24), rgba(139, 92, 246, 0.22));
        border-color: rgba(96, 165, 250, 0.44);
        color: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
      }
      @media (max-width: 860px) {
        body.dlk-dashboard-shell {
          padding-top: 118px;
        }
        #${NAV_ID} .dlk-dashboard-nav-inner {
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
    nav.setAttribute("aria-label", "Navigation dashboards");

    const linksHtml = items
      .map((item) => {
        const active = currentPath === item.key ? " is-active" : "";
        return `<a class="dlk-dashboard-link${active}" href="${item.href}">${item.label}</a>`;
      })
      .join("");

    nav.innerHTML = `
      <div class="dlk-dashboard-nav-inner">
        <a class="dlk-dashboard-brand" href="./index.html">
          <span class="dlk-dashboard-brand-badge">DL</span>
          <span class="dlk-dashboard-brand-text">
            <span class="dlk-dashboard-brand-title">Dashboard Hub</span>
            <span class="dlk-dashboard-brand-copy">Package autonome des dashboards Dominoes Lakay</span>
          </span>
        </a>
        <div class="dlk-dashboard-links">${linksHtml}</div>
      </div>
    `;

    document.body.classList.add("dlk-dashboard-shell");
    document.body.prepend(nav);
  }

  async function registerDashboardServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register(SW_URL, { scope: "./" });
    } catch (error) {
      console.warn("[DASHBOARD_PWA] service worker dashboard indisponible", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      renderNav();
      void registerDashboardServiceWorker();
    }, { once: true });
  } else {
    renderNav();
    void registerDashboardServiceWorker();
  }
})();
