(async function () {
    const current = DB.getCurrentUser();
    if (!current || current.role !== "seller") {
        if (typeof requireRole === "function") requireRole("seller", "Seller dashboard access requires an approved seller account.");
        else window.location.href = "/login";
        return;
    }
    if (!Api.token()) {
        showToast("Please login again.", "error");
        window.location.href = "/login";
        return;
    }

    const sellerId = current.id;
    const CATEGORIES = DB.CATEGORY_TREE;
    let products = [];
    let orders = [];
    let sellerProductCatalog = [];
    let sellerReels = [];
    let sellerPromoCodes = [];
    let productsPagination = { page: 1, totalPages: 1, total: 0 };
    let ordersPagination = { page: 1, totalPages: 1, total: 0 };
    let draftVariants = [];
    let editingId = null;
    let sellerLogoData = "";
    let logoDirty = false;
    const productImagePreviewUrls = [null, null, null];

    const totalStock = (p) => DB.productTotalStock(p);
    const getProduct = (id) => products.find((p) => String(p._id || p.id) === String(id));
    const escapeAttr = (value) => String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    function validatePreviewImage(file) {
        if (!file) return null;
        const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
        if (!allowed.has(file.type)) return "Only JPG, PNG, and WEBP images are allowed.";
        if (file.size > 2 * 1024 * 1024) return "Each product image must be 2MB or smaller.";
        return null;
    }

    function clearProductImagePreviewUrls(slotIndex = null) {
        const slots = slotIndex === null ? [0, 1, 2] : [slotIndex];
        slots.forEach((index) => {
            if (productImagePreviewUrls[index]) {
                URL.revokeObjectURL(productImagePreviewUrls[index]);
                productImagePreviewUrls[index] = null;
            }
        });
    }

    function setProductImagePreviewFile(slotIndex, file) {
        clearProductImagePreviewUrls(slotIndex);
        if (!file) return;
        productImagePreviewUrls[slotIndex] = URL.createObjectURL(file);
    }

    function renderProductImagePreview() {
        const preview = document.getElementById("productImagePreviewGrid");
        if (!preview) return;
        const cards = [];
        [1, 2, 3].forEach((slot) => {
            const index = slot - 1;
            const url = document.getElementById(`productImageUrl${slot}`)?.value.trim() || "";
            const file = document.getElementById(`productImageFile${slot}`)?.files?.[0] || null;
            const error = validatePreviewImage(file);
            if (error) {
                cards.push(`<div class="image-preview-card"><small>${escapeAttr(file.name)}: ${error}</small></div>`);
                return;
            }
            if (file) {
                if (!productImagePreviewUrls[index]) setProductImagePreviewFile(index, file);
                cards.push(`<div class="image-preview-card"><img src="${escapeAttr(productImagePreviewUrls[index])}" alt="Selected file preview ${slot}"><small>${escapeAttr(file.name)}</small></div>`);
                return;
            }
            if (url) {
                cards.push(`<div class="image-preview-card"><img src="${escapeAttr(url)}" alt="Existing image preview ${slot}"><small>Image ${slot}</small></div>`);
            }
        });
        preview.innerHTML = cards.join("");
    }

    function resetProductFormState() {
        editingId = null;
        draftVariants = [];
        const form = document.getElementById("addProductForm");
        if (form) form.reset();
        
        const feedback = document.getElementById("variantFeedback");
        if (feedback) feedback.innerHTML = "";
        
        const cancelBtn = document.getElementById("cancelEditBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        
        const formHeader = document.getElementById("productFormHeader");
        if (formHeader) formHeader.textContent = "Product Details";
        
        const colorWrapper = document.getElementById("colorSelectionWrapper");
        if (colorWrapper) colorWrapper.style.display = "block";

        document.querySelectorAll(".preset-color-btn, .preset-size-btn").forEach((btn) => {
            btn.classList.remove("active");
        });

        ["productImageFile1", "productImageFile2", "productImageFile3"].forEach((id) => {
            const node = document.getElementById(id);
            if (node) node.value = "";
        });
        
        const picker = document.getElementById("customColorPicker");
        if (picker) picker.value = "#8B5CF6";
        const customBtn = document.getElementById("customColorBtn");
        if (customBtn) customBtn.dataset.hex = "#8B5CF6";
        
        renderProductImagePreview();
    }

    async function refreshData() {
        const [productRes, orderRes, catalogRes] = await Promise.all([
            Api.getProducts({ sellerId, page: productsPagination.page || 1, limit: 20, sortBy: "newest" }),
            Api.getOrders({ sellerId, page: ordersPagination.page || 1, limit: 20 }),
            Api.getProducts({ sellerId, page: 1, limit: 200, sortBy: "newest" })
        ]);
        products = productRes.items || [];
        orders = orderRes.items || [];
        sellerProductCatalog = catalogRes.items || [];
        productsPagination = productRes.pagination || { page: 1, totalPages: 1, total: products.length };
        ordersPagination = orderRes.pagination || { page: 1, totalPages: 1, total: orders.length };

        const seller = await Api.getSeller(sellerId);
        const nameEl = document.getElementById("sellerNavName");
        if (nameEl) nameEl.textContent = seller?.name || current.name || "Seller";
        sellerLogoData = seller?.logo || "";

        const avatarEl = document.getElementById("sellerAvatar");
        const logoPreview = document.getElementById("sellerLogoPreview");
        if (avatarEl) {
            if (sellerLogoData) avatarEl.innerHTML = `<img src="${sellerLogoData}" alt="Seller logo">`;
            else avatarEl.textContent = (seller?.name || current.name || "S").charAt(0).toUpperCase();
        }
        if (logoPreview) {
            if (sellerLogoData) {
                logoPreview.src = sellerLogoData;
                logoPreview.style.display = "block";
            } else {
                logoPreview.removeAttribute("src");
                logoPreview.style.display = "none";
            }
        }
        if (seller?.socials) {
            document.getElementById("socialInstagram") && (document.getElementById("socialInstagram").value = seller.socials.instagram || "");
            document.getElementById("socialFacebook") && (document.getElementById("socialFacebook").value = seller.socials.facebook || "");
            document.getElementById("socialTiktok") && (document.getElementById("socialTiktok").value = seller.socials.tiktok || "");
            document.getElementById("socialWebsite") && (document.getElementById("socialWebsite").value = seller.socials.website || "");
        }
        sellerReels = Array.isArray(seller?.reels) ? seller.reels : [];
        sellerPromoCodes = Array.isArray(seller?.promoCodes) ? seller.promoCodes : [];
        renderSellerReelsEditor();
        renderSellerPromosEditor();
        renderReelsAnalytics();
    }

    function updatePresetSizes() {
        const select = document.getElementById("productCategory");
        const sizeList = document.getElementById("presetSizeList");
        const sizeInput = document.getElementById("variantSize");
        if (!select || !sizeList) return;
        
        const category = select.value;
        let sizes = ["XS", "S", "M", "L", "XL", "XXL"]; // Default
        if (category === "Shoes") {
            sizes = ["37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];
        } else if (category === "Accessories") {
            sizes = ["One Size", "S/M", "L/XL"];
        }
        
        sizeList.innerHTML = sizes.map(s => `<button type="button" class="preset-size-btn" data-size="${s}">${s}</button>`).join("");
        
        if (sizeInput) sizeInput.value = "";
    }

    function populateCategoryOptions() {
        const select = document.getElementById("productCategory");
        const sub = document.getElementById("productSubcategory");
        const colorWrapper = document.getElementById("colorSelectionWrapper");
        const nameInput = document.getElementById("variantColorName");
        const hexInput = document.getElementById("variantColorHex");
        if (!select || !sub) return;
        select.innerHTML = `<option value="">Select category</option>${Object.keys(CATEGORIES).map((c) => `<option value="${c}">${c}</option>`).join("")}`;
        select.onchange = () => {
            const list = CATEGORIES[select.value] || [];
            sub.innerHTML = `<option value="">Select subcategory</option>${list.map((x) => `<option value="${x}">${x}</option>`).join("")}`;
            
            if (select.value === "Accessories") {
                if (colorWrapper) colorWrapper.style.display = "none";
                if (nameInput) nameInput.value = "Default";
                if (hexInput) hexInput.value = "#000000";
            } else {
                if (colorWrapper) colorWrapper.style.display = "block";
                if (nameInput && nameInput.value === "Default") nameInput.value = "";
            }
            updatePresetSizes();
        };
        updatePresetSizes();
    }

    function renderSellerReelsEditor() {
        const list = document.getElementById("sellerReelsList");
        if (!list) return;
        const options = ['<option value="">Select Product</option>'].concat(
            sellerProductCatalog.map((p) => `<option value="${p._id || p.id}">${p.name}</option>`)
        ).join("");
        if (!sellerReels.length) {
            list.innerHTML = '<p class="secondary-text">No reels added yet.</p>';
            return;
        }
        const statusLabel = (status) => {
            const s = String(status || "unknown");
            if (s === "private_or_removed") return "Private/Removed";
            if (s === "unreachable") return "Unreachable";
            if (s === "restricted") return "Restricted";
            if (s === "active") return "Active";
            return "Unknown";
        };
        list.innerHTML = sellerReels.map((reel, index) => `
            <div class="seller-reel-row" data-index="${index}">
                <input type="hidden" class="seller-reel-id" value="${escapeAttr(reel.reelId || "")}">
                <div class="form-group">
                    <select class="seller-reel-platform">
                        <option value="instagram" ${reel.platform === "instagram" ? "selected" : ""}>Instagram</option>
                        <option value="tiktok" ${reel.platform === "tiktok" ? "selected" : ""}>TikTok</option>
                    </select>
                </div>
                <div class="form-group">
                    <input class="seller-reel-url" value="${escapeAttr(reel.reelUrl || "")}" placeholder="https://www.instagram.com/reel/...">
                </div>
                <div class="form-group">
                    <select class="seller-reel-product">${options}</select>
                </div>
                <button type="button" class="btn btn-secondary move-seller-reel-up-btn" data-index="${index}" ${index === 0 ? "disabled" : ""}>Up</button>
                <button type="button" class="btn btn-secondary move-seller-reel-down-btn" data-index="${index}" ${index === sellerReels.length - 1 ? "disabled" : ""}>Down</button>
                <button type="button" class="btn btn-danger remove-seller-reel-btn" data-index="${index}">Remove</button>
                <span class="reel-status-chip ${String(reel.status || "unknown")}" title="${escapeAttr(reel.statusMessage || "")}">${statusLabel(reel.status)}</span>
            </div>
        `).join("");

        list.querySelectorAll(".seller-reel-product").forEach((el, idx) => {
            const selected = String(sellerReels[idx]?.productId || "");
            el.value = selected;
        });
    }

    function collectSellerReelsFromEditor() {
        const rows = [...document.querySelectorAll(".seller-reel-row")];
        const reels = [];
        for (const row of rows) {
            const platform = row.querySelector(".seller-reel-platform")?.value || "";
            const reelUrl = row.querySelector(".seller-reel-url")?.value.trim() || "";
            const productId = row.querySelector(".seller-reel-product")?.value || "";
            const reelId = row.querySelector(".seller-reel-id")?.value || "";
            if (!platform && !reelUrl && !productId) continue;
            if (!reelUrl || !productId) {
                throw new Error("Each reel needs a URL and linked product.");
            }
            const embed = typeof getReelEmbedInfo === "function" ? getReelEmbedInfo(reelUrl, platform) : null;
            if (embed?.error) throw new Error(embed.error);
            reels.push({
                reelId: reelId || undefined,
                platform: embed?.platform || platform,
                reelUrl: embed?.canonicalUrl || reelUrl,
                productId
            });
        }
        return reels;
    }

    function renderReelsAnalytics() {
        const rows = document.getElementById("reelsAnalyticsRows");
        const totalsWrap = document.getElementById("reelsTotals");
        if (!rows || !totalsWrap) return;
        const totals = sellerReels.reduce((acc, reel) => {
            acc.views += Number(reel.views || 0);
            acc.clicks += Number(reel.clicks || 0);
            return acc;
        }, { views: 0, clicks: 0 });
        const ctr = totals.views > 0 ? ((totals.clicks / totals.views) * 100).toFixed(2) : "0.00";
        totalsWrap.innerHTML = `
            <div class="analytics-card"><h3>Total Reel Views</h3><p class="large-number">${totals.views}</p></div>
            <div class="analytics-card"><h3>Total Reel Clicks</h3><p class="large-number">${totals.clicks}</p></div>
            <div class="analytics-card"><h3>Average CTR</h3><p class="large-number">${ctr}%</p></div>
        `;
        if (!sellerReels.length) {
            rows.innerHTML = '<tr><td colspan="6">No reels yet.</td></tr>';
            return;
        }
        const statusLabel = (status) => {
            const s = String(status || "unknown");
            if (s === "private_or_removed") return "Private/Removed";
            if (s === "unreachable") return "Unreachable";
            if (s === "restricted") return "Restricted";
            if (s === "active") return "Active";
            return "Unknown";
        };
        const productNameById = new Map(sellerProductCatalog.map((p) => [String(p._id || p.id), p.name]));
        rows.innerHTML = sellerReels.map((reel) => {
            const views = Number(reel.views || 0);
            const clicks = Number(reel.clicks || 0);
            const reelCtr = views > 0 ? ((clicks / views) * 100).toFixed(2) : "0.00";
            return `<tr>
                <td>${reel.platform || "-"}</td>
                <td>${productNameById.get(String(reel.productId || "")) || reel.productId || "-"}</td>
                <td>${views}</td>
                <td>${clicks}</td>
                <td>${reelCtr}%</td>
                <td><span class="reel-status-chip ${String(reel.status || "unknown")}">${statusLabel(reel.status)}</span></td>
            </tr>`;
        }).join("");
    }

    function renderSellerPromosEditor() {
        const list = document.getElementById("sellerPromosList");
        if (!list) return;
        if (!sellerPromoCodes.length) {
            list.innerHTML = '<p class="secondary-text">No promo codes yet.</p>';
            return;
        }
        list.innerHTML = sellerPromoCodes.map((promo, index) => `
            <div class="seller-promo-card" data-index="${index}">
                <div class="promo-card-header">
                    <span class="promo-badge-status ${promo.active ? 'active' : 'disabled'}">${promo.active ? 'Active' : 'Disabled'}</span>
                    <span class="promo-usage-count">Used: ${promo.usageCount || 0} times</span>
                    <div class="promo-header-actions">
                        <button type="button" class="btn btn-small btn-secondary toggle-seller-promo-btn" data-index="${index}">${promo.active ? "Deactivate" : "Activate"}</button>
                        <button type="button" class="btn btn-small btn-danger remove-seller-promo-btn" data-index="${index}">Remove</button>
                    </div>
                </div>
                <div class="promo-card-body">
                    <div class="promo-form-row three-col">
                        <div class="form-group">
                            <label>Promo Code</label>
                            <input class="seller-promo-code" value="${escapeAttr(promo.code || "")}" placeholder="e.g. DRIPIEST" style="text-transform: uppercase;">
                            <span class="help-text">Alphanumeric (e.g. HEAT10)</span>
                        </div>
                        <div class="form-group">
                            <label>Discount Type</label>
                            <select class="seller-promo-type">
                                <option value="percentage" ${promo.type === "percentage" ? "selected" : ""}>Percentage (%)</option>
                                <option value="fixed" ${promo.type === "fixed" ? "selected" : ""}>Fixed EGP</option>
                            </select>
                            <span class="help-text">Type of discount applied</span>
                        </div>
                        <div class="form-group">
                            <label>Value</label>
                            <input class="seller-promo-value" type="number" min="1" value="${Number(promo.value || 0)}" placeholder="10">
                            <span class="help-text">Discount % or EGP amount</span>
                        </div>
                    </div>

                    <div class="promo-form-row">
                        <div class="form-group">
                            <label>Min. Order Amount (EGP)</label>
                            <input class="seller-promo-min" type="number" min="0" value="${Number(promo.minOrderAmount || 0)}" placeholder="0">
                            <span class="help-text">Minimum purchase (0 = None)</span>
                        </div>
                        <div class="form-group">
                            <label>Expiration Date</label>
                            <input class="seller-promo-expires" type="date" value="${promo.expiresAt ? String(promo.expiresAt).slice(0, 10) : ""}">
                            <span class="help-text">Valid until date (Optional)</span>
                        </div>
                    </div>

                    <div class="promo-form-row">
                        <div class="form-group">
                            <label>Global Uses Limit</label>
                            <input class="seller-promo-max" type="number" min="0" value="${Number(promo.maxRedemptions || 0)}" placeholder="0">
                            <span class="help-text">Max times used site-wide (0 = Unlimited)</span>
                        </div>
                        <div class="form-group">
                            <label>Per Customer Limit</label>
                            <input class="seller-promo-user-limit" type="number" min="0" value="${Number(promo.perUserLimit || 0)}" placeholder="0">
                            <span class="help-text">Max uses per client (0 = Unlimited)</span>
                        </div>
                    </div>

                    <div class="promo-checkbox-row">
                        <label class="checkbox-line">
                            <input class="seller-promo-first-order" type="checkbox" ${promo.firstOrderOnly ? "checked" : ""}>
                            <span>First Order Only</span>
                        </label>
                        <span class="help-text">If checked, only users who haven't ordered yet can use this code.</span>
                    </div>
                </div>
            </div>
        `).join("");
    }

    function collectSellerPromosFromEditor() {
        const rows = [...document.querySelectorAll(".seller-promo-card")];
        const promos = [];
        for (const row of rows) {
            const code = String(row.querySelector(".seller-promo-code")?.value || "").trim().toUpperCase();
            const type = String(row.querySelector(".seller-promo-type")?.value || "percentage").toLowerCase();
            const value = Number(row.querySelector(".seller-promo-value")?.value || 0);
            const minOrderAmount = Number(row.querySelector(".seller-promo-min")?.value || 0);
            const expiresAt = String(row.querySelector(".seller-promo-expires")?.value || "").trim();
            const maxRedemptions = Number(row.querySelector(".seller-promo-max")?.value || 0);
            const perUserLimit = Number(row.querySelector(".seller-promo-user-limit")?.value || 0);
            const firstOrderOnly = Boolean(row.querySelector(".seller-promo-first-order")?.checked);
            const idx = Number(row.dataset.index || -1);
            const active = idx >= 0 ? Boolean(sellerPromoCodes[idx]?.active) : true;
            if (!code) continue;
            promos.push({ code, type, value, minOrderAmount, expiresAt, maxRedemptions, perUserLimit, firstOrderOnly, active, usageCount: Number(sellerPromoCodes[idx]?.usageCount || 0) });
        }
        return promos;
    }

    function renderMyProducts() {
        const list = document.querySelector(".products-list");
        if (!list) return;
        if (!products.length) {
            list.innerHTML = `<p>No products yet on this page.</p>`;
        } else {
            const bucket = { Men: {}, Women: {}, Unisex: {} };
            products.forEach((p) => {
                if (!bucket[p.gender][p.category]) bucket[p.gender][p.category] = [];
                bucket[p.gender][p.category].push(p);
            });
            list.innerHTML = Object.entries(bucket).map(([gender, byCat]) => `<section><h3>${gender}</h3>${Object.entries(byCat).map(([cat, rows]) => `<h4>${cat}</h4>${rows.map((p) => {
                const stock = totalStock(p);
                const status = stock <= 0 ? "out_of_stock" : "active";
                return `
                <div class="product-item">
                    <div class="product-image"><img src="${p.images?.[0] || ""}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;"></div>
                    <div class="product-details-list"><h4>${p.name}</h4><p>${p.subcategory} - Stock: ${stock}</p><p><strong>${p.price} EGP</strong></p><span class="status-badge ${status === "out_of_stock" ? "pending" : "verified"}">${status.replaceAll("_", " ")}</span></div>
                    <div class="product-actions"><button class="btn btn-small btn-secondary edit-product" data-id="${p._id || p.id}">Edit</button><button class="btn btn-small btn-danger delete-product" data-id="${p._id || p.id}">Delete</button></div>
                </div>`;}).join("")}`).join("")}</section>`).join("");
        }

        const pager = document.getElementById("sellerProductsPager");
        if (pager) {
            const p = Number(productsPagination.page || 1);
            const t = Number(productsPagination.totalPages || 1);
            pager.innerHTML = t > 1 ? `
                <button class="btn btn-secondary btn-small seller-products-page-btn" data-page="${Math.max(1, p - 1)}" ${p <= 1 ? "disabled" : ""}>Prev</button>
                <span>Page ${p} / ${t}</span>
                <button class="btn btn-secondary btn-small seller-products-page-btn" data-page="${Math.min(t, p + 1)}" ${p >= t ? "disabled" : ""}>Next</button>
            ` : "";
        }
        renderInventoryAlerts();
    }

    function openTab(tabId) {
        document.querySelectorAll(".sidebar-link").forEach((a) => a.classList.toggle("active", a.dataset.tab === tabId));
        document.querySelectorAll(".dashboard-tab").forEach((tab) => {
            const active = tab.id === tabId;
            tab.classList.toggle("active", active);
            tab.style.display = active ? "block" : "none";
        });
    }

    function renderInventoryAlerts() {
        const el = document.getElementById("inventoryAlerts");
        if (!el) return;
        const rows = [];
        products.forEach((p) => (p.variants || []).forEach((c) => (c.sizes || []).forEach((s) => {
            const st = Number(s.stock || 0);
            if (st <= 3) rows.push({ productName: p.name, color: c.colorName, size: s.size, stock: st, badge: st === 0 ? "Out of Stock" : "Low Stock" });
        })));
        el.innerHTML = rows.length ? rows.map((r) => `<div class="info-box"><strong>${r.productName}</strong> - ${r.color} / ${r.size}: ${r.stock} <span class="status-badge pending">${r.badge}</span></div>`).join("") : "<p>No low stock alerts.</p>";
    }

    function addVariant() {
        const colorName = document.getElementById("variantColorName")?.value.trim();
        const colorHex = document.getElementById("variantColorHex")?.value || "#000000";
        const size = document.getElementById("variantSize")?.value;
        const stock = Number(document.getElementById("variantStock")?.value || 0);
        if (!colorName || !size) return showToast("Add color and size.", "warning");
        let color = draftVariants.find((v) => v.colorName === colorName);
        if (!color) {
            color = { colorName, colorHex, sizes: [] };
            draftVariants.push(color);
        }
        const row = color.sizes.find((x) => x.size === size);
        if (row) row.stock = stock;
        else color.sizes.push({ size, stock });
        const panel = document.getElementById("variantFeedback");
        if (panel) panel.innerHTML = `<div class="info-box">Variant saved to draft.</div>`;
    }

    function applyPendingVariantFromInputs() {
        const colorName = document.getElementById("variantColorName")?.value.trim();
        const colorHex = document.getElementById("variantColorHex")?.value || "#000000";
        const size = document.getElementById("variantSize")?.value;
        const stockRaw = document.getElementById("variantStock")?.value;
        if (!colorName || !size || stockRaw === undefined || stockRaw === null || stockRaw === "") return;
        const stock = Number(stockRaw || 0);
        if (!Number.isFinite(stock) || stock < 0) return;
        let color = draftVariants.find((v) => v.colorName === colorName);
        if (!color) {
            color = { colorName, colorHex, sizes: [] };
            draftVariants.push(color);
        }
        const row = color.sizes.find((x) => x.size === size);
        if (row) row.stock = stock;
        else color.sizes.push({ size, stock });
    }

    async function saveProductForm(e) {
        e.preventDefault();
        try {
            applyPendingVariantFromInputs();
            const submitBtn = document.querySelector("#addProductForm button[type='submit']");
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }

            const seller = await Api.getSeller(sellerId);
            const mergedImages = [];
            for (let i = 1; i <= 3; i++) {
                const fileInput = document.getElementById(`productImageFile${i}`);
                const urlInput = document.getElementById(`productImageUrl${i}`);
                const file = fileInput?.files?.[0];
                if (file) {
                    if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");
                    if (file.size > 2 * 1024 * 1024) throw new Error("Product image exceeds 2MB.");
                    const uploaded = await Api.uploadProductImage(file);
                    const uploadedUrl = uploaded.url || uploaded.publicUrl;
                    if (uploadedUrl) {
                        mergedImages.push(uploadedUrl);
                    }
                } else if (urlInput?.value.trim()) {
                    mergedImages.push(urlInput.value.trim());
                }
            }
            const payload = {
                sellerId,
                sellerName: seller?.name || current.name,
                sellerLogo: seller?.logo || "",
                name: document.getElementById("productName")?.value.trim(),
                description: document.getElementById("productDescription")?.value.trim(),
                gender: document.getElementById("productGender")?.value,
                category: document.getElementById("productCategory")?.value,
                subcategory: document.getElementById("productSubcategory")?.value,
                price: Number(document.getElementById("productPrice")?.value || 0),
                cost: Number(document.getElementById("productCost")?.value || 0),
                images: mergedImages,
                variants: draftVariants
            };
            if (!payload.name || !payload.gender || !payload.category || !payload.subcategory || !payload.variants.length) {
                throw new Error("Please complete product data.");
            }
            if (payload.name.length < 2) throw new Error("Product name must be at least 2 characters.");
            if (!Number.isFinite(payload.price) || payload.price < 0) throw new Error("Price cannot be negative.");
            if (!Number.isFinite(payload.cost) || payload.cost < 0) throw new Error("Cost cannot be negative.");
            if (payload.variants.some((variant) => (variant.sizes || []).some((size) => !Number.isFinite(Number(size.stock)) || Number(size.stock) < 0))) {
                throw new Error("Stock quantity cannot be negative.");
            }
            if (editingId) await Api.updateProduct(editingId, payload);
            else await Api.createProduct(payload);

            resetProductFormState();
            productsPagination.page = 1;
            await refreshData();
            renderMyProducts();
            renderAnalytics();
            showToast("Product saved successfully.", "success");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Product";
            }
        } catch (err) {
            showToast(err?.message || "Failed to save product.", "error");
            const submitBtn = document.querySelector("#addProductForm button[type='submit']");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Product";
            }
        }
    }

    function renderAnalytics() {
        const revenue = orders.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
        const profit = orders.reduce((s, o) => s + Number(o.profit || 0), 0);
        const sold = orders.reduce((s, o) => s + Number(o.quantity || 0), 0);
        const aov = orders.length ? Math.round(revenue / orders.length) : 0;
        const lowProducts = products.filter((p) => totalStock(p) < 5).length;
        const cards = document.getElementById("analyticsCards");
        const totalViews = products.reduce((sum, p) => sum + Number(p.viewCount || 0), 0);
        const conversionRate = totalViews > 0 ? ((sold / totalViews) * 100).toFixed(2) : "0.00";
        const userOrders = {};
        orders.forEach((o) => { userOrders[String(o.userId || "")] = (userOrders[String(o.userId || "")] || 0) + 1; });
        const returningCustomers = Object.values(userOrders).filter((x) => x > 1).length;
        if (cards) cards.innerHTML = `<div class="analytics-card"><h3>Total Revenue</h3><p class="large-number">${revenue} EGP</p></div><div class="analytics-card"><h3>Total Orders</h3><p class="large-number">${ordersPagination.total || orders.length}</p></div><div class="analytics-card"><h3>Total Products Sold</h3><p class="large-number">${sold}</p></div><div class="analytics-card"><h3>Total Profit</h3><p class="large-number">${profit} EGP</p></div><div class="analytics-card"><h3>Average Order Value</h3><p class="large-number">${aov} EGP</p></div><div class="analytics-card"><h3>Conversion Rate</h3><p class="large-number">${conversionRate}%</p></div><div class="analytics-card"><h3>Returning Customers</h3><p class="large-number">${returningCustomers}</p></div><div class="analytics-card"><h3>Low Stock Products</h3><p class="large-number">${lowProducts}</p></div>`;
        renderTables();
        renderPayoutSummary();
    }

    function renderPayoutSummary() {
        const el = document.getElementById("sellerPayoutCards");
        if (!el) return;
        const delivered = orders.filter((o) => ["delivered", "completed"].includes(String(o.status || "").toLowerCase()));
        const pending = orders.filter((o) => !["delivered", "completed", "cancelled", "refunded"].includes(String(o.status || "").toLowerCase()));
        const deliveredNet = delivered.reduce((s, o) => s + Number(o.sellerPayoutAmount ?? o.totalPrice ?? 0), 0);
        const pendingNet = pending.reduce((s, o) => s + Number(o.sellerPayoutAmount ?? o.totalPrice ?? 0), 0);
        const commission = orders.reduce((s, o) => s + Number(o.commissionAmount || 0), 0);
        el.innerHTML = `<div class="analytics-card"><h3>Available Balance</h3><p class="large-number">${deliveredNet} EGP</p></div><div class="analytics-card"><h3>Pending Balance</h3><p class="large-number">${pendingNet} EGP</p></div><div class="analytics-card"><h3>Platform Commission</h3><p class="large-number">${commission} EGP</p></div>`;
    }

    function statusLabel(status) {
        const s = String(status || "pending").toLowerCase();
        if (s === "on_the_way") return "On The Way";
        return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function renderOrdersManager() {
        const el = document.getElementById("sellerOrdersRows");
        if (!el) return;
        if (!orders.length) {
            el.innerHTML = '<tr><td colspan="7">No orders yet.</td></tr>';
        } else {
            el.innerHTML = [...orders]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((o) => {
                    const p = getProduct(o.productId);
                    return `<tr>
                        <td>${o.id || "-"}</td>
                        <td>${p?.name || "-"}</td>
                        <td>${o.userId || "-"}</td>
                        <td>${o.quantity || 0}</td>
                        <td>${o.totalPrice || 0}</td>
                        <td>${statusLabel(o.status)}</td>
                        <td>
                            <div class="order-status-cell">
                                <select class="order-status-select" data-oid="${o._id || o.id}">
                                    <option value="pending" ${o.status === "pending" ? "selected" : ""}>Pending</option>
                                    <option value="accepted" ${o.status === "accepted" ? "selected" : ""}>Accepted</option>
                                    <option value="ignored" ${o.status === "ignored" ? "selected" : ""}>Ignored</option>
                                    <option value="preparing" ${o.status === "preparing" ? "selected" : ""}>Preparing</option>
                                    <option value="on_the_way" ${o.status === "on_the_way" ? "selected" : ""}>On The Way</option>
                                    <option value="shipped" ${o.status === "shipped" ? "selected" : ""}>Shipped</option>
                                    <option value="delivered" ${o.status === "delivered" ? "selected" : ""}>Delivered</option>
                                    <option value="completed" ${o.status === "completed" ? "selected" : ""}>Completed</option>
                                    <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>Cancelled</option>
                                    <option value="return_requested" ${o.status === "return_requested" ? "selected" : ""}>Return Requested</option>
                                    <option value="returned" ${o.status === "returned" ? "selected" : ""}>Returned</option>
                                    <option value="refunded" ${o.status === "refunded" ? "selected" : ""}>Refunded</option>
                                </select>
                                <button class="btn btn-small btn-primary apply-order-status-btn" data-oid="${o._id || o.id}">Apply</button>
                            </div>
                        </td>
                    </tr>`;
                }).join("");
        }
        const pager = document.getElementById("sellerOrdersPager");
        if (pager) {
            const p = Number(ordersPagination.page || 1);
            const t = Number(ordersPagination.totalPages || 1);
            pager.innerHTML = t > 1 ? `
                <button class="btn btn-secondary btn-small seller-orders-page-btn" data-page="${Math.max(1, p - 1)}" ${p <= 1 ? "disabled" : ""}>Prev</button>
                <span>Page ${p} / ${t}</span>
                <button class="btn btn-secondary btn-small seller-orders-page-btn" data-page="${Math.min(t, p + 1)}" ${p >= t ? "disabled" : ""}>Next</button>
            ` : "";
        }
    }

    function renderTables() {
        const map = {};
        orders.forEach((o) => {
            if (!map[o.productId]) map[o.productId] = { qty: 0, rev: 0, profit: 0 };
            map[o.productId].qty += Number(o.quantity || 0);
            map[o.productId].rev += Number(o.totalPrice || 0);
            map[o.productId].profit += Number(o.profit || 0);
        });
        const best = document.getElementById("bestSelling");
        if (best) {
            const rows = Object.entries(map).map(([pid, v]) => ({ p: getProduct(pid), ...v })).filter((x) => x.p).sort((a, b) => b.qty - a.qty);
            best.innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td><img src="${r.p.images?.[0] || ""}" width="32"> ${r.p.name}</td><td>${r.qty}</td><td>${r.rev}</td><td>${r.profit}</td></tr>`).join("");
        }
        const perf = document.getElementById("perfRows");
        if (perf) perf.innerHTML = orders.map((o) => {
            const p = getProduct(o.productId);
            const cost = Number(p?.cost || 0);
            return `<tr><td>${p?.name || "-"}</td><td>${o.productId}</td><td>${o.selectedColor}</td><td>${o.selectedSize}</td><td>${o.quantity}</td><td>${o.unitPrice}</td><td>${o.totalPrice}</td><td>${cost}</td><td>${o.profit}</td></tr>`;
        }).join("");
        const recent = document.getElementById("recentOrdersRows");
        if (recent) recent.innerHTML = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10).map((o) => {
            const p = getProduct(o.productId);
            return `<tr><td>${o.id}</td><td>${p?.name || "-"}</td><td>${o.userId}</td><td>${o.quantity}</td><td>${o.totalPrice}</td><td>${o.status}</td><td>${new Date(o.createdAt).toLocaleDateString()}</td></tr>`;
        }).join("");
        renderOrdersManager();
    }

    function exportCsv() {
        const lines = ["Product Name,Product ID,Color,Size,Quantity Sold,Unit Price,Total Revenue,Cost,Profit"];
        orders.forEach((o) => {
            const p = getProduct(o.productId);
            const cost = Number(p?.cost || 0);
            lines.push([p?.name || "", o.productId, o.selectedColor, o.selectedSize, o.quantity, o.unitPrice, o.totalPrice, cost, o.profit].join(","));
        });
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "niledrip-sales-report.csv";
        a.click();
    }

    function exportReelsCsv() {
        const lines = ["Platform,Product ID,Product Name,Views,Clicks,CTR,Status,URL"];
        const productNameById = new Map(sellerProductCatalog.map((p) => [String(p._id || p.id), p.name]));
        sellerReels.forEach((r) => {
            const views = Number(r.views || 0);
            const clicks = Number(r.clicks || 0);
            const ctr = views > 0 ? ((clicks / views) * 100).toFixed(2) : "0.00";
            lines.push([
                r.platform || "",
                r.productId || "",
                productNameById.get(String(r.productId || "")) || "",
                views,
                clicks,
                ctr,
                r.status || "unknown",
                r.reelUrl || ""
            ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
        });
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "niledrip-reels-report.csv";
        a.click();
    }

    async function saveSellerSettings(e) {
        e.preventDefault();
        try {
            await Api.updateSeller(sellerId, {
                logo: sellerLogoData || "",
                socials: {
                    instagram: document.getElementById("socialInstagram")?.value.trim() || "",
                    facebook: document.getElementById("socialFacebook")?.value.trim() || "",
                    tiktok: document.getElementById("socialTiktok")?.value.trim() || "",
                    website: document.getElementById("socialWebsite")?.value.trim() || ""
                }
            });
            await refreshData();
            showToast("Settings saved.", "success");
        } catch (err) {
            showToast(err?.message || "Failed to save seller settings.", "error");
        }
    }

    async function saveSellerReels(e) {
        e.preventDefault();
        try {
            const reels = collectSellerReelsFromEditor();
            const updatedSeller = await Api.updateSeller(sellerId, { reels });
            if (!Array.isArray(updatedSeller?.reels)) {
                throw new Error("Reels were not persisted by backend. Restart backend server and try again.");
            }
            if (updatedSeller.reels.length !== reels.length) {
                throw new Error("Some reels were not saved. Check reel URL and linked product.");
            }
            await refreshData();
            showToast("Reels saved successfully.", "success");
        } catch (err) {
            showToast(err?.message || "Failed to save reels.", "error");
        }
    }

    async function saveSellerPromos(e) {
        e.preventDefault();
        try {
            const promoCodes = collectSellerPromosFromEditor();
            await Api.updateSeller(sellerId, { promoCodes });
            await refreshData();
            showToast("Promo codes saved.", "success");
        } catch (err) {
            showToast(err?.message || "Failed to save promo codes.", "error");
        }
    }

    async function saveLogoOnly() {
        if (!sellerLogoData) return showToast("Please choose a logo first.", "warning");
        await Api.updateSeller(sellerId, { logo: sellerLogoData });
        logoDirty = false;
        await refreshData();
        showToast("Logo saved successfully.", "success");
    }

    async function readLogoAsCompressedDataUrl(file) {
        const rawDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = rawDataUrl;
        });
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL("image/jpeg", 0.82);
    }

    async function changePassword(e) {
        e.preventDefault();
        const currentPassword = document.getElementById("currentPassword")?.value || "";
        const newPassword = document.getElementById("newPassword")?.value || "";
        const confirm = document.getElementById("confirmNewPassword")?.value || "";
        if (newPassword.length < 8) return showToast("New password must be at least 8 characters.", "error");
        if (newPassword !== confirm) return showToast("Passwords do not match.", "error");
        await Api.updateSeller(sellerId, { passwordChange: { currentPassword, newPassword } });
        showToast("Password updated.", "success");
    }

    document.addEventListener("click", async (e) => {
        const preset = e.target.closest(".preset-color-btn");
        if (preset) {
            const name = preset.dataset.name || "";
            const hex = preset.dataset.hex || "#000000";
            const nameInput = document.getElementById("variantColorName");
            const hexInput = document.getElementById("variantColorHex");
            if (nameInput) nameInput.value = name;
            if (hexInput) hexInput.value = hex;
            document.querySelectorAll(".preset-color-btn").forEach((btn) => {
                btn.classList.remove("active");
            });
            preset.classList.add("active");
            
            if (preset.id === "customColorBtn" && e.target.id !== "customColorPicker") {
                document.getElementById("customColorPicker")?.click();
            }
            return;
        }

        const presetSize = e.target.closest(".preset-size-btn");
        if (presetSize) {
            const size = presetSize.dataset.size || "";
            const sizeInput = document.getElementById("variantSize");
            if (sizeInput) sizeInput.value = size;
            document.querySelectorAll(".preset-size-btn").forEach((btn) => {
                btn.classList.remove("active");
            });
            presetSize.classList.add("active");
            return;
        }

        const tabLink = e.target.closest(".sidebar-link");
        if (tabLink) {
            e.preventDefault();
            openTab(tabLink.dataset.tab);
            return;
        }

        const removeReelBtn = e.target.closest(".remove-seller-reel-btn");
        if (removeReelBtn) {
            const idx = Number(removeReelBtn.dataset.index || -1);
            if (idx >= 0) {
                sellerReels.splice(idx, 1);
                renderSellerReelsEditor();
                renderReelsAnalytics();
            }
            return;
        }

        const moveUpReelBtn = e.target.closest(".move-seller-reel-up-btn");
        if (moveUpReelBtn) {
            const idx = Number(moveUpReelBtn.dataset.index || -1);
            if (idx > 0) {
                const tmp = sellerReels[idx - 1];
                sellerReels[idx - 1] = sellerReels[idx];
                sellerReels[idx] = tmp;
                renderSellerReelsEditor();
                renderReelsAnalytics();
            }
            return;
        }

        const moveDownReelBtn = e.target.closest(".move-seller-reel-down-btn");
        if (moveDownReelBtn) {
            const idx = Number(moveDownReelBtn.dataset.index || -1);
            if (idx >= 0 && idx < sellerReels.length - 1) {
                const tmp = sellerReels[idx + 1];
                sellerReels[idx + 1] = sellerReels[idx];
                sellerReels[idx] = tmp;
                renderSellerReelsEditor();
                renderReelsAnalytics();
            }
            return;
        }

        const removePromoBtn = e.target.closest(".remove-seller-promo-btn");
        if (removePromoBtn) {
            const idx = Number(removePromoBtn.dataset.index || -1);
            if (idx >= 0) {
                sellerPromoCodes.splice(idx, 1);
                renderSellerPromosEditor();
            }
            return;
        }

        const togglePromoBtn = e.target.closest(".toggle-seller-promo-btn");
        if (togglePromoBtn) {
            const idx = Number(togglePromoBtn.dataset.index || -1);
            if (idx >= 0 && sellerPromoCodes[idx]) {
                sellerPromoCodes[idx].active = !sellerPromoCodes[idx].active;
                renderSellerPromosEditor();
            }
            return;
        }

        const productPagerBtn = e.target.closest(".seller-products-page-btn");
        if (productPagerBtn) {
            productsPagination.page = Number(productPagerBtn.dataset.page || 1);
            await refreshData();
            renderMyProducts();
            renderAnalytics();
            return;
        }

        const ordersPagerBtn = e.target.closest(".seller-orders-page-btn");
        if (ordersPagerBtn) {
            ordersPagination.page = Number(ordersPagerBtn.dataset.page || 1);
            await refreshData();
            renderAnalytics();
            return;
        }

        if (e.target.closest("#cancelEditBtn")) {
            resetProductFormState();
            return;
        }

        if (e.target.closest("#addVariantBtn")) addVariant();

        const deleteBtn = e.target.closest(".delete-product");
        if (deleteBtn) {
            await Api.deleteProduct(deleteBtn.dataset.id);
            await refreshData();
            renderMyProducts();
            renderAnalytics();
            return;
        }

        const editBtn = e.target.closest(".edit-product");
        if (editBtn) {
            const p = getProduct(editBtn.dataset.id);
            if (!p) return;
            editingId = String(p._id || p.id);
            draftVariants = p.variants || [];
            
            const formHeader = document.getElementById("productFormHeader");
            if (formHeader) formHeader.textContent = `Edit Product Details: ${p.name}`;
            
            const cancelBtn = document.getElementById("cancelEditBtn");
            if (cancelBtn) cancelBtn.style.display = "inline-block";

            const nameEl = document.getElementById("productName");
            const descEl = document.getElementById("productDescription");
            const genderEl = document.getElementById("productGender");
            const catEl = document.getElementById("productCategory");
            const subEl = document.getElementById("productSubcategory");
            const priceEl = document.getElementById("productPrice");
            const costEl = document.getElementById("productCost");
            const img1El = document.getElementById("productImageUrl1");
            const img2El = document.getElementById("productImageUrl2");
            const img3El = document.getElementById("productImageUrl3");
            if (nameEl) nameEl.value = p.name || "";
            if (descEl) descEl.value = p.description || "";
            if (genderEl) genderEl.value = p.gender || "";
            if (catEl) {
                catEl.value = p.category || "";
                catEl.dispatchEvent(new Event("change"));
            }
            if (subEl) subEl.value = p.subcategory || "";
            if (priceEl) priceEl.value = p.price ?? "";
            if (costEl) costEl.value = p.cost ?? "";
            if (img1El) img1El.value = p.images?.[0] || "";
            if (img2El) img2El.value = p.images?.[1] || "";
            if (img3El) img3El.value = p.images?.[2] || "";
            clearProductImagePreviewUrls();
            ["productImageFile1", "productImageFile2", "productImageFile3"].forEach((id) => {
                const node = document.getElementById(id);
                if (node) node.value = "";
            });
            renderProductImagePreview();
            openTab("add-product-tab");
            const feedback = document.getElementById("variantFeedback");
            if (feedback) feedback.innerHTML = `<div class="info-box">Editing product: <strong>${p.name}</strong>. Update fields then click <strong>Save Product</strong>.</div>`;
            document.getElementById("addProductForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        const orderBtn = e.target.closest(".apply-order-status-btn");
        if (orderBtn) {
            const oid = orderBtn.dataset.oid;
            const select = document.querySelector(`.order-status-select[data-oid="${oid}"]`);
            const nextStatus = select?.value || "pending";
            await Api.updateOrderStatus(oid, nextStatus);
            await refreshData();
            renderAnalytics();
            return;
        }

        if (e.target.closest("#exportSalesBtn")) exportCsv();
        if (e.target.closest("#exportReelsBtn")) exportReelsCsv();
    });

    document.getElementById("sellerLogoutBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        DB.logout();
        Api.setToken("");
        window.location.href = "/login";
    });

    document.getElementById("addProductForm")?.addEventListener("submit", saveProductForm);
    ["productImageUrl1", "productImageUrl2", "productImageUrl3"].forEach((id) => {
        document.getElementById(id)?.addEventListener("input", renderProductImagePreview);
    });
    ["productImageFile1", "productImageFile2", "productImageFile3"].forEach((id) => {
        document.getElementById(id)?.addEventListener("change", (e) => {
            const slotIndex = Number(id.replace("productImageFile", "")) - 1;
            const file = e.target.files?.[0];
            const error = validatePreviewImage(file);
            if (error) {
                showToast(error, "error");
                e.target.value = "";
                clearProductImagePreviewUrls(slotIndex);
            } else {
                setProductImagePreviewFile(slotIndex, file);
            }
            renderProductImagePreview();
        });
    });
    window.addEventListener("beforeunload", () => clearProductImagePreviewUrls());
    document.getElementById("settingsForm")?.addEventListener("submit", saveSellerSettings);
    document.getElementById("sellerReelsForm")?.addEventListener("submit", saveSellerReels);
    document.getElementById("sellerPromosForm")?.addEventListener("submit", saveSellerPromos);
    document.getElementById("passwordForm")?.addEventListener("submit", changePassword);
    document.getElementById("addSellerReelBtn")?.addEventListener("click", () => {
        sellerReels.push({ platform: "instagram", reelUrl: "", productId: "", status: "unknown", views: 0, clicks: 0 });
        renderSellerReelsEditor();
        renderReelsAnalytics();
    });
    document.getElementById("addSellerPromoBtn")?.addEventListener("click", () => {
        sellerPromoCodes.push({ code: "", type: "percentage", value: 10, minOrderAmount: 0, expiresAt: "", maxRedemptions: 0, perUserLimit: 0, firstOrderOnly: false, active: true, usageCount: 0 });
        renderSellerPromosEditor();
    });
    document.getElementById("sellerLogoFile")?.addEventListener("change", (e) => {
        (async () => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith("image/")) return showToast("Please upload an image file.", "error");
            sellerLogoData = await readLogoAsCompressedDataUrl(file);
            logoDirty = true;
            const preview = document.getElementById("sellerLogoPreview");
            const avatar = document.getElementById("sellerAvatar");
            if (preview) {
                preview.src = sellerLogoData;
                preview.style.display = "block";
            }
            if (avatar && sellerLogoData) avatar.innerHTML = `<img src="${sellerLogoData}" alt="Seller logo">`;
        })().catch(() => showToast("Failed to load logo image.", "error"));
    });
    document.getElementById("saveLogoBtn")?.addEventListener("click", () => {
        if (!logoDirty) return showToast("No new logo changes to save.", "warning");
        saveLogoOnly().catch((err) => showToast(err?.message || "Failed to save logo.", "error"));
    });

    const handleCustomColorUpdate = (e) => {
        const hex = e.target.value;
        const btn = document.getElementById("customColorBtn");
        const hexInput = document.getElementById("variantColorHex");
        const nameInput = document.getElementById("variantColorName");
        
        if (btn) btn.dataset.hex = hex;
        if (hexInput) hexInput.value = hex;
        if (nameInput) {
            const presets = ["Black", "White", "Navy", "Gray", "Beige", "Brown", "Red", "Green", "Custom Color", ""];
            if (presets.includes(nameInput.value.trim())) {
                nameInput.value = "Custom Color";
            }
            nameInput.focus();
            nameInput.select();
        }
    };
    document.getElementById("customColorPicker")?.addEventListener("input", handleCustomColorUpdate);
    document.getElementById("customColorPicker")?.addEventListener("change", handleCustomColorUpdate);

    populateCategoryOptions();
    try {
        await refreshData();
        document.querySelectorAll(".dashboard-tab").forEach((tab, idx) => {
            tab.style.display = idx === 0 ? "block" : "none";
        });
        renderMyProducts();
        renderAnalytics();
    } catch (err) {
        showToast(err?.message || "Failed to load seller dashboard.", "error");
    }
})();
