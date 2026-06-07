(function () {
    let lastTotal = 0;
    let promoState = { code: '', discountAmount: 0, sellerId: '' };
    let savedAddresses = [];
    let isPlacingOrder = false;

    function getCart() { return DB.getCart(); }
    function saveCart(cart) { DB.saveCart(cart); updateNavbarBadges(); }

    function setCheckoutError(message = "") {
        const el = document.getElementById("checkoutError");
        if (!el) return;
        el.textContent = message;
        el.style.display = message ? "block" : "none";
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
        const email = document.getElementById("checkoutEmail");
        const phone = document.getElementById("checkoutPhone");
        const city = document.getElementById("checkoutCity");
        const line1 = document.getElementById("checkoutAddress");
        if (fullName) fullName.value = address.fullName || "";
        if (phone) phone.value = address.phone || "";
        if (city) city.value = address.city || "";
        if (line1) line1.value = [address.line1, address.line2].filter(Boolean).join(", ");
        
        // Populate email if we have it in user profile, otherwise leave blank
        const user = DB.getCurrentUser();
        if (email && user && user.email) {
            email.value = user.email;
        }
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
            } else {
                fillShippingAddress({});
            }
        } catch {
            savedAddresses = [];
            fillShippingAddress({});
        }
    }

    function setCheckoutLoading(loading) {
        const confirmBtn = document.getElementById("confirmOrderBtn");
        if (confirmBtn) {
            confirmBtn.disabled = loading;
            confirmBtn.textContent = loading ? "PLACING ORDER..." : "PLACE ORDER";
        }
    }

    function renderItems() {
        const cart = getCart();
        const list = document.getElementById("checkoutItemsList");
        if (!list) return;
        
        list.innerHTML = cart.map(item => `
            <div class="cart-item" style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                <img src="${item.image || ""}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 0.9rem;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${item.selectedColor || "-"} / ${item.selectedSize || "-"}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: bold; font-size: 0.9rem;">${item.price} EGP</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Qty: ${item.quantity}</div>
                </div>
            </div>
        `).join("");
    }

    function updateSummary() {
        const cart = getCart();
        const count = cart.reduce((s, i) => s + Number(i.quantity || 0), 0);
        const subtotal = cart.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
        const freeShippingThreshold = 300;
        const shipping = count ? (subtotal >= freeShippingThreshold ? 0 : 50) : 0;
        const discount = Math.min(Math.max(0, Number(promoState.discountAmount || 0)), subtotal + shipping);
        const total = subtotal + shipping - discount;
        lastTotal = total;

        document.getElementById("modalSubtotal") && (document.getElementById("modalSubtotal").textContent = `${subtotal} EGP`);
        document.getElementById("modalShipping") && (document.getElementById("modalShipping").textContent = shipping === 0 ? "FREE" : `${shipping} EGP`);
        
        const modalDiscountRow = document.getElementById("modalDiscountRow");
        const modalDiscount = document.getElementById("modalDiscount");
        if (modalDiscountRow && modalDiscount) {
            modalDiscountRow.style.display = discount > 0 ? "flex" : "none";
            modalDiscount.textContent = discount > 0 ? `-${discount} EGP` : "0";
        }
        
        document.getElementById("modalTotal") && (document.getElementById("modalTotal").textContent = `${total} EGP`);
    }

    function showOrderConfirmation(orderIds = []) {
        const modal = document.getElementById("successModal");
        if (!modal) {
            window.location.href = '/profile';
            return;
        }
        const idEl = document.getElementById("successOrderId");
        if (idEl) {
            idEl.textContent = orderIds.join(", ");
        }
        modal.style.display = "flex";
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
    }

    async function placeOrder() {
        if (isPlacingOrder) return;
        const user = DB.getCurrentUser();
        if (!user) return showToast("Please login first.", "error");
        if (!Api.token()) return showToast("Login session missing. Please login again.", "error");
        
        const cart = getCart();
        if (!cart.length) return showToast("Your cart is empty.", "warning");
        
        let shippingAddress;
        try {
            shippingAddress = getShippingAddress();
            setCheckoutError("");
        } catch (err) {
            setCheckoutError(err.message || "Please complete shipping details.");
            showToast(err.message || "Please complete shipping details.", "error");
            return;
        }
        
        isPlacingOrder = true;
        setCheckoutLoading(true);
        const failures = [];
        const createdOrders = [];
        
        try {
            for (const item of cart) {
                try {
                    const product = await Api.getProductById(item.productId);
                    if (!product) throw new Error("Product not found.");
                    const created = await Api.createOrder({
                        productId: product._id || product.id,
                        quantity: Number(item.quantity || 0),
                        selectedColor: item.selectedColor,
                        selectedSize: item.selectedSize,
                        promoCode: promoState.code || '',
                        shippingAddress,
                        paymentMethod: document.getElementById("checkoutPaymentMethod")?.value || "cash_on_delivery"
                    });
                    createdOrders.push(created);
                } catch (err) {
                    failures.push(`${item.name} (${item.selectedColor}/${item.selectedSize}): ${err?.message || "Failed"}`);
                }
            }
            if (failures.length) {
                return showToast(`Some items could not be ordered: ${failures.join(" | ")}`, "error", 7000);
            }
            saveCart([]);
            const ids = createdOrders.map(o => o?.id).filter(Boolean);
            showOrderConfirmation(ids);
            showToast(ids.length ? `Order placed successfully. Order IDs: ${ids.join(", ")}` : "Order placed successfully.", "success", 6000);
        } finally {
            isPlacingOrder = false;
            setCheckoutLoading(false);
        }
    }

    const checkoutForm = document.getElementById("checkoutForm");
    if (checkoutForm) {
        checkoutForm.addEventListener("submit", (e) => {
            e.preventDefault();
            placeOrder();
        });
    }

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

    document.getElementById("checkoutSavedAddress")?.addEventListener("change", (e) => {
        const address = savedAddresses.find((addr) => String(addr._id) === String(e.target.value));
        if (address) fillShippingAddress(address);
        else fillShippingAddress({});
    });

    // Initialize
    const cart = getCart();
    if (!cart.length) {
        window.location.href = '/cart';
    } else {
        if (typeof requireSignedInUser === "function" && !requireSignedInUser("You have to sign in to checkout.", "/cart")) {
            // Already redirecting via requireSignedInUser if not signed in
        } else {
            renderItems();
            updateSummary();
            loadSavedAddresses();
        }
    }
})();
