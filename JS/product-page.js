(async function () {
    const id = new URLSearchParams(window.location.search).get("id");
    const showProductError = (title, message) => {
        const container = document.querySelector(".product-section .container");
        if (!container) return;
        const safeTitle = typeof escapeHTML === "function" ? escapeHTML(title) : title;
        const safeMessage = typeof escapeHTML === "function" ? escapeHTML(message) : message;
        container.innerHTML = `
            <a href="/shop" class="back-link">Back to Shop</a>
            <div class="cart-empty" style="max-width:720px;margin:40px auto;text-align:center;">
                <h2>${safeTitle}</h2>
                <p>${safeMessage}</p>
                <a href="/shop" class="btn btn-primary">Browse Products</a>
            </div>
        `;
    };
    if (!id) {
        showProductError("Product link is missing", "Open a product from the shop so NYLEDRIP can load the correct details.");
        return;
    }
    let product;
    try {
        product = await Api.getProductById(id);
    } catch (err) {
        showProductError("Product unavailable", err?.message || "Failed to load product.");
        return;
    }
    if (!product) {
        showProductError("Product not found", "This product may have been removed or the link is no longer valid.");
        return;
    }

    let selectedColor = null;
    let selectedSize = null;
    const RECENT_KEY = "nyledrip_recently_viewed";
    const set = (i, v) => { const el = document.getElementById(i); if (el) el.textContent = v; };
    set("productName", product.name);
    set("productPrice", String(product.price));
    set("productDescription", product.description);
    set("productCategory", `${product.gender} / ${product.category} / ${product.subcategory}`);
    const imageEl = document.getElementById("mainImage");
    const safeImages = (product.images || []).filter(Boolean);
    if (imageEl) imageEl.src = safeImages[0] || "";
    const thumbsWrap = document.querySelector(".thumbnail-images");
    if (thumbsWrap) {
        thumbsWrap.innerHTML = safeImages.slice(0, 3).map((src, idx) =>
            `<img class="thumbnail ${idx === 0 ? "active" : ""}" src="${src}" alt="View ${idx + 1}" data-src="${src}">`
        ).join("");
    }
    const sellerLink = document.getElementById("sellerLink");
    if (sellerLink) {
        sellerLink.href = `/seller?sellerId=${product.sellerId}`;
    }
    const sellerNameEl = document.getElementById("sellerName");
    const sellerDescEl = document.getElementById("sellerDesc");
    if (sellerNameEl || sellerDescEl) {
        try {
            const seller = await Api.getSeller(product.sellerId);
            if (seller) {
                if (sellerNameEl) sellerNameEl.textContent = seller.name || product.sellerName || "Unknown Seller";
                if (sellerDescEl) sellerDescEl.textContent = seller.description || "No description available.";
            } else {
                if (sellerNameEl) sellerNameEl.textContent = product.sellerName || "Unknown Seller";
                if (sellerDescEl) sellerDescEl.textContent = "No description available.";
            }
        } catch (err) {
            console.error("Failed to load seller info:", err);
            if (sellerNameEl) sellerNameEl.textContent = product.sellerName || "Unknown Seller";
            if (sellerDescEl) sellerDescEl.textContent = "No description available.";
        }
    }

    function saveRecentlyViewed() {
        try {
            const key = String(product._id || product.id);
            const current = Store.get(RECENT_KEY, []);
            const next = [key, ...current.filter((x) => String(x) !== key)].slice(0, 12);
            Store.set(RECENT_KEY, next);
        } catch (_) {}
    }

    function productCardTemplate(p) {
        return `<article class="product-card">
            <a href="/product?id=${p._id || p.id}" class="product-image-link"><img src="${p.images?.[0] || ""}" alt="${p.name}" loading="lazy"></a>
            <div class="card-info">
                <h3>${p.name}</h3>
                <p>${p.price} EGP</p>
            </div>
        </article>`;
    }

    let selectedReviewRating = 0;

    function starsForRating(rating) {
        const rounded = Math.max(0, Math.min(5, Math.round(Number(rating || 0))));
        return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
    }



    function renderStarInput(containerId, onChange) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;
        wrap.innerHTML = [1,2,3,4,5].map((n) => `<button type="button" class="star-btn" data-value="${n}" aria-label="${n} stars">☆</button>`).join("");
        const paint = (value) => wrap.querySelectorAll(".star-btn").forEach((b, idx) => { b.textContent = idx < value ? "★" : "☆"; b.classList.toggle("active", idx < value); });
        wrap.addEventListener("click", (e) => {
            const btn = e.target.closest(".star-btn");
            if (!btn) return;
            const value = Number(btn.dataset.value || 0);
            paint(value);
            if (typeof onChange === "function") onChange(value);
        });
        paint(0);
    }

    async function renderReviewsAndRating() {
        const reviews = document.getElementById("reviewsList");
        const summaryEl = document.getElementById("reviewsSummary");
        const starsEl = document.querySelector(".product-rating .stars");
        const reviewCountEl = document.getElementById("productReviewCount");
        if (!reviews || !summaryEl) return;
        
        try {
            const payload = await Api.getProductReviews(product._id || product.id, { page: 1, limit: 20 });
            const summary = payload?.product || {};
            const items = payload?.items || [];
            const avg = Number(summary.averageRating || 0);
            const count = Number(summary.reviewCount || 0);
            
            if (starsEl) starsEl.textContent = `${starsForRating(avg)} (${avg.toFixed(1)})`;
            if (reviewCountEl) reviewCountEl.textContent = `(${count} reviews)`;
            
            if (count > 0) {
                summaryEl.innerHTML = `
                    <div style="font-size: 4rem; font-weight: 900; line-height: 1;">${avg.toFixed(1)}</div>
                    <div class="stars" style="color: #FFD700; font-size: 1.5rem; margin-bottom: 10px;">${starsForRating(avg)}</div>
                    <p style="color: var(--text-secondary);">Based on ${count} reviews</p>
                    <button class="btn btn-primary" style="margin-top: 20px;" id="writeReviewBtn">Write a Review</button>
                `;
            }
            
            reviews.innerHTML = items.length
                ? items.map((x) => `
                    <div class="review-item" style="border-bottom: 1px solid var(--border-color); padding-bottom: 20px; margin-bottom: 20px;">
                        <div class="stars" style="color: #FFD700; font-size: 1.2rem;">${starsForRating(x.rating)}</div>
                        <h4 style="margin: 10px 0; font-size: 1.2rem;">${x.userName || "Customer"}</h4>
                        <p style="color: var(--text-secondary); margin-bottom: 10px;">${x.comment || ""}</p>
                        <div class="review-meta" style="font-size: 0.9rem; color: var(--text-secondary); display:flex; justify-content:space-between;">
                            <span>By ${x.userName || "Customer"}</span>
                            <span>${new Date(x.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>`).join("")
                : `<p class="no-products" style="grid-column: 1 / -1;">No reviews yet.</p>`;
                
            setupReviewModal();
        } catch (err) {
            console.error(err);
        }
    }

    function setupReviewModal() {
        const btn = document.getElementById("writeReviewBtn");
        const modal = document.getElementById("reviewModal");
        const closeBtn = document.getElementById("closeReviewModalBtn");
        if (!btn || !modal) return;
        
        btn.addEventListener("click", () => {
            if (!Api.token()) return showToast("You must be logged in to review.", "warning");
            modal.style.display = "flex";
        });
        
        closeBtn?.addEventListener("click", () => modal.style.display = "none");
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.style.display = "none";
        });
    }

    async function setupReviewEligibility() {
        const msg = document.getElementById("reviewEligibilityMessage");
        const form = document.getElementById("reviewForm");
        if (!msg || !form) return;
        if (!Api.token()) {
            msg.textContent = "Login to review this product after delivery.";
            form.style.display = "none";
            return;
        }
        try {
            const eligibility = await Api.getReviewEligibility(product._id || product.id);
            if (eligibility?.eligible) {
                msg.textContent = "Your delivered order is eligible for review.";
                form.style.display = "block";
            } else {
                msg.textContent = "You can review this item after your order is delivered.";
                form.style.display = "none";
            }
        } catch {
            msg.textContent = "You can review this item after your order is delivered.";
            form.style.display = "none";
        }
    }

    async function renderDiscoverySections() {
        try {
            const all = await Api.getProducts({ page: 1, limit: 120, sortBy: "newest" });
            const allItems = all.items || [];
            const related = allItems
                .filter((p) => String(p._id || p.id) !== String(product._id || product.id))
                .filter((p) => p.category === product.category || p.sellerId === product.sellerId)
                .slice(0, 4);
            const mayLike = allItems
                .filter((p) => String(p._id || p.id) !== String(product._id || product.id))
                .filter((p) => p.gender === product.gender)
                .slice(0, 4);
            const recentIds = Store.get(RECENT_KEY, []);
            const recent = recentIds
                .filter((rid) => String(rid) !== String(product._id || product.id))
                .map((rid) => allItems.find((p) => String(p._id || p.id) === String(rid)))
                .filter(Boolean)
                .slice(0, 4);
            const relatedGrid = document.getElementById("relatedGrid");
            const mayLikeGrid = document.getElementById("mayLikeGrid");
            const recentGrid = document.getElementById("recentGrid");
            if (relatedGrid) relatedGrid.innerHTML = related.length ? related.map(productCardTemplate).join("") : `<p class="no-products">No related products yet.</p>`;
            if (mayLikeGrid) mayLikeGrid.innerHTML = mayLike.length ? mayLike.map(productCardTemplate).join("") : `<p class="no-products">No recommendations yet.</p>`;
            if (recentGrid) recentGrid.innerHTML = recent.length ? recent.map(productCardTemplate).join("") : `<p class="no-products">No recently viewed products yet.</p>`;
        } catch (_) {
            // leave empty sections if discovery fetch fails
        }
    }

    function stock() {
        const c = (product.variants || []).find(v => v.colorName === selectedColor);
        const s = (c?.sizes || []).find(x => x.size === selectedSize);
        return s ? Number(s.stock || 0) : null;
    }
    function refresh() {
        const value = stock();
        const btn = document.getElementById("addToCartBtn");
        const notifyBtn = document.getElementById("notifyStockBtn");
        const el = document.getElementById("stockStatus");
        const q = document.getElementById("quantity");
        if (value === null) { if (el) el.textContent = "Choose color and size."; if (btn) btn.disabled = false; if (notifyBtn) notifyBtn.style.display = "none"; return; }
        if (value <= 0) { 
            if (el) el.textContent = "Out of stock"; 
            if (btn) btn.disabled = true; 
            if (notifyBtn) notifyBtn.style.display = "block"; 
            if (q) q.value = "1";
        }
        else {
            if (value <= 3) { if (el) el.textContent = `Only ${value} left`; }
            else { if (el) el.textContent = `In stock (${value})`; }
            if (btn) btn.disabled = false; 
            if (notifyBtn) notifyBtn.style.display = "none"; 
            if (q && Number(q.value || 1) > value) {
                q.value = String(value);
            }
        }
    }

    const colorWrap = document.querySelector(".color-options");
    const sizeWrap = document.querySelector(".size-options");
    if (colorWrap) colorWrap.innerHTML = (product.variants || []).map(v => `<button class="color-btn" data-color="${v.colorName}" style="background:${v.colorHex || "#000"}"></button>`).join("");
    const sizes = [...new Set((product.variants || []).flatMap(v => (v.sizes || []).map(s => s.size)))];
    if (sizeWrap) sizeWrap.innerHTML = sizes.map(s => `<button class="size-btn" data-size="${s}">${s}</button>`).join("");

    document.addEventListener("click", (e) => {
        const thumb = e.target.closest(".thumbnail");
        if (thumb && imageEl) {
            document.querySelectorAll(".thumbnail").forEach(t => t.classList.remove("active"));
            thumb.classList.add("active");
            imageEl.src = thumb.dataset.src || thumb.src;
        }
        const cb = e.target.closest(".color-btn");
        if (cb) { document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active")); cb.classList.add("active"); selectedColor = cb.dataset.color; refresh(); }
        const sb = e.target.closest(".size-btn");
        if (sb) { document.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active")); sb.classList.add("active"); selectedSize = sb.dataset.size; refresh(); }
    });

    document.getElementById("addToCartBtn")?.addEventListener("click", () => {
        if (!selectedColor || !selectedSize) return showToast("Please select color and size.", "error");
        const maxStock = stock();
        if (maxStock === null || maxStock <= 0) return showToast("Out of stock.", "error");
        const qty = Number(document.getElementById("quantity")?.value || 1);
        if (qty <= 0) return showToast("Please enter a valid quantity.", "error");
        
        const cart = DB.getCart();
        const pid = String(product._id || product.id);
        const existing = cart.find(i => i.productId === pid && i.selectedColor === selectedColor && i.selectedSize === selectedSize);
        const currentQty = existing ? existing.quantity : 0;
        
        if (currentQty + qty > maxStock) {
            if (currentQty > 0) {
                return showToast(`You already have ${currentQty} in cart. Cannot add ${qty} more because available stock is ${maxStock}.`, "error");
            } else {
                return showToast(`Cannot add more than available stock (${maxStock}).`, "error");
            }
        }

        if (existing) existing.quantity += qty;
        else cart.push({ productId: pid, sellerId: product.sellerId, name: product.name, price: product.price, image: product.images?.[0] || "", selectedColor, selectedSize, quantity: qty });
        DB.saveCart(cart);
        updateNavbarBadges();
        showToast("Added to cart.", "success");
    });
    document.getElementById("increaseQty")?.addEventListener("click", () => {
        const q = document.getElementById("quantity");
        if (!q) return;
        const currentVal = Number(q.value || 1);
        const maxStock = stock();
        if (maxStock !== null && currentVal >= maxStock) {
            return showToast(`Cannot exceed available stock of ${maxStock}.`, "warning");
        }
        q.value = String(currentVal + 1);
    });
    document.getElementById("decreaseQty")?.addEventListener("click", () => {
        const q = document.getElementById("quantity");
        if (!q) return;
        q.value = String(Math.max(1, Number(q.value || 1) - 1));
    });
    document.getElementById("quantity")?.addEventListener("change", (e) => {
        const q = e.target;
        let val = Math.max(1, Math.round(Number(q.value || 1)));
        const maxStock = stock();
        if (maxStock !== null && val > maxStock) {
            showToast(`Only ${maxStock} items available in stock.`, "warning");
            val = maxStock;
        }
        q.value = String(val);
    });
    document.getElementById("tryOnBtn")?.addEventListener("click", () => {
        const modal = document.getElementById("arModal");
        const overlay = document.getElementById("arOverlay");
        if (overlay) overlay.src = product.images?.[0] || "";
        if (modal) modal.classList.add("active");
    });
    document.getElementById("closeAr")?.addEventListener("click", () => {
        const modal = document.getElementById("arModal");
        if (modal) modal.classList.remove("active");
    });

    document.getElementById("wishlistBtn")?.addEventListener("click", () => {
        if (!selectedColor || !selectedSize) return showToast("Please select color and size.", "error");
        if (typeof requireSignedInUser === "function" && !requireSignedInUser("You have to sign in to add items to your wishlist.")) return;
        const list = DB.getWishlist();
        const pid = String(product._id || product.id);
        const i = list.findIndex(x => x.productId === pid && x.selectedColor === selectedColor && x.selectedSize === selectedSize);
        if (i >= 0) list.splice(i, 1); else list.push({ productId: pid, name: product.name, price: product.price, image: product.images?.[0] || "", sellerId: product.sellerId, selectedColor, selectedSize });
        DB.saveWishlist(list);
        updateNavbarBadges();
        const btn = document.getElementById("wishlistBtn");
        if (btn) {
            btn.classList.add("wish-pop");
            setTimeout(() => btn.classList.remove("wish-pop"), 320);
        }
    });

    document.getElementById("notifyStockBtn")?.addEventListener("click", async () => {
        if (typeof requireSignedInUser === "function" && !requireSignedInUser("Sign in to get back-in-stock alerts.")) return;
        try {
            await Api.notifyBackInStock(product._id || product.id);
            showToast("Back-in-stock alert saved.", "success");
        } catch (err) {
            showToast(err?.message || "Could not save alert.", "error");
        }
    });

    renderStarInput("reviewStarInput", (value) => {
        selectedReviewRating = value;
        const reviewRating = document.getElementById("reviewRating");
        if (reviewRating) reviewRating.value = String(value);
    });

    document.getElementById("reviewForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const rating = Number(document.getElementById("reviewRating")?.value || 0);
        const comment = String(document.getElementById("reviewComment")?.value || "").trim();
        try {
            await Api.createReview({ productId: String(product._id || product.id), rating, comment });
            showToast("Review submitted.", "success");
            e.target.reset();
            const modal = document.getElementById("reviewModal");
            if (modal) modal.style.display = "none";
            await renderReviewsAndRating();
            await setupReviewEligibility();
        } catch (err) {
            showToast(err?.message || "Failed to submit review.", "error");
        }
    });

    saveRecentlyViewed();
    await renderReviewsAndRating();
    await setupReviewEligibility();
    await renderDiscoverySections();
    refresh();
})();
