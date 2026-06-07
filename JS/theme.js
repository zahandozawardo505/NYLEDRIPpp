(function () {
    const body = document.body;
    const toggle = document.getElementById("themeToggle");
    body.setAttribute("data-theme", Store.get("nyledrip_theme", "light"));
    toggle?.addEventListener("click", () => {
        const next = body.getAttribute("data-theme") === "dark" ? "light" : "dark";
        body.setAttribute("data-theme", next);
        Store.set("nyledrip_theme", next);
    });
    const hamburger = document.getElementById("hamburger");
    const menu = document.getElementById("navbarMenu");
    if (hamburger && menu) {
        hamburger.addEventListener("click", () => {
            const isOpen = menu.classList.toggle("active");
            hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });
        menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
            menu.classList.remove("active");
            hamburger.setAttribute("aria-expanded", "false");
        }));
        document.addEventListener("click", (event) => {
            if (!menu.classList.contains("active")) return;
            if (menu.contains(event.target) || hamburger.contains(event.target)) return;
            menu.classList.remove("active");
            hamburger.setAttribute("aria-expanded", "false");
        });
    }
    if (typeof updateNavbarBadges === "function") updateNavbarBadges();
    window.addEventListener("db:changed", () => typeof updateNavbarBadges === "function" && updateNavbarBadges());
})();
