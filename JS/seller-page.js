(async function () {
    let reelObserver = null;
    const viewedReelKeys = new Set();
    const reelModal = document.getElementById("reelFullscreenModal");
    const reelModalWrap = document.getElementById("reelFullscreenFrameWrap");
    const reelModalClose = document.getElementById("reelFullscreenCloseBtn");

    function socialAnchor(url, label) {
        const safe = String(url || "").trim();
        if (!safe) return "";
        return `<a href="${safe}" class="social-badge-link" target="_blank" rel="noopener">${label}</a>`;
    }

    function getAutoplayEmbedUrl(parsed) {
        if (!parsed?.embedUrl) return "";
        try {
            const url = new URL(parsed.embedUrl);
            if (parsed.platform === "tiktok") {
                url.searchParams.set("autoplay", "1");
                url.searchParams.set("muted", "1");
            } else if (parsed.platform === "instagram") {
                url.searchParams.set("autoplay", "1");
            }
            return url.toString();
        } catch (_) {
            return parsed.embedUrl;
        }
    }

    function openReelModal(src, title) {
        if (!reelModal || !reelModalWrap) return;
        reelModalWrap.innerHTML = `<iframe src="${src}" title="${title}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
        reelModal.style.display = "block";
        reelModal.setAttribute("aria-hidden", "false");
    }

    function closeReelModal() {
        if (!reelModal || !reelModalWrap) return;
        reelModalWrap.innerHTML = "";
        reelModal.style.display = "none";
        reelModal.setAttribute("aria-hidden", "true");
    }

    function setupReelObserver(feed) {
        if (!feed) return;
        if (reelObserver) reelObserver.disconnect();
        reelObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const card = entry.target;
                const iframe = card.querySelector("iframe[data-src]");
                const skeleton = card.querySelector(".reel-skeleton");
                const sellerId = card.dataset.sellerId || "";
                const reelId = card.dataset.reelId || "";
                const key = `${sellerId}:${reelId}`;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                    if (iframe && iframe.src !== iframe.dataset.src) iframe.src = iframe.dataset.src;
                    if (!viewedReelKeys.has(key) && sellerId && reelId) {
                        viewedReelKeys.add(key);
                        Api.trackSellerReelView(sellerId, reelId).catch(() => {});
                    }
                } else if (iframe && iframe.src && iframe.src !== "about:blank") {
                    iframe.src = "about:blank";
                    if (skeleton) skeleton.style.display = "block";
                }
            });
        }, { threshold: [0.55] });

        feed.querySelectorAll(".reel-card[data-reel-id]").forEach((card) => {
            const iframe = card.querySelector("iframe[data-src]");
            const skeleton = card.querySelector(".reel-skeleton");
            if (iframe && skeleton) {
                iframe.addEventListener("load", () => {
                    if (iframe.src && iframe.src !== "about:blank") skeleton.style.display = "none";
                });
            }
            reelObserver.observe(card);
        });
    }

    function renderSellerHeader(seller) {
        const box = document.getElementById("sellerBox");
        if (!box) return;
        
        let logoHtml = "";
        if (seller?.logo) {
            logoHtml = `<img src="${seller.logo}" class="seller-profile-logo" alt="${seller.name || 'Seller'} logo">`;
        } else {
            const firstLetter = (seller?.name || "S").charAt(0).toUpperCase();
            logoHtml = `<div class="seller-profile-avatar-placeholder">${firstLetter}</div>`;
        }

        const socials = [
            socialAnchor(seller?.socials?.instagram, "Instagram"),
            socialAnchor(seller?.socials?.facebook, "Facebook"),
            socialAnchor(seller?.socials?.tiktok, "TikTok"),
            socialAnchor(seller?.socials?.website, "Website")
        ].filter(Boolean).join("");

        box.innerHTML = `
            <div class="seller-profile-layout">
                <div class="seller-profile-logo-wrap">
                    ${logoHtml}
                </div>
                <div class="seller-profile-info">
                    <h1>${seller?.name || "Seller"}</h1>
                    <p class="description">${seller?.description || "No description available."}</p>
                    <div class="seller-profile-socials">${socials}</div>
                </div>
            </div>
        `;
    }

    function renderProducts(products) {
        const grid = document.getElementById("sellerProducts");
        const empty = document.getElementById("emptySellerProducts");
        if (!grid) return;
        grid.innerHTML = (products || []).map((p) => `
            <article class="product-card">
                <a href="/product?id=${p._id || p.id}" class="product-image-link">
                    <img src="${p.images?.[0] || ''}" alt="${p.name}">
                </a>
                <div class="card-info">
                    <h3>${p.name}</h3>
                    <p>${p.price} EGP</p>
                </div>
            </article>
        `).join("");
        if (empty) empty.style.display = products?.length ? "none" : "block";
    }

    function renderSellerReels(seller, products) {
        const section = document.getElementById("sellerReelsSection");
        const feed = document.getElementById("sellerReelsFeed");
        const empty = document.getElementById("emptySellerReels");
        if (!section || !feed || !empty) return;

        const productMap = new Map((products || []).map((p) => [String(p._id || p.id), p]));
        const reels = Array.isArray(seller?.reels) ? seller.reels : [];

        const cards = reels.map((reel) => {
            const product = productMap.get(String(reel.productId || ""));
            if (!product) return "";
            const parsed = typeof getReelEmbedInfo === "function" ? getReelEmbedInfo(reel?.reelUrl, reel?.platform) : null;
            const sellerId = String(seller?._id || seller?.id || "");
            const reelId = String(reel.reelId || "");
            if (!parsed || parsed.error || !parsed.embedUrl) {
                return `
                    <article class="reel-card reel-fallback-card" data-seller-id="${sellerId}" data-reel-id="${reelId}">
                        <div class="reel-meta">
                            <h3>${product.name}</h3>
                            <p>Embed preview not available.</p>
                        </div>
                        <div class="reel-fallback-actions">
                            <a class="btn btn-secondary" href="${reel?.reelUrl || '#'}" target="_blank" rel="noopener">Open Reel</a>
                            <a class="btn btn-primary reel-product-link" data-seller-id="${sellerId}" data-reel-id="${reelId}" href="/product?id=${product._id || product.id}">Shop Product</a>
                        </div>
                    </article>
                `;
            }
            const embedUrl = getAutoplayEmbedUrl(parsed);
            return `
                <article class="reel-card" data-seller-id="${sellerId}" data-reel-id="${reelId}">
                    <div class="reel-frame">
                        <div class="reel-skeleton" style="background-image:url('${product.images?.[0] || ""}');background-size:cover;background-position:center;"></div>
                        <iframe
                            src="about:blank"
                            data-src="${embedUrl}"
                            title="${product.name} reel"
                            loading="lazy"
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowfullscreen
                            referrerpolicy="strict-origin-when-cross-origin"
                        ></iframe>
                        <button class="reel-fullscreen-btn" type="button" data-fullscreen-src="${embedUrl}" data-fullscreen-title="${product.name} reel">Full</button>
                        <a class="reel-product-link" data-seller-id="${sellerId}" data-reel-id="${reelId}" href="/product?id=${product._id || product.id}">Shop ${product.name}</a>
                    </div>
                    <div class="reel-meta">
                        <h3>${product.name}</h3>
                        <p>${product.price} EGP</p>
                    </div>
                </article>
            `;
        }).filter(Boolean);

        if (!cards.length) {
            section.style.display = "none";
            empty.style.display = "block";
            feed.innerHTML = "";
            return;
        }
        section.style.display = "block";
        empty.style.display = "none";
        feed.innerHTML = cards.join("");
        setupReelObserver(feed);
    }

    document.addEventListener("click", (e) => {
        const fullscreenBtn = e.target.closest(".reel-fullscreen-btn");
        if (fullscreenBtn) {
            openReelModal(fullscreenBtn.dataset.fullscreenSrc || "", fullscreenBtn.dataset.fullscreenTitle || "Reel");
            return;
        }
        if (e.target.closest("[data-close-reel-modal='1']") || e.target === reelModalClose) {
            closeReelModal();
            return;
        }
        const productLink = e.target.closest(".reel-product-link[data-seller-id][data-reel-id]");
        if (productLink) {
            const sellerId = String(productLink.dataset.sellerId || "");
            const reelId = String(productLink.dataset.reelId || "");
            if (sellerId && reelId) Api.trackSellerReelClick(sellerId, reelId).catch(() => {});
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeReelModal();
    });

    try {
        const sellerId = new URLSearchParams(location.search).get("sellerId");
        if (!sellerId) throw new Error("Missing sellerId");
        const seller = await Api.getSeller(sellerId);
        const productRes = await Api.getProducts({ sellerId, page: 1, limit: 200 });
        const products = productRes.items || [];
        renderSellerHeader(seller);
        renderSellerReels(seller, products);
        renderProducts(products);
    } catch (err) {
        alert(err?.message || "Failed to load seller page.");
    }
})();
