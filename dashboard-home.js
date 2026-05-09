import { auth } from "./auth.js";
import { ensureFinanceDashboardSession } from "./dashboard-admin-auth.js";
import "./dashboard-nav-bubble.js";

const sessionLabelEl = document.getElementById("dashboardHubSessionLabel");
const sessionCopyEl = document.getElementById("dashboardHubSessionCopy");

function setSessionState(title = "", copy = "", isError = false) {
  if (sessionLabelEl) {
    sessionLabelEl.textContent = String(title || "");
    sessionLabelEl.style.color = isError ? "#fecaca" : "#edf7ff";
  }
  if (sessionCopyEl) {
    sessionCopyEl.textContent = String(copy || "");
    sessionCopyEl.style.color = isError ? "#fecaca" : "#a6bfd3";
  }
}

async function bootDashboardHome() {
  setSessionState(
    "Verification de session admin...",
    "Le dashboard verifie d'abord que tu utilises bien le compte admin autorise."
  );

  try {
    const user = await ensureFinanceDashboardSession({
      title: "Kobposh V2 Dashboard Hub",
      description: "Connecte-toi avec le compte admin autorise pour acceder a l'accueil central du dashboard V2.",
    });
    const email = String(user?.email || auth.currentUser?.email || "").trim();
    setSessionState(
      email ? `Session active: ${email}` : "Session admin active",
      "Tu peux maintenant utiliser cette page comme point d'entree pour toutes les pages du dashboard V2."
    );
  } catch (error) {
    console.warn("[DASHBOARD_HOME] auth failed", error);
    setSessionState(
      "Acces admin refuse",
      error?.message || "Impossible de verifier la session admin du dashboard.",
      true
    );
  }
}

void bootDashboardHome();
