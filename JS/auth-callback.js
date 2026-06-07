(async function () {
  const statusEl = document.getElementById("authCallbackStatus");
  const params = new URLSearchParams(window.location.search);
  const token = String(params.get("token") || "");
  const next = String(params.get("next") || "/shop");

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  try {
    if (!token) throw new Error("Google login did not return a session token.");

    Api.setToken(token);

    const user = await Api.getCurrentUser();
    DB.setCurrentUser(user);

    window.location.href = typeof getPagePath === "function" ? getPagePath(next) : next;
  } catch (err) {
    Api.setToken("");
    setStatus(err?.message || "Google login failed. Please try again.");
    setTimeout(() => {
      window.location.href = "/login";
    }, 1800);
  }
})();
