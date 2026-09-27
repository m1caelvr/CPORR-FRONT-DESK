

export function initConnection() {
(() => {
  const status = document.getElementById("connectionStatus");
  let activeRequest = null;

  function setStatus(state) {
    status.dataset.state = state;

    status.textContent = {
      online: "Online",
      connecting: "Conectando...",
      offline: "Offline",
    }[state];
  }

  function markOffline() {
    const request = activeRequest;
    activeRequest = null;
    request?.abort();
    setStatus("offline");
  }

  async function checkConnection() {
    if (!navigator.onLine) {
      markOffline();
      return;
    }

    // Ao abrir o HTML diretamente, usa o estado informado pelo navegador.
    if (location.protocol === "file:") {
      setStatus("online");
      return;
    }

    if (activeRequest) return;

    // Evita piscar "Conectando" em cada verificação quando já está online.
    if (status.dataset.state !== "online") {
      setStatus("connecting");
    }

    const controller = new AbortController();
    activeRequest = controller;

    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const url = new URL("./index.html", location.href);
      url.searchParams.set("_connection", Date.now());

      const response = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });

      // Ignora respostas de uma verificação cancelada.
      if (activeRequest !== controller) return;

      setStatus(
        response.ok && navigator.onLine
          ? "online"
          : "offline"
      );
    } catch {
      if (activeRequest === controller) {
        setStatus("offline");
      }
    } finally {
      clearTimeout(timeout);

      if (activeRequest === controller) {
        activeRequest = null;
      }
    }
  }

  window.addEventListener("online", checkConnection);
  window.addEventListener("offline", markOffline);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkConnection();
  });

  setInterval(() => {
    if (!document.hidden) checkConnection();
  }, 10000);

  checkConnection();
})();

}
