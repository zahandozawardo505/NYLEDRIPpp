(function () {
    let lastTotal = 0;
    let rateCache = {};
    let promoState = { code: '', discountAmount: 0, sellerId: '' };
    let savedAddresses = [];
    let isPlacingOrder = false;
    function getCart() { return DB.getCart(); }
    function saveCart(cart) { DB.saveCart(cart); updateNavbarBadges(); }
    function cartItemMatches(item, pid, color, size) {
        return String(item.productId) === pid && String(item.selectedColor) === color && String(item.selectedSize) === size;
    }
    function removeCartItem(pid, color, size) {
        promoState = { code: '', discountAmount: 0, sellerId: '' };
        saveCart(getCart().filter((item) => !cartItemMatches(item, pid, color, size)));
    }
    function showOrderConfirmation(orderIds = []) {
        const host = document.querySelector(".cart-section .container");
        if (!host) return;
        const ids = orderIds.map((id) => typeof escapeHTML === "function" ? escapeHTML(id) : String(id));
        host.querySelector(".order-confirmation-message")?.remove();
        const wrap = document.createElement("div");
        wrap.className = "cart-empty order-confirmation-message";
        wrap.innerHTML = `
            <h2>Order Confirmed</h2>
            <p>Your order was placed successfully${ids.length ? ` (IDs: ${ids.join(", ")})` : ""}.</p>
            <a href="/shop" class="btn btn-primary">Continue Shopping</a>
        `;
        host.prepend(wrap);
    }
    function setCheckoutError(message = "") {
        const el = document.getElementById("checkoutError");
        if (!el) return;
        el.textContent = message;
        el.classList.toggle("show", Boolean(message));
    }
    function getShippingAddress() {
        const fullName = String(document.getElementById("checkoutFullName")?.value || "").trim();
        const phone = String(document.getElementById("checkoutPhone")?.value || "").trim();
        const city = String(document.getElementById("checkoutCity")?.value || "").trim();
        const line1 = String(document.getElementById("checkoutAddress")?.value || "").trim();
        if (fullName.length < 3) throw new Error("Enter your full shipping name.");
        if (!/^[0-9+\-\s]{8,18}$/.test(phone)) throw new Error("Enter a valid phone number.");
        if (city.length < 2) throw new Error("Enter a valid city.");
        if (line1.length < 8) throw new Error("Enter a complete street address.");
        return { fullName, phone, city, line1, country: "Egypt", note: String(document.getElementById("cartNote")?.value || "").trim() };
    }
    function fillShippingAddress(address = {}) {
        const fullName = document.getElementById("checkoutFullName");
        const phone = document.getElementById("checkoutPhone");
        const city = document.getElementById("checkoutCity");
        const line1 = document.getElementById("checkoutAddress");
        if (fullName) fullName.value = address.fullName || "";
        if (phone) phone.value = address.phone || "";
        if (city) city.value = address.city || "";
        if (line1) line1.value = [address.line1, address.line2].filter(Boolean).join(", ");
    }
    async function loadSavedAddresses() {
        const select = document.getElementById("checkoutSavedAddress");
        if (!select || !Api.token()) return;
        try {
            savedAddresses = await Api.getAddresses();
            select.innerHTML = `<option value="">Enter a new address</option>${savedAddresses.map((addr) => `<option value="${addr._id}">${addr.label || "Address"} - ${addr.city || ""}</option>`).join("")}`;
            const defaultAddress = savedAddresses.find((addr) => addr.isDefault) || savedAddresses[0];
            if (defaultAddress) {
                select.value = String(defaultAddress._id || "");
                fillShippingAddress(defaultAddress);
            }
        } catch {
            savedAddresses = [];
        }
    }
    function setCheckoutLoading(loading) {
        const confirmBtn = document.getElementById("confirmOrderBtn");
        const checkoutBtn = document.getElementById("checkoutBtn");
        if (confirmBtn) {
            confirmBtn.disabled = loading;
            confirmBtn.textContent = loading ? "Placing..." : "Confirm";
        }
        if (checkoutBtn) checkoutBtn.disabled = loading;
    }
    // Modals moved to checkout page
    function render() {
        const cart = getCart().filter((item) => Number(item.quantity || 0) > 0);
        const itemsEl = document.getElementById("cartItems");
        const emptyEl = document.getElementById("cartEmpty");
        const layoutEl = document.getElementById("cartLayout");
        if (!itemsEl) return;
        if (!cart.length) {
            itemsEl.innerHTML = `
                <div class="cart-empty" id="cartEmptyFallback">
                    <h2>Your bag is empty</h2>
                    <p>Add something from the collection to see it here.</p>
                    <a href="/shop" class="btn btn-primary">Continue Shopping</a>
                </div>
            `;
            if (emptyEl) emptyEl.style.display = "block";
            if (layoutEl) layoutEl.style.display = "none";
            updateSummary();
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";
        if (layoutEl) layoutEl.style.display = "";
        itemsEl.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-image"><img src="${item.image || ""}" alt="${item.name}"></div>
                <div class="cart-item-info"><h3>${item.name}</h3><p>${item.selectedColor || "-"} / ${item.selectedSize || "-"}</p><p><strong>${item.price} EGP</strong></p></div>
                <div class="cart-item-controls">
                    <button class="qty-btn" data-key="${item.productId}|${item.selectedColor}|${item.selectedSize}" data-delta="-1">-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" data-key="${item.productId}|${item.selectedColor}|${item.selectedSize}" data-delta="1">+</button>
                </div>
                <button class="cart-remove-btn remove-btn" data-key="${item.productId}|${item.selectedColor}|${item.selectedSize}" aria-label="Remove item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        `).join("");
        updateSummary();
    }
    function updateSummary() {
        const cart = getCart().filter((item) => Number(item.quantity || 0) > 0);
        const count = cart.reduce((s, i) => s + Number(i.quantity || 0), 0);
        const subtotal = cart.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
        const freeShippingThreshold = 300;
        const shipping = count ? (subtotal >= freeShippingThreshold ? 0 : 50) : 0;
        const discount = Math.min(Math.max(0, Number(promoState.discountAmount || 0)), subtotal + shipping);
        const total = subtotal + shipping - discount;
        lastTotal = total;
        document.getElementById("summaryItemCount") && (document.getElementById("summaryItemCount").textContent = String(count));
        document.getElementById("subtotalAmount") && (document.getElementById("subtotalAmount").textContent = `${subtotal} EGP`);
        document.getElementById("totalAmount") && (document.getElementById("totalAmount").textContent = `${total} EGP`);
        const shippingRow = document.getElementById("shippingAmount");
        const shippingProgressBar = document.getElementById("shippingProgressBar");
        const shippingProgressText = document.getElementById("shippingProgressText");
        const progress = Math.max(0, Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100)));
        if (shippingProgressBar) shippingProgressBar.style.width = `${progress}%`;
        if (shippingProgressText) {
            shippingProgressText.textContent = subtotal >= freeShippingThreshold
                ? "You've unlocked free shipping!"
                : `Add ${freeShippingThreshold - subtotal} EGP more for free shipping`;
        }
        if (shippingRow) shippingRow.textContent = `${shipping} EGP`;
        
        const promoDiscount = document.getElementById("discountAmount");
        const discountRow = document.getElementById("discountRow");
        if (discountRow && promoDiscount) {
            discountRow.style.display = discount > 0 ? "flex" : "none";
            promoDiscount.textContent = discount > 0 ? `-${discount} EGP` : "0";
        }
        const checkoutBtn = document.getElementById("checkoutBtn");
        if (checkoutBtn) checkoutBtn.disabled = count <= 0;

        // Modal totals
        document.getElementById("modalSubtotal") && (document.getElementById("modalSubtotal").textContent = `${subtotal} EGP`);
        document.getElementById("modalShipping") && (document.getElementById("modalShipping").textContent = shipping === 0 ? "FREE" : `${shipping} EGP`);
        const modalDiscountRow = document.getElementById("modalDiscountRow");
        const modalDiscount = document.getElementById("modalDiscount");
        if (modalDiscountRow && modalDiscount) {
            modalDiscountRow.style.display = discount > 0 ? "flex" : "none";
            modalDiscount.textContent = discount > 0 ? `-${discount} EGP` : "0";
        }
        document.getElementById("modalTotal") && (document.getElementById("modalTotal").textContent = `${total} EGP`);

        const eta = document.getElementById("estimatedDelivery");
        if (eta) {
            if (!count) eta.textContent = "-";
            else {
                const target = new Date();
                target.setDate(target.getDate() + 3);
                eta.textContent = target.toLocaleDateString();
            }
        }
        renderConvertedTotal();
    }
    async function renderConvertedTotal() {
        const target = document.getElementById("currencySelect")?.value || "USD";
        const out = document.getElementById("summaryConvertedTotal");
        if (!out) return;
        if (!lastTotal) {
            out.textContent = "-";
            return;
        }
        try {
            if (!rateCache[target]) {
                const payload = await Api.getCurrencyRate("EGP", target);
                rateCache[target] = Number(payload.rate || 0);
            }
            const rate = Number(rateCache[target] || 0);
            if (!rate) throw new Error("rate unavailable");
            out.textContent = `${(lastTotal * rate).toFixed(2)} ${target}`;
        } catch {
            out.textContent = "Unavailable";
        }
    }
    // Place order logic moved to checkout.js
    document.addEventListener("click", async (e) => {
        if (e.target.closest("#clearCartBtn")) {
            if (!confirm("Clear all items from cart?")) return;
            promoState = { code: '', discountAmount: 0, sellerId: '' };
            return saveCart([]), render();
        }
        if (e.target.closest("#checkoutBtn")) {
            const cart = getCart();
            if (!cart.length) return showToast("Your cart is empty.", "warning");
            if (typeof requireSignedInUser === "function" && !requireSignedInUser("You have to sign in to checkout.")) return;
            window.location.href = '/checkout';
            return;
        }
        const qtyBtn = e.target.closest(".qty-btn");
        if (qtyBtn) {
            const [pid, color, size] = qtyBtn.dataset.key.split("|");
            const delta = Number(qtyBtn.dataset.delta);
            const cart = getCart();
            const item = cart.find(i => cartItemMatches(i, pid, color, size));
            if (!item) return;

            if (delta > 0) {
                try {
                    const product = await Api.getProductById(pid);
                    if (product) {
                        const variant = (product.variants || []).find(v => v.colorName === color);
                        const sizeRow = (variant?.sizes || []).find(s => s.size === size);
                        const maxStock = sizeRow ? Number(sizeRow.stock || 0) : 0;
                        if (Number(item.quantity || 0) + delta > maxStock) {
                            return showToast(`Cannot exceed available stock of ${maxStock}.`, "error");
                        }
                    }
                } catch (err) {
                    console.error("Failed to check stock:", err);
                }
            }

            promoState = { code: '', discountAmount: 0, sellerId: '' };
            const nextQuantity = Number(item.quantity || 0) + delta;
            if (nextQuantity <= 0) {
                removeCartItem(pid, color, size);
                return render();
            }
            item.quantity = nextQuantity;
            saveCart(cart.filter(i => Number(i.quantity || 0) > 0));
            return render();
        }
        const remove = e.target.closest(".remove-btn");
        if (remove) {
            const [pid, color, size] = remove.dataset.key.split("|");
            removeCartItem(pid, color, size);
            render();
        }
    });


    document.getElementById("applyPromoBtn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const code = String(document.getElementById("promoInput")?.value || "").trim().toUpperCase();
        if (!code) return showToast("Enter a promo code.", "warning");
        if (typeof requireSignedInUser === "function" && !requireSignedInUser("Sign in to apply a promo code.")) return;
        if (!Api.token()) return showToast("Login session missing. Please login again.", "error");
        const cart = getCart();
        if (!cart.length) return showToast("Your cart is empty.", "warning");
        try {
            const quote = await Api.getPromoQuote({
                promoCode: code,
                items: cart.map((item) => ({
                    productId: item.productId,
                    quantity: Number(item.quantity || 0)
                }))
            });
            promoState = {
                code,
                discountAmount: Number(quote?.discountAmount || 0),
                sellerId: String(quote?.sellerId || '')
            };
            updateSummary();
            showToast(`Promo ${code} applied.`, "success");
        } catch (err) {
            promoState = { code: '', discountAmount: 0, sellerId: '' };
            updateSummary();
            showToast(err?.message || "Promo code is invalid.", "error");
        }
    });
    document.getElementById("currencySelect")?.addEventListener("change", () => {
        renderConvertedTotal();
    });
    document.getElementById("checkoutSavedAddress")?.addEventListener("change", (e) => {
        const address = savedAddresses.find((addr) => String(addr._id) === String(e.target.value));
        if (address) fillShippingAddress(address);
        else fillShippingAddress({});
    });
    render();
})();
