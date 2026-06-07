document.addEventListener("DOMContentLoaded", async () => {
    const currentUser = (typeof DB !== "undefined" && DB.getCurrentUser) ? DB.getCurrentUser() : null;
    if (currentUser?.role === "seller") {
        const path = window.location.pathname.toLowerCase();
        const onSellerPage = path.endsWith("//seller-dashboard") || path.endsWith("/seller-dashboard");
        if (!onSellerPage) {
            window.location.href = getPagePath("/seller-dashboard");
            return;
        }
    }
    if (typeof updateNavbarAuth === "function") updateNavbarAuth();
    if (typeof updateNavbarBadges === "function") updateNavbarBadges();
    if (window.NILEDRIP_I18N?.apply) window.NILEDRIP_I18N.apply(document);
    if (typeof DB !== "undefined" && typeof DB.syncUserStateFromBackend === "function") {
        DB.syncUserStateFromBackend();
    }

    if (typeof Api !== "undefined" && Api.getPublicSettings) {
        Api.getPublicSettings().then(settings => {
            const heroContainer = document.getElementById("heroMediaContainer");
            const type = String(settings?.heroBackgroundType || "default");
            let source = String(settings?.heroBackgroundUrl || "").trim();
            if (heroContainer && source && (type === "image" || type === "video")) {
                // Resolve relative URLs against the API origin
                if (source.startsWith("/") && !source.startsWith("//")) {
                    try {
                        const apiOrigin = new URL(Api.baseUrl, window.location.origin).origin;
                        source = `${apiOrigin}${source}`;
                    } catch { /* keep as-is */ }
                }
                heroContainer.innerHTML = "";
                if (type === "image") {
                    const image = document.createElement("img");
                    image.src = source;
                    image.className = "hero-video";
                    image.alt = "NYLEDRIP hero background";
                    heroContainer.appendChild(image);
                } else {
                    const video = document.createElement("video");
                    video.className = "hero-video";
                    video.autoplay = true;
                    video.loop = true;
                    video.muted = true;
                    video.playsInline = true;
                    video.src = source;
                    heroContainer.appendChild(video);
                    video.play().catch(() => {});
                }
            }
        }).catch(err => console.error("Failed to load public settings", err));
    }

    // Newsletter Logic
    const newsletterModal = document.getElementById("newsletterModal");
    if (newsletterModal && !localStorage.getItem("newsletter_seen")) {
        setTimeout(() => {
            newsletterModal.style.display = "flex";
        }, 5000);

        document.getElementById("closeNewsletterBtn")?.addEventListener("click", () => {
            newsletterModal.style.display = "none";
            localStorage.setItem("newsletter_seen", "true");
        });

        document.getElementById("newsletterForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            newsletterModal.style.display = "none";
            localStorage.setItem("newsletter_seen", "true");
            if (typeof showToast === "function") showToast("Welcome to the Club! Check your email for your 10% off code.", "success");
        });
    }

    const featuredGrid = document.getElementById("featuredGrid");
    if (featuredGrid && typeof Api !== "undefined") {
        featuredGrid.innerHTML = Array.from({ length: 4 }).map(() => `
            <article class="product-card">
                <div class="product-image-link" style="background:var(--bg-secondary)"></div>
                <div class="card-info"><h3>Loading...</h3><p>--</p></div>
            </article>
        `).join("");
        try {
            const productsRes = await Api.getProducts({ page: 1, limit: 8, sortBy: "newest" });
            const sellersRes = await Api.getSellers({ page: 1, limit: 200 });
            const products = productsRes.items || [];
            const sellers = sellersRes.items || [];
            if (!products.length) {
                featuredGrid.innerHTML = `<p class="no-products">No products available yet.</p>`;
            } else {
                featuredGrid.innerHTML = products.map((p) => {
                    const seller = sellers.find((s) => String(s._id || s.id) === String(p.sellerId));
                    const totalStock = (p.variants || []).reduce((sum, c) => sum + (c.sizes || []).reduce((s, z) => s + Number(z.stock || 0), 0), 0);
                    return `<article class="product-card">
                        <a href="${getPagePath(`/product?id=${p._id || p.id}`)}" class="product-image-link">
                            <img src="${p.images?.[0] || ""}" alt="${p.name}">
                            ${totalStock <= 0 ? `<span class="stock-badge-soldout">Sold Out</span>` : ""}
                        </a>
                        <div class="card-info">
                            <div class="product-brand-line">
                                <a href="${getPagePath(`/seller?sellerId=${p.sellerId}`)}" class="product-brand-link">${p.sellerName || seller?.name || "Independent"}</a>
                            </div>
                            <h3 class="product-title-line"><a href="${getPagePath(`/product?id=${p._id || p.id}`)}">${p.name}</a></h3>
                            <p class="product-price-line">${p.price} EGP</p>
                            <div class="product-hover-actions">
                                <a href="${getPagePath(`/product?id=${p._id || p.id}`)}" class="btn btn-primary shop-add-cart">View Product</a>
                            </div>
                        </div>
                    </article>`;
                }).join("");
            }
        } catch {
            featuredGrid.innerHTML = `<p class="no-products">Unable to load featured products.</p>`;
        }
        if (window.NILEDRIP_I18N?.apply) window.NILEDRIP_I18N.apply(featuredGrid);
    }

    const joinBtn = document.getElementById("newsJoinBtn");
    const newsEmail = document.getElementById("newsEmail");
    if (joinBtn && newsEmail) {
        joinBtn.addEventListener("click", () => {
            const email = String(newsEmail.value || "").trim().toLowerCase();
            if (!validateEmail(email)) return showToast("Please enter a valid email.", "error");
            showToast("Thanks for joining the NYLEDRIP newsletter.", "success");
            newsEmail.value = "";
        });
    }

    const globalSearch = document.getElementById("globalSearch");
    if (globalSearch) {
        globalSearch.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const q = String(globalSearch.value || "").trim();
                if (q) {
                    window.location.href = getPagePath(`/shop?q=${encodeURIComponent(q)}`);
                }
            }
        });
    }
});
