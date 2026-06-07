(function () {
    let remoteProducts = [];
    let remoteSellers = [];
    let linkedReels = [];
    let activeView = "products";
    let activeReelsPlatform = "all";
    let productPagination = { page: 1, totalPages: 1 };
    const reelProductMap = new Map();
    const viewedReelKeys = new Set();
    let reelObserver = null;
    const PAGE_SIZE = 12;
    let currentProductPage = 1;

    const shopLayout = document.getElementById("shopLayout");
    const viewSwitch = document.getElementById("shopViewSwitch");
    const filterDrawerToggle = document.getElementById("filterDrawerToggle");
    const filterDrawerPanel = document.getElementById("filterDrawerPanel");
    const productsView = document.getElementById("productsView");
    const reelsView = document.getElementById("reelsView");
    const reelsPlatformSwitch = document.getElementById("reelsPlatformSwitch");

    const grid = document.getElementById("productsGrid");
    const noProducts = document.getElementById("noProducts");
    const countEl = document.getElementById("productCount");
    const sortEl = document.getElementById("sortBy");
    const priceMinRange = document.getElementById("priceMinRange");
    const priceMaxRange = document.getElementById("priceMaxRange");
    const priceMinValue = document.getElementById("priceMinValue");
    const priceMaxValue = document.getElementById("priceMaxValue");
    const resetBtn = document.getElementById("resetFilters");
    const searchInput = document.getElementById("globalSearch");
    const suggestionsBox = document.getElementById("searchSuggestions");
    const pagerEl = document.getElementById("shopPagination");
    const sellerFiltersWrap = document.getElementById("sellerFilters");
    const sizeFiltersWrap = document.getElementById("sizeFilters");
    const colorFiltersWrap = document.getElementById("colorFilters");
    const availableOnlyEl = document.getElementById("availableOnly");
    const productCountInlineEl = document.getElementById("productCountInline");

    const reelsFeed = document.getElementById("shopReelsFeed");
    const reelsEmpty = document.getElementById("shopReelsEmpty");
    const reelModal = document.getElementById("reelFullscreenModal");
    const reelModalWrap = document.getElementById("reelFullscreenFrameWrap");
    const reelModalClose = document.getElementById("reelFullscreenCloseBtn");
    const quickViewModal = document.getElementById("quickViewModal");
    const quickViewCloseBtn = document.getElementById("quickViewCloseBtn");
    const quickViewContent = document.getElementById("quickViewContent");

    const BOTTOMS_GROUP = ["Pants", "Trousers", "Jeans", "Sweatpants", "Shorts"];
    const CLOTHING_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];
    const SHOE_SIZE_ORDER = ["37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];
    const CATEGORY_ALIAS = {
        hoodies: "Hoodies & Sweatshirts",
        tees: "Tops",
        sweatpants: "Bottoms",
        accessories: "Accessories",
        jackets: "Jackets",
        shoes: "Shoes",
        tops: "Tops",
        bottoms: "Bottoms"
    };

    const safeText = (value) => typeof escapeHTML === "function" ? escapeHTML(value) : String(value || "");
    const safeAttr = (value) => typeof escapeAttr === "function" ? escapeAttr(value) : safeText(value);
    const productIdOf = (product) => String(product?._id || product?.id || "");
    const normalizeSize = (size) => String(size || "").trim().toUpperCase();

    function sortSizesByOrder(sizes, order) {
        return [...sizes].sort((a, b) => {
            const ai = order.indexOf(normalizeSize(a));
            const bi = order.indexOf(normalizeSize(b));
            if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
        });
    }

    function renderSizeChip(size) {
        return `
            <label class="size-chip">
                <input type="checkbox" class="size-filter" value="${safeAttr(size)}">
                <span class="size-chip-text">${safeText(size)}</span>
            </label>
        `;
    }

    function renderSizeGroup(title, sizes) {
        if (!sizes.length) return "";
        return `
            <div class="size-filter-section">
                <div class="size-filter-label">${safeText(title)}</div>
                <div class="size-chip-grid">${sizes.map(renderSizeChip).join("")}</div>
            </div>
        `;
    }

    function applyUrlFilters() {
        const params = new URLSearchParams(window.location.search);
        const rawCategory = String(params.get("category") || "").trim().toLowerCase();
        const rawSub = String(params.get("subcategory") || "").trim();
        const rawGender = String(params.get("gender") || "").trim();
        const q = String(params.get("q") || "").trim();

        const mappedCategory = CATEGORY_ALIAS[rawCategory] || "";
        if (mappedCategory) {
            const catCb = [...document.querySelectorAll(".category-filter")].find((el) => String(el.value) === mappedCategory);
            if (catCb) catCb.checked = true;
        }
        if (rawSub) {
            const subCb = [...document.querySelectorAll(".subcategory-filter")].find((el) => String(el.value).toLowerCase() === rawSub.toLowerCase());
            if (subCb) subCb.checked = true;
        }
        if (rawGender) {
            const gCb = [...document.querySelectorAll(".gender-filter")].find((el) => String(el.value).toLowerCase() === rawGender.toLowerCase());
            if (gCb) gCb.checked = true;
        }
        if (q && searchInput) searchInput.value = q;
    }

    function getFilters() {
        const genders = [...document.querySelectorAll(".gender-filter:checked")].map((el) => el.value);
        const categories = [...document.querySelectorAll(".category-filter:checked")].map((el) => el.value);
        const subcategories = [...document.querySelectorAll(".subcategory-filter:checked")].map((el) => el.value);
        const minPrice = Number(priceMinRange?.value || 0);
        const maxPrice = Number(priceMaxRange?.value || 100000);
        const sellers = [...document.querySelectorAll(".seller-filter:checked")].map((el) => el.value);
        const sizes = [...document.querySelectorAll(".size-filter:checked")].map((el) => el.value);
        const colors = [...document.querySelectorAll(".color-filter:checked")].map((el) => el.value.toLowerCase());
        const availableOnly = Boolean(availableOnlyEl?.checked);
        return { genders, categories, subcategories, minPrice, maxPrice, sellers, sizes, colors, availableOnly };
    }

    function updateFilterSummaryLabel() {
        if (!filterDrawerToggle) return;
        const activeCount = document.querySelectorAll(
            ".gender-filter:checked, .category-filter:checked, .subcategory-filter:checked, .seller-filter:checked, .size-filter:checked, .color-filter:checked"
        ).length + (availableOnlyEl?.checked ? 1 : 0);

        const iconHtml = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px; vertical-align: middle;">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
        </svg>`;

        const isMobile = window.innerWidth <= 900;
        const isClosed = shopLayout?.classList.contains("filters-closed");
        const label = isMobile ? "Filters" : (isClosed ? "Show Filters" : "Hide Filters");

        filterDrawerToggle.innerHTML = activeCount > 0 ? `${iconHtml} ${label} (${activeCount})` : `${iconHtml} ${label}`;
    }

    function genderMatch(product, selected) {
        if (!selected.length) return true;
        return selected.includes(product.gender) || (product.gender === "Unisex" && (selected.includes("Men") || selected.includes("Women")));
    }

    function subcategoryMatch(product, selected) {
        if (!selected.length) return true;
        if (selected.includes("Pants") || selected.includes("Trousers")) return BOTTOMS_GROUP.includes(product.subcategory);
        return selected.includes(product.subcategory);
    }

    function queryMatch(product, q) {
        if (!q) return true;
        const seller = DB.getSellerById(product.sellerId);
        const blob = [product.name, product.description, product.category, product.subcategory, seller?.name, product.sellerName].join(" ").toLowerCase();
        return blob.includes(q);
    }

    function renderDynamicFilters() {
        if (sellerFiltersWrap) {
            const sellers = [...new Set(remoteProducts.map((p) => String(p.sellerName || "").trim()).filter(Boolean))].sort();
            sellerFiltersWrap.innerHTML = sellers.length
                ? sellers.map((s) => `<label class="filter-checkbox"><input type="checkbox" class="seller-filter" value="${safeAttr(s)}"><span>${safeText(s)}</span></label>`).join("")
                : `<p class="secondary-text">No sellers yet</p>`;
        }
        if (sizeFiltersWrap) {
            const sizes = [...new Set(remoteProducts.flatMap((p) => (p.variants || []).flatMap((v) => (v.sizes || []).map((s) => String(s.size || "")))))]
                .filter(Boolean);
            const clothingSizes = sortSizesByOrder(sizes.filter((size) => CLOTHING_SIZE_ORDER.includes(normalizeSize(size))), CLOTHING_SIZE_ORDER);
            const shoeSizes = sortSizesByOrder(sizes.filter((size) => SHOE_SIZE_ORDER.includes(normalizeSize(size))), SHOE_SIZE_ORDER);
            const otherSizes = sortSizesByOrder(
                sizes.filter((size) => !CLOTHING_SIZE_ORDER.includes(normalizeSize(size)) && !SHOE_SIZE_ORDER.includes(normalizeSize(size))),
                []
            );
            sizeFiltersWrap.innerHTML = sizes.length
                ? `<div class="size-filter-groups">
                    ${renderSizeGroup("Clothing Sizes", clothingSizes)}
                    ${renderSizeGroup("Shoe Sizes", shoeSizes)}
                    ${renderSizeGroup("Other Sizes", otherSizes)}
                </div>`
                : `<p class="secondary-text">No sizes</p>`;
        }
        if (colorFiltersWrap) {
            const colors = [...new Set(remoteProducts.flatMap((p) => (p.variants || []).map((v) => String(v.colorName || ""))))].filter(Boolean);
            colorFiltersWrap.innerHTML = colors.length
                ? colors.map((c) => `<label class="filter-checkbox"><input type="checkbox" class="color-filter" value="${safeAttr(c)}"><span>${safeText(c)}</span></label>`).join("")
                : `<p class="secondary-text">No colors</p>`;
        }
    }

    function stockMeta(product) {
        const allSizes = (product?.variants || []).flatMap((v) => v.sizes || []);
        const total = allSizes.reduce((sum, s) => sum + Number(s.stock || 0), 0);
        return {
            total,
            out: total <= 0,
            low: total > 0 && total <= 5
        };
    }

    function renderSearchSuggestions() {
        if (!searchInput || !suggestionsBox) return;
        const q = String(searchInput.value || "").trim().toLowerCase();
        if (!q) {
            suggestionsBox.style.display = "none";
            suggestionsBox.innerHTML = "";
            return;
        }
        const productHits = remoteProducts
            .filter((p) => String(p.name || "").toLowerCase().includes(q))
            .slice(0, 4)
            .map((p) => ({ type: "product", label: p.name, id: String(p._id || p.id) }));
        const sellerHits = remoteSellers
            .filter((s) => String(s.name || "").toLowerCase().includes(q))
            .slice(0, 3)
            .map((s) => ({ type: "seller", label: s.name, id: String(s._id || s.id) }));
        const hits = [...productHits, ...sellerHits];
        if (!hits.length) {
            suggestionsBox.style.display = "none";
            suggestionsBox.innerHTML = "";
            return;
        }
        suggestionsBox.innerHTML = hits.map((h) => `<button type="button" class="suggestion-item" data-type="${safeAttr(h.type)}" data-id="${safeAttr(h.id)}">${safeText(h.label)}<small>${safeText(h.type)}</small></button>`).join("");
        suggestionsBox.style.display = "block";
    }

    function openQuickView(product) {
        if (!quickViewModal || !quickViewContent || !product) return;
        const meta = stockMeta(product);
        const badge = meta.out ? "Out of stock" : (meta.low ? `Low stock (${meta.total})` : "In stock");
        const pid = productIdOf(product);
        quickViewContent.innerHTML = `
            <div class="quick-view-media"><img src="${safeAttr(product.images?.[0] || "")}" alt="${safeAttr(product.name)}" loading="lazy"></div>
            <div class="quick-view-info">
                <h3>${safeText(product.name)}</h3>
                <p class="quick-view-price">${product.price} EGP</p>
                <span class="status-badge ${meta.out ? "pending" : "verified"}">${badge}</span>
                <p>${safeText(product.description || "")}</p>
                <div class="quick-view-actions">
                    <a class="btn btn-primary" href="/product?id=${safeAttr(pid)}">Open Product</a>
                    <button class="btn btn-secondary quick-add-cart-btn" data-id="${safeAttr(pid)}" ${meta.out ? "disabled" : ""}>Add to Cart</button>
                </div>
            </div>
        `;
        quickViewModal.style.display = "block";
        quickViewModal.setAttribute("aria-hidden", "false");
    }

    function closeQuickView() {
        if (!quickViewModal || !quickViewContent) return;
        quickViewModal.style.display = "none";
        quickViewModal.setAttribute("aria-hidden", "true");
        quickViewContent.innerHTML = "";
    }

    function getAutoplayEmbedUrl(parsed) {
        if (!parsed?.embedUrl) return "";
        try {
            const url = new URL(parsed.embedUrl);
            if (parsed.platform === "instagram") {
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

    async function buildReelsData() {
        linkedReels = [];
        reelProductMap.clear();

        remoteSellers.forEach((seller) => {
            (seller?.reels || []).forEach((reel) => {
                if (!reel?.productId || !reel?.reelUrl) return;
                linkedReels.push({ seller, reel });
            });
        });
        if (!linkedReels.length) return;

        const productIds = [...new Set(linkedReels.map((x) => String(x.reel.productId)))];
        await Promise.all(productIds.map(async (id) => {
            const fromCurrentPage = remoteProducts.find((p) => String(p._id || p.id) === id);
            if (fromCurrentPage) {
                reelProductMap.set(id, fromCurrentPage);
                return;
            }
            try {
                const product = await Api.getProductById(id);
                if (product) reelProductMap.set(id, product);
            } catch (_) {
                // ignore
            }
        }));
    }

    function setupReelObserver() {
        if (!reelsFeed) return;
        if (reelObserver) reelObserver.disconnect();
        reelObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const card = entry.target;
                const iframe = card.querySelector("iframe[data-src]");
                const skeleton = card.querySelector(".reel-skeleton");
                const sellerId = card.dataset.sellerId || "";
                const reelId = card.dataset.reelId || "";
                const key = `${sellerId}:${reelId}`;

                if (entry.isIntersecting) {
                    if (iframe && iframe.src !== iframe.dataset.src) {
                        iframe.src = iframe.dataset.src;
                    }
                    if (!viewedReelKeys.has(key) && sellerId && reelId) {
                        viewedReelKeys.add(key);
                        Api.trackSellerReelView(sellerId, reelId).catch(() => {});
                    }
                } else if (iframe && iframe.src && iframe.src !== "about:blank") {
                    iframe.src = "about:blank";
                    if (skeleton) skeleton.style.display = "block";
                }
            });
        }, { threshold: [0, 0.1] });

        reelsFeed.querySelectorAll(".reel-card[data-reel-id]").forEach((card) => {
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

    function renderReels() {
        if (!reelsFeed || !reelsEmpty) return;
        const q = (searchInput?.value || "").trim().toLowerCase();
        const filtered = linkedReels.filter(({ reel, seller }) => {
            const platformPass = activeReelsPlatform === "all" || String(reel.platform || "").toLowerCase() === activeReelsPlatform;
            if (!platformPass) return false;
            if (!q) return true;
            const product = reelProductMap.get(String(reel.productId || ""));
            const blob = [seller?.name || "", product?.name || "", reel?.title || ""].join(" ").toLowerCase();
            return blob.includes(q);
        });

        const cards = filtered.map(({ seller, reel }) => {
            const product = reelProductMap.get(String(reel.productId || ""));
            if (!product) return "";
            const parsed = typeof getReelEmbedInfo === "function" ? getReelEmbedInfo(reel.reelUrl, reel.platform) : null;
            const sellerId = String(seller?._id || seller?.id || "");
            const reelId = String(reel.reelId || reel._id || "");

            if (!parsed || parsed.error || !parsed.embedUrl) {
                return `
                    <article class="reel-card reel-fallback-card" data-seller-id="${sellerId}" data-reel-id="${reelId}">
                        <div class="reel-meta">
                            <h3>${product.name}</h3>
                            <p>${seller?.name || product?.sellerName || "Seller"}</p>
                        </div>
                        <div class="reel-fallback-actions">
                            <a class="btn btn-secondary" href="${reel.reelUrl}" target="_blank" rel="noopener">Open Reel</a>
                            <a class="btn btn-primary reel-product-link" data-seller-id="${sellerId}" data-reel-id="${reelId}" href="/product?id=${product._id || product.id}">Shop Product</a>
                        </div>
                    </article>
                `;
            }

            const embedUrl = getAutoplayEmbedUrl(parsed);
            const isWished = DB.getWishlist().some((item) => String(item.productId) === String(product._id || product.id));
            return `
            <article class="reel-card" data-seller-id="${sellerId}" data-reel-id="${reelId}">
                <div class="reel-frame" style="position: relative; height: calc(100% - 80px); background: #000;">
                    <div class="reel-skeleton" style="background-image:url('${product.images?.[0] || ""}');background-size:cover;background-position:center;position:absolute;inset:0;z-index:0;"></div>
                    <iframe src="about:blank" title="${product.name} reel" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen data-src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:none;z-index:1;"></iframe>
                    <button class="reel-fullscreen-btn" type="button" data-fullscreen-src="${embedUrl}" data-fullscreen-title="${product.name} reel" style="position: absolute; top: 12px; right: 12px; z-index: 3; background: rgba(0, 0, 0, 0.6); color: #fff; border: 1px solid rgba(255, 255, 255, 0.3); padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; backdrop-filter: blur(4px);">Full</button>
                    <a class="reel-product-link" data-seller-id="${sellerId}" data-reel-id="${reelId}" href="/product?id=${product._id || product.id}" style="position: absolute; bottom: 12px; left: 12px; right: 12px; z-index: 3; background: var(--primary-color); color: var(--on-primary); text-align: center; padding: 10px; border-radius: 10px; font-weight: 700; font-size: 0.9rem; text-decoration: none; box-shadow: 0 4px 10px rgba(255, 51, 102, 0.2); transition: all var(--transition-fast);">Shop ${product.name}</a>
                </div>
                <div class="reel-meta" style="height: 80px; padding: 12px 16px; background: var(--bg-primary); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; position: relative; z-index: 4;">
                    <div style="flex: 1; min-width: 0; padding-right: 15px;">
                        <h3 style="margin: 0 0 4px; font-size: 1.05rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary);">${product.name}</h3>
                        <p style="margin: 0; font-size: 0.9rem; font-weight: 800; color: var(--primary-color);">${product.price} EGP</p>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="reel-action-btn like-btn ${isWished ? 'active' : ''}" type="button" data-id="${product._id || product.id}" style="background: none; border: none; color: var(--text-primary); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" aria-label="${isWished ? 'Remove from wishlist' : 'Add to wishlist'}">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="${isWished ? 'var(--primary-color)' : 'none'}" stroke="${isWished ? 'var(--primary-color)' : 'currentColor'}" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </article>
            `;
        }).filter(Boolean);

        reelsFeed.innerHTML = cards.join("");
        reelsEmpty.style.display = cards.length ? "none" : "block";
        setupReelObserver();
    }

    function renderProducts() {
        if (!grid) return;
        const q = (searchInput?.value || "").trim().toLowerCase();
        const { genders, categories, subcategories, minPrice, maxPrice, sellers, sizes, colors, availableOnly } = getFilters();
        let products = remoteProducts.filter((p) =>
            p.price >= minPrice &&
            p.price <= maxPrice &&
            genderMatch(p, genders) &&
            (!categories.length || categories.includes(p.category)) &&
            subcategoryMatch(p, subcategories) &&
            (!sellers.length || sellers.includes(String(p.sellerName || ""))) &&
            (!sizes.length || (p.variants || []).some((v) => (v.sizes || []).some((s) => sizes.includes(String(s.size || ""))))) &&
            (!colors.length || (p.variants || []).some((v) => colors.includes(String(v.colorName || "").toLowerCase()))) &&
            (!availableOnly || stockMeta(p).total > 0) &&
            queryMatch(p, q)
        );

        if (sortEl?.value === "price-low") products.sort((a, b) => a.price - b.price);
        else if (sortEl?.value === "price-high") products.sort((a, b) => b.price - a.price);
        else if (sortEl?.value === "rating-high") products.sort((a, b) => {
            const ra = Number(a.averageRating || 0);
            const rb = Number(b.averageRating || 0);
            if (rb !== ra) return rb - ra;
            return Number(b.reviewCount || 0) - Number(a.reviewCount || 0);
        });
        else products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        countEl && (countEl.textContent = String(products.length || 0));
        productCountInlineEl && (productCountInlineEl.textContent = `${products.length || 0} matching products`);
        noProducts && (noProducts.style.display = products.length ? "none" : "block");
        updateFilterSummaryLabel();
        const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
        currentProductPage = Math.max(1, Math.min(currentProductPage, totalPages));
        productPagination = {
            page: currentProductPage,
            limit: PAGE_SIZE,
            total: products.length,
            totalPages
        };
        const visibleProducts = products.slice((currentProductPage - 1) * PAGE_SIZE, currentProductPage * PAGE_SIZE);

        const sellerResults = q ? remoteSellers.filter((s) => String(s.name || "").toLowerCase().includes(q)) : [];
        grid.innerHTML = `
            ${sellerResults.map((s) => `<article class="product-card"><div class="card-info"><h3>Seller: ${safeText(s.name)}</h3><p>${safeText(s.description || "")}</p><a class="btn btn-secondary" href="/seller?sellerId=${safeAttr(s._id || s.id)}">Open Seller Page</a></div></article>`).join("")}
            ${visibleProducts.map((p) => {
                const sm = stockMeta(p);
                const pid = productIdOf(p);
                const seller = remoteSellers.find((s) => String(s._id || s.id) === String(p.sellerId));
                const isWished = DB.getWishlist().some((item) => String(item.productId) === pid);
                const views = Number(p.viewCount || 0);
                const badge = Number(p.orderCount || 0) >= 3 ? "Bestseller" : (views >= 5 ? "Trending" : "");
                return `
                <article class="product-card">
                    <div class="product-card-media">
                        <a href="/product?id=${safeAttr(pid)}" class="product-image-link">
                            <img src="${safeAttr(p.images?.[0] || '')}" alt="${safeAttr(p.name)}" loading="lazy">
                        </a>
                        ${sm.out ? `<span class="stock-badge-soldout">Sold Out</span>` : (sm.low ? `<span class="stock-badge-low">Low Stock</span>` : "")}
                        ${badge ? `<span class="trend-badge-card">${badge}</span>` : ""}
                        <button class="wishlist-float-btn ${isWished ? "active" : ""}" type="button" data-id="${safeAttr(pid)}" aria-label="${isWished ? "Remove from wishlist" : "Add to wishlist"}">+</button>
                    </div>
                    <div class="card-info">
                        <div class="product-brand-line">
                            <a href="/seller?sellerId=${safeAttr(p.sellerId)}" class="product-brand-link">${safeText(p.sellerName || seller?.name || "Independent")}</a>
                        </div>
                        <h3 class="product-title-line"><a href="/product?id=${safeAttr(pid)}">${safeText(p.name)}</a></h3>
                        <p class="product-price-line">${p.price} EGP</p>
                          <div class="shop-card-actions">
                              <a href="/product?id=${safeAttr(pid)}" class="btn btn-primary shop-add-cart">View Product</a>
                          </div>
                    </div>
                </article>
            `;}).join("")}
        `;
        renderPager();
        if (window.NILEDRIP_I18N?.apply) window.NILEDRIP_I18N.apply(grid);
    }

    function renderPager() {
        if (!pagerEl) return;
        const page = Number(productPagination.page || 1);
        const totalPages = Number(productPagination.totalPages || 1);
        if (totalPages <= 1) {
            pagerEl.innerHTML = "";
            return;
        }
        pagerEl.innerHTML = `
            <button class="btn btn-secondary shop-page-btn" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>Prev</button>
            <span class="shop-page-label">Page ${page} / ${totalPages}</span>
            <button class="btn btn-secondary shop-page-btn" data-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? "disabled" : ""}>Next</button>
        `;
    }

    async function loadProducts(page = 1) {
        const query = {
            page: 1,
            limit: 100,
            sortBy: (sortEl?.value === "price-low" ? "price_low" : sortEl?.value === "price-high" ? "price_high" : sortEl?.value === "rating-high" ? "rating_high" : "newest")
        };
        const { items, pagination } = await Api.getProducts(query);
        remoteProducts = items;
        currentProductPage = Number(page || 1);
        productPagination = pagination || { page: 1, totalPages: 1 };
    }

    function setView(view) {
        activeView = view === "reels" ? "reels" : "products";
        viewSwitch?.querySelectorAll(".shop-view-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.view === activeView);
        });
        productsView?.classList.toggle("active", activeView === "products");
        reelsView?.classList.toggle("active", activeView === "reels");
        if (shopLayout) shopLayout.classList.toggle("reels-mode", activeView === "reels");
        if (filterDrawerToggle) filterDrawerToggle.style.display = activeView === "reels" ? "none" : "";
        if (filterDrawerPanel) filterDrawerPanel.style.display = activeView === "reels" ? "none" : (shopLayout?.classList.contains("filters-closed") ? "none" : "");
        
        const url = new URL(window.location);
        if (activeView === "reels") url.searchParams.set("view", "reels");
        else url.searchParams.delete("view");
        window.history.replaceState({}, "", url);

        // Highlight correct navbar link
        document.querySelectorAll(".nav-link").forEach((link) => {
            const href = link.getAttribute("href") || "";
            if (activeView === "reels") {
                link.classList.toggle("active", href.includes("view=reels"));
            } else {
                link.classList.toggle("active", href === "/shop" || href === "/shop/");
            }
        });
        
        if (activeView === "reels") renderReels();
        else renderProducts();
    }

    function syncPriceCaption(source = null) {
        if (!priceMinRange || !priceMaxRange) return;
        const min = Number(priceMinRange.value);
        const max = Number(priceMaxRange.value);
        if (min > max) {
            if (source === "min") priceMaxRange.value = String(min);
            else priceMinRange.value = String(max);
        }
        const finalMin = Number(priceMinRange.value);
        const finalMax = Number(priceMaxRange.value);
        if (priceMinValue) priceMinValue.textContent = String(finalMin);
        if (priceMaxValue) priceMaxValue.textContent = finalMax >= Number(priceMaxRange.max) ? "Max" : String(finalMax);
    }

    document.addEventListener("click", (e) => {
        const pagerBtn = e.target.closest(".shop-page-btn");
        if (pagerBtn) {
            currentProductPage = Number(pagerBtn.dataset.page || 1);
            renderProducts();
            window.scrollTo({ top: productsView?.offsetTop || 0, behavior: "smooth" });
            return;
        }

        const wishBtn = e.target.closest(".wishlist-float-btn");
        if (wishBtn) {
            if (typeof requireSignedInUser === "function" && !requireSignedInUser("Sign in to save products to your wishlist.")) return;
            const product = remoteProducts.find((p) => productIdOf(p) === String(wishBtn.dataset.id));
            if (!product) return;
            const pid = productIdOf(product);
            const list = DB.getWishlist();
            const existingIndex = list.findIndex((item) => String(item.productId) === pid);
            if (existingIndex >= 0) {
                list.splice(existingIndex, 1);
                showToast("Removed from wishlist.", "info");
            } else {
                list.push({ productId: pid, name: product.name, price: product.price, image: product.images?.[0] || "", sellerId: product.sellerId });
                showToast("Saved to wishlist.", "success");
            }
            DB.saveWishlist(list);
            updateNavbarBadges();
            renderProducts();
            return;
        }

        const likeBtn = e.target.closest(".like-btn");
        if (likeBtn) {
            if (typeof requireSignedInUser === "function" && !requireSignedInUser("Sign in to save products to your wishlist.")) return;
            const pid = String(likeBtn.dataset.id);
            const product = remoteProducts.find((p) => productIdOf(p) === pid) || reelProductMap.get(pid);
            if (!product) return;
            const list = DB.getWishlist();
            const existingIndex = list.findIndex((item) => String(item.productId) === pid);
            if (existingIndex >= 0) {
                list.splice(existingIndex, 1);
                showToast("Removed from wishlist.", "info");
            } else {
                list.push({ productId: pid, name: product.name, price: product.price, image: product.images?.[0] || "", sellerId: product.sellerId });
                showToast("Saved to wishlist.", "success");
            }
            DB.saveWishlist(list);
            updateNavbarBadges();
            if (activeView === "reels") {
                renderReels();
            } else {
                renderProducts();
            }
            return;
        }
        const quickViewBtn = e.target.closest(".quick-view-btn");
        if (quickViewBtn) {
            const product = remoteProducts.find((p) => String(p._id || p.id) === String(quickViewBtn.dataset.id));
            openQuickView(product);
            return;
        }
        const quickAddBtn = e.target.closest(".quick-add-cart-btn");
        if (quickAddBtn) {
            const product = remoteProducts.find((p) => String(p._id || p.id) === String(quickAddBtn.dataset.id));
            if (!product) return;
            const firstColor = product.variants?.[0];
            const firstSize = firstColor?.sizes?.[0];
            if (!firstColor || !firstSize || firstSize.stock <= 0) return showToast("This product is out of stock.", "error");
            
            const maxStock = firstSize.stock;
            const cart = DB.getCart();
            const pid = String(product._id || product.id);
            const existing = cart.find((i) => i.productId === pid && i.selectedColor === firstColor.colorName && i.selectedSize === firstSize.size);
            const currentQty = existing ? existing.quantity : 0;
            
            if (currentQty + 1 > maxStock) {
                return showToast(`Cannot add more than available stock (${maxStock}).`, "error");
            }
            
            if (existing) existing.quantity += 1;
            else cart.push({ productId: pid, sellerId: product.sellerId, name: product.name, price: product.price, image: product.images?.[0] || "", selectedColor: firstColor.colorName, selectedSize: firstSize.size, quantity: 1 });
            DB.saveCart(cart);
            updateNavbarBadges();
            showToast("Added to cart.", "success");
            closeQuickView();
            return;
        }
        const suggestionItem = e.target.closest(".suggestion-item");
        if (suggestionItem) {
            const label = suggestionItem.textContent.replace(/(product|seller)$/i, "").trim();
            if (searchInput) searchInput.value = label;
            suggestionsBox.style.display = "none";
            currentProductPage = 1;
            renderProducts();
            return;
        }

        const viewBtn = e.target.closest(".shop-view-btn");
        if (viewBtn) {
            setView(viewBtn.dataset.view || "products");
            return;
        }

        const platformBtn = e.target.closest(".reels-platform-btn");
        if (platformBtn) {
            activeReelsPlatform = platformBtn.dataset.platform || "all";
            reelsPlatformSwitch?.querySelectorAll(".reels-platform-btn").forEach((btn) => btn.classList.toggle("active", btn === platformBtn));
            renderReels();
            return;
        }

        const fullscreenBtn = e.target.closest(".reel-fullscreen-btn");
        if (fullscreenBtn) {
            openReelModal(fullscreenBtn.dataset.fullscreenSrc || "", fullscreenBtn.dataset.fullscreenTitle || "Reel");
            return;
        }

        if (e.target.closest("[data-close-reel-modal='1']") || e.target === reelModalClose) {
            closeReelModal();
            return;
        }
        if (e.target.closest("[data-close-quick-view='1']") || e.target === quickViewCloseBtn) {
            closeQuickView();
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

    const resetProductPageAndRender = () => {
        currentProductPage = 1;
        renderProducts();
    };
    document.querySelectorAll(".gender-filter, .category-filter, .subcategory-filter").forEach((el) => el.addEventListener("change", resetProductPageAndRender));
    filterDrawerToggle?.addEventListener("click", () => {
        if (!filterDrawerPanel) return;
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
            filterDrawerPanel.classList.toggle("open");
            document.getElementById("drawerOverlay")?.classList.toggle("active");
        } else {
            const isClosed = shopLayout?.classList.toggle("filters-closed");
            filterDrawerPanel.style.display = isClosed ? "none" : "";
            updateFilterSummaryLabel();
        }
    });

    const closeFilters = () => {
        filterDrawerPanel?.classList.remove("open");
        document.getElementById("drawerOverlay")?.classList.remove("active");
        if (window.innerWidth > 900) {
            shopLayout?.classList.add("filters-closed");
            if (filterDrawerPanel) filterDrawerPanel.style.display = "none";
            updateFilterSummaryLabel();
        }
    };

    document.getElementById("closeFilters")?.addEventListener("click", closeFilters);
    document.getElementById("drawerOverlay")?.addEventListener("click", closeFilters);
    document.addEventListener("change", (e) => {
        if (e.target.matches(".seller-filter, .size-filter, .color-filter, #availableOnly")) {
            resetProductPageAndRender();
        }
    });
    sortEl?.addEventListener("change", resetProductPageAndRender);
    searchInput?.addEventListener("input", () => {
        renderSearchSuggestions();
        currentProductPage = 1;
        if (activeView === "products") renderProducts();
        else renderReels();
    });
    document.addEventListener("click", (e) => {
        if (!suggestionsBox || !searchInput) return;
        if (e.target === searchInput || suggestionsBox.contains(e.target)) return;
        suggestionsBox.style.display = "none";
    });
    priceMinRange?.addEventListener("input", () => { syncPriceCaption("min"); resetProductPageAndRender(); });
    priceMaxRange?.addEventListener("input", () => { syncPriceCaption("max"); resetProductPageAndRender(); });
    resetBtn?.addEventListener("click", () => {
        document.querySelectorAll(".gender-filter, .category-filter, .subcategory-filter, .seller-filter, .size-filter, .color-filter").forEach((el) => { el.checked = false; });
        if (availableOnlyEl) availableOnlyEl.checked = false;
        if (priceMinRange) priceMinRange.value = "0";
        if (priceMaxRange) priceMaxRange.value = priceMaxRange.max || "10000";
        syncPriceCaption();
        resetProductPageAndRender();
        updateFilterSummaryLabel();
    });

    (async () => {
        const initialView = new URLSearchParams(window.location.search).get("view") === "reels" ? "reels" : "products";
        setView(initialView);
        try {
            if (grid) {
                grid.innerHTML = Array.from({ length: 8 }).map(() => `
                    <article class="product-card product-skeleton">
                        <div class="product-image-link"></div>
                        <div class="card-info"><h3></h3><p></p></div>
                    </article>
                `).join("");
            }
            await loadProducts(1);
            const sellersResponse = await Api.getSellers({ limit: 200 });
            remoteSellers = sellersResponse.items || [];
            renderDynamicFilters();
            await buildReelsData();
        } catch (err) {
            remoteProducts = [];
            remoteSellers = [];
            linkedReels = [];
            showToast(err?.message || "Failed to load shop data.", "error");
        }

        const maxProductPrice = Math.max(10000, ...remoteProducts.map((p) => Number(p.price || 0)));
        if (priceMinRange && priceMaxRange) {
            priceMinRange.max = String(maxProductPrice);
            priceMaxRange.max = String(maxProductPrice);
            // Default to max price when page loads
            if (!new URLSearchParams(window.location.search).has("maxPrice")) {
                priceMaxRange.value = String(maxProductPrice);
            }
        }
        if (!new URLSearchParams(window.location.search).has("q") && searchInput) searchInput.value = "";
        applyUrlFilters();
        if (suggestionsBox) suggestionsBox.style.display = "none";
        syncPriceCaption();
        renderProducts();
        renderReels();
        updateFilterSummaryLabel();

        // Intercept global navbar menu clicks to switch views dynamically if already on Shop page
        document.querySelectorAll(".nav-link").forEach((link) => {
            const href = link.getAttribute("href") || "";
            if (href === "/shop" || href === "/shop/" || href.includes("view=reels")) {
                link.addEventListener("click", (e) => {
                    const cleanPath = window.location.pathname.toLowerCase();
                    if (cleanPath.endsWith("/shop") || cleanPath.endsWith("/shop/")) {
                        e.preventDefault();
                        const view = href.includes("view=reels") ? "reels" : "products";
                        setView(view);
                    }
                });
            }
        });
    })();
})();
