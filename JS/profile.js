(async function () {
    const user = DB.getCurrentUser();
    if (!user) {
        window.location.href = "/login";
        return;
    }
    if (!Api.token()) {
        alert("Session missing. Please login again.");
        window.location.href = "/login";
        return;
    }

    const state = {
        user: null,
        orders: [],
        addresses: [],
        notifications: [],
        selectedAvatarFile: null,
        reviewTargetProductId: "",
        reviewRating: 0
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value ?? "");
    };

    const setInput = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? "";
    };

    function splitName(fullName) {
        const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
        return {
            first: parts[0] || "",
            last: parts.slice(1).join(" ")
        };
    }

    function renderAvatar() {
        const avatar = document.getElementById("avatarPreview");
        if (!avatar) return;
        const name = state.user?.name || "User";
        if (state.user?.avatarUrl) {
            avatar.src = resolveAssetUrl(state.user.avatarUrl);
        } else {
            avatar.removeAttribute("src");
            avatar.alt = name;
        }
    }

    function resolveAssetUrl(source) {
        const value = String(source || "").trim();
        if (!value) return "";
        if (/^(https?:|data:|blob:)/i.test(value)) return value;
        if (value.startsWith("/")) {
            try {
                return `${new URL(Api.baseUrl).origin}${value}`;
            } catch {
                return value;
            }
        }
        return value;
    }

    function statusClass(status) {
        const s = String(status || "pending").toLowerCase();
        if (s === "shipped" || s === "accepted") return "status-pill";
        if (s === "ignored") return "status-pill";
        return "status-pill";
    }

    function renderOrders() {
        const list = document.getElementById("ordersList");
        if (!list) return;
        if (!state.orders.length) {
            list.innerHTML = `<p class="profile-sub">No orders yet.</p>`;
            return;
        }
        const eligible = new Set(["shipped", "delivered", "completed"]);
        list.innerHTML = state.orders.map((order) => `
            <div class="order-item">
                <div class="profile-section-head">
                    <strong>Order #${order.id || order._id}</strong>
                    <span class="${statusClass(order.status)}">${String(order.status || "pending").replaceAll("_", " ")}</span>
                </div>
                <p class="profile-sub">Date: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : "-"}</p>
                <p class="profile-sub">Product: ${order.productId || "-"} | Qty: ${order.quantity || 0} | Total: ${order.totalPrice || 0} EGP</p>
                <p class="profile-sub">Variant: ${order.selectedColor || "-"} / ${order.selectedSize || "-"}</p>
                <div class="profile-actions">
                    <button class="btn btn-secondary btn-small track-order-btn" data-order-id="${order.id || order._id}">Track</button>
                    ${["pending", "accepted"].includes(String(order.status || "").toLowerCase()) ? `<button class="btn btn-danger btn-small cancel-order-btn" data-order-id="${order.id || order._id}">Cancel</button>` : ""}
                    ${["delivered", "completed"].includes(String(order.status || "").toLowerCase()) ? `<button class="btn btn-secondary btn-small return-order-btn" data-order-id="${order.id || order._id}">Request Return</button>` : ""}
                    ${eligible.has(String(order.status || "").toLowerCase()) ? `<button class="btn btn-secondary btn-small review-order-btn" data-product-id="${order.productId}">Review product</button>` : ""}
                </div>
            </div>
        `).join("");
    }

    function addressItemTemplate(address) {
        return `
            <div class="address-item" data-address-id="${address._id}">
                <div class="profile-section-head">
                    <strong>${address.label || "Address"}</strong>
                    ${address.isDefault ? `<span class="status-pill">Default</span>` : ""}
                </div>
                <p class="profile-sub">${address.fullName} - ${address.phone}</p>
                <p class="profile-sub">${address.line1}${address.line2 ? `, ${address.line2}` : ""}</p>
                <p class="profile-sub">${address.city}${address.state ? `, ${address.state}` : ""}, ${address.postalCode} - ${address.country}</p>
                <div class="profile-actions">
                    ${!address.isDefault ? `<button class="btn btn-secondary btn-small set-default-address-btn" data-id="${address._id}">Set Default</button>` : ""}
                    <button class="btn btn-danger btn-small delete-address-btn" data-id="${address._id}">Delete</button>
                </div>
            </div>
        `;
    }

    function renderAddresses() {
        const list = document.getElementById("addressesList");
        if (!list) return;
        if (!state.addresses.length) {
            list.innerHTML = `<p class="profile-sub">No addresses saved.</p>`;
            return;
        }
        list.innerHTML = state.addresses.map(addressItemTemplate).join("");
    }

    function renderNotifications() {
        const list = document.getElementById("notificationsList");
        if (!list) return;
        if (!state.notifications.length) {
            list.innerHTML = `<p class="profile-sub">No notifications yet.</p>`;
            return;
        }
        list.innerHTML = state.notifications.slice(0, 20).map((notification) => `
            <div class="address-item">
                <div class="profile-section-head">
                    <strong>${notification.title || "Notification"}</strong>
                    ${notification.readAt ? "" : `<span class="status-pill">New</span>`}
                </div>
                <p class="profile-sub">${notification.message || ""}</p>
                <p class="profile-sub">${notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ""}</p>
                ${notification.readAt ? "" : `<button class="btn btn-secondary btn-small mark-notification-read-btn" data-id="${notification._id}">Mark Read</button>`}
            </div>
        `).join("");
    }

    function hydrateUserForm() {
        const userRecord = state.user || {};
        
        setText("profileNameDisplay", userRecord.name || "User");
        setText("profileEmailDisplay", userRecord.email || "");
        
        const avatarLetter = (userRecord.name || "U").charAt(0).toUpperCase();
        setText("profileAvatarLetter", avatarLetter);

        setInput("profileName", userRecord.name || "");
        setInput("profilePhone", userRecord.phone || "");
        setInput("profileEmail", userRecord.email || "");

        const pref = userRecord.preferences || {};
        const notifications = pref.notifications || {};
        const lang = pref.language || "en";
        const prefLang = document.getElementById("prefLanguage");
        const prefOrder = document.getElementById("prefOrderUpdates");
        const prefMarketing = document.getElementById("prefMarketingEmails");
        if (prefLang) prefLang.value = lang;
        if (prefOrder) prefOrder.checked = Boolean(notifications.orderUpdates);
        if (prefMarketing) prefMarketing.checked = Boolean(notifications.marketingEmails);
        renderAvatar();
    }

    function updateStats() {
        setText("ordersCount", state.orders.length);
        setText("wishlistCount", DB.getWishlist().length);
        setText("cartCount", DB.getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    }

    async function loadProfile() {
        const me = await Api.getCurrentUser();
        const ordersRes = await Api.getOrders({ page: 1, limit: 200 });
        const [addresses, wishlist, cart, notifications] = await Promise.all([
            Api.getAddresses().catch(() => []),
            Api.getMyWishlist().catch(() => DB.getWishlist()),
            Api.getMyCart().catch(() => DB.getCart()),
            Api.getNotifications().catch(() => [])
        ]);
        state.user = { ...me, id: String(me._id || me.id) };
        state.orders = ordersRes.items || [];
        state.addresses = Array.isArray(addresses) ? addresses : [];
        state.notifications = Array.isArray(notifications) ? notifications : [];
        DB.setCurrentUser(state.user);
        DB.saveWishlist(Array.isArray(wishlist) ? wishlist : []);
        DB.saveCart(Array.isArray(cart) ? cart : []);
        hydrateUserForm();
        renderOrders();
        renderAddresses();
        renderNotifications();
        updateStats();
    }

    function validateAddressPayload(payload) {
        if (!payload.fullName || !payload.phone || !payload.line1 || !payload.city || !payload.postalCode) {
            return "Please complete full name, phone, line1, city, and postal code.";
        }
        if (!/^\d{8,15}$/.test(String(payload.phone || ""))) {
            return "Address phone must be 8 to 15 digits.";
        }
        return "";
    }

    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        DB.logout();
        Api.setToken("");
        window.location.href = "/login";
    });

    document.getElementById("logoutAllBtn")?.addEventListener("click", async () => {
        try {
            await Api.logoutAllSessions();
            DB.logout();
            Api.setToken("");
            alert("All sessions were logged out. Please login again.");
            window.location.href = "/login";
        } catch (err) {
            alert(err?.message || "Failed to logout all sessions.");
        }
    });

    document.getElementById("profileDetailsForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = String(document.getElementById("profileName")?.value || "").trim();
        const email = String(document.getElementById("profileEmail")?.value || "").trim().toLowerCase();
        const phone = String(document.getElementById("profilePhone")?.value || "").trim();
        if (!name) return alert("Please enter your full name.");
        if (!validateEmail(email)) return alert("Please enter a valid email.");
        if (phone && !/^\d{8,15}$/.test(phone)) return alert("Phone must be 8 to 15 digits.");
        try {
            const updated = await Api.updateCurrentUser({ name, email, phone });
            state.user = { ...state.user, ...updated, id: String(updated._id || updated.id) };
            DB.setCurrentUser(state.user);
            hydrateUserForm();
            alert("Profile updated.");
        } catch (err) {
            alert(err?.message || "Failed to update profile.");
        }
    });

    document.getElementById("avatarInput")?.addEventListener("change", (e) => {
        const file = e.target.files?.[0] || null;
        state.selectedAvatarFile = file;
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            state.selectedAvatarFile = null;
            e.target.value = "";
            alert("Please select an image file.");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            state.selectedAvatarFile = null;
            e.target.value = "";
            alert("Avatar file must be <= 2MB.");
            return;
        }
        const avatar = document.getElementById("avatarPreview");
        if (avatar) avatar.src = URL.createObjectURL(file);
    });

    document.getElementById("uploadAvatarBtn")?.addEventListener("click", async () => {
        try {
            if (!state.selectedAvatarFile) return alert("Choose an avatar file first.");
            const payload = await Api.uploadAvatar(state.selectedAvatarFile);
            state.user = { ...state.user, ...(payload.user || {}), avatarUrl: payload.avatarUrl || payload.user?.avatarUrl || "" };
            DB.setCurrentUser(state.user);
            state.selectedAvatarFile = null;
            const input = document.getElementById("avatarInput");
            if (input) input.value = "";
            renderAvatar();
            alert("Avatar uploaded.");
        } catch (err) {
            alert(err?.message || "Failed to upload avatar.");
        }
    });

    document.getElementById("changePasswordBtn")?.addEventListener("click", async () => {
        const currentPassword = String(document.getElementById("currentPasswordInput")?.value || "");
        const newPassword = String(document.getElementById("newPasswordInput")?.value || "");
        const confirmPassword = String(document.getElementById("confirmPasswordInput")?.value || "");
        if (!currentPassword || !newPassword || !confirmPassword) return alert("Please fill all password fields.");
        if (newPassword.length < 8) return alert("New password must be at least 8 characters.");
        if (newPassword !== confirmPassword) return alert("Password confirmation does not match.");
        try {
            await Api.changePassword({ currentPassword, newPassword, confirmPassword });
            DB.logout();
            Api.setToken("");
            alert("Password updated. Please login again.");
            window.location.href = "/login";
        } catch (err) {
            alert(err?.message || "Failed to update password.");
        }
    });

    document.getElementById("savePreferencesBtn")?.addEventListener("click", async () => {
        const language = String(document.getElementById("prefLanguage")?.value || "en");
        const notifications = {
            orderUpdates: Boolean(document.getElementById("prefOrderUpdates")?.checked),
            marketingEmails: Boolean(document.getElementById("prefMarketingEmails")?.checked)
        };
        try {
            const payload = await Api.updatePreferences({ language, notifications });
            state.user.preferences = payload.preferences || { language, notifications };
            DB.setCurrentUser(state.user);
            if (window.NILEDRIP_I18N && typeof window.NILEDRIP_I18N.setLocale === "function") {
                window.NILEDRIP_I18N.setLocale(language);
                return;
            }
            alert("Preferences saved.");
        } catch (err) {
            alert(err?.message || "Failed to save preferences.");
        }
    });

    document.getElementById("addAddressBtn")?.addEventListener("click", async () => {
        const payload = {
            label: String(document.getElementById("addrLabel")?.value || "Home").trim(),
            fullName: String(document.getElementById("addrFullName")?.value || "").trim(),
            phone: String(document.getElementById("addrPhone")?.value || "").trim(),
            line1: String(document.getElementById("addrLine1")?.value || "").trim(),
            line2: String(document.getElementById("addrLine2")?.value || "").trim(),
            city: String(document.getElementById("addrCity")?.value || "").trim(),
            state: String(document.getElementById("addrState")?.value || "").trim(),
            postalCode: String(document.getElementById("addrPostalCode")?.value || "").trim(),
            country: String(document.getElementById("addrCountry")?.value || "Egypt").trim(),
            isDefault: Boolean(document.getElementById("addrDefault")?.checked)
        };
        const validationError = validateAddressPayload(payload);
        if (validationError) return alert(validationError);
        try {
            state.addresses = await Api.addAddress(payload);
            renderAddresses();
            alert("Address added.");
        } catch (err) {
            alert(err?.message || "Failed to add address.");
        }
    });

    document.getElementById("addressesList")?.addEventListener("click", async (e) => {
        const defaultBtn = e.target.closest(".set-default-address-btn");
        if (defaultBtn) {
            try {
                state.addresses = await Api.setDefaultAddress(defaultBtn.dataset.id);
                renderAddresses();
                alert("Default address updated.");
            } catch (err) {
                alert(err?.message || "Failed to set default address.");
            }
            return;
        }
        const deleteBtn = e.target.closest(".delete-address-btn");
        if (deleteBtn) {
            try {
                state.addresses = await Api.deleteAddress(deleteBtn.dataset.id);
                renderAddresses();
                alert("Address deleted.");
            } catch (err) {
                alert(err?.message || "Failed to delete address.");
            }
        }
    });

    document.getElementById("syncStateBtn")?.addEventListener("click", async () => {
        try {
            await Promise.all([
                Api.updateMyWishlist(DB.getWishlist()),
                Api.updateMyCart(DB.getCart())
            ]);
            await DB.syncUserStateFromBackend();
            updateStats();
            alert("Cart and wishlist synced.");
        } catch (err) {
            alert(err?.message || "Failed to sync cart/wishlist.");
        }
    });

    function setupProfileStars() {
        const wrap = document.getElementById("profileReviewStars");
        if (!wrap) return;
        wrap.innerHTML = [1,2,3,4,5].map((n) => `<button type="button" class="star-btn" data-value="${n}" aria-label="${n} stars">☆</button>`).join("");
        const paint = (value) => wrap.querySelectorAll(".star-btn").forEach((b, idx) => { b.textContent = idx < value ? "★" : "☆"; b.classList.toggle("active", idx < value); });
        wrap.addEventListener("click", (e) => {
            const btn = e.target.closest(".star-btn");
            if (!btn) return;
            state.reviewRating = Number(btn.dataset.value || 0);
            paint(state.reviewRating);
        });
        paint(0);
    }

    function toggleRatingModal(open, productId = "") {
        const modal = document.getElementById("profileRatingModal");
        const productText = document.getElementById("profileRatingProductText");
        if (!modal) return;
        state.reviewTargetProductId = productId;
        if (!open) {
            state.reviewRating = 0;
            document.getElementById("profileReviewComment").value = "";
            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");
            document.querySelectorAll("#profileReviewStars .star-btn").forEach((b) => { b.textContent = "☆"; b.classList.remove("active"); });
            return;
        }
        if (productText) productText.textContent = `Product ID: ${productId}`;
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    document.getElementById("ordersList")?.addEventListener("click", (e) => {
        const track = e.target.closest(".track-order-btn");
        if (track) {
            Api.getOrderTracking(track.dataset.orderId)
                .then((payload) => {
                    const timeline = (payload.timeline || []).map((x) => `${x.complete ? "✓" : "•"} ${x.label}`).join(" | ");
                    alert(`Status: ${payload.status}\nTracking: ${payload.trackingNumber || "-"}\nETA: ${payload.estimatedDeliveryAt ? new Date(payload.estimatedDeliveryAt).toLocaleDateString() : "-"}\n${timeline}`);
                })
                .catch((err) => alert(err?.message || "Failed to load tracking."));
            return;
        }
        const cancel = e.target.closest(".cancel-order-btn");
        if (cancel) {
            const reason = prompt("Cancellation reason") || "";
            Api.cancelOrder(cancel.dataset.orderId, reason)
                .then(loadProfile)
                .catch((err) => alert(err?.message || "Failed to cancel order."));
            return;
        }
        const ret = e.target.closest(".return-order-btn");
        if (ret) {
            const reason = prompt("Return reason") || "";
            if (!reason.trim()) return;
            Api.requestOrderReturn(ret.dataset.orderId, reason)
                .then(loadProfile)
                .catch((err) => alert(err?.message || "Failed to request return."));
            return;
        }
        const btn = e.target.closest(".review-order-btn");
        if (!btn) return;
        toggleRatingModal(true, String(btn.dataset.productId || ""));
    });

    document.getElementById("notificationsList")?.addEventListener("click", async (e) => {
        const btn = e.target.closest(".mark-notification-read-btn");
        if (!btn) return;
        state.notifications = await Api.markNotificationRead(btn.dataset.id);
        renderNotifications();
    });

    document.getElementById("cancelProfileRatingBtn")?.addEventListener("click", () => toggleRatingModal(false));
    document.getElementById("submitProfileRatingBtn")?.addEventListener("click", async () => {
        if (state.reviewRating < 1 || state.reviewRating > 5) return alert("Please select a star rating.");
        try {
            const comment = String(document.getElementById("profileReviewComment")?.value || "").trim();
            await Api.createReview({ productId: state.reviewTargetProductId, rating: state.reviewRating, comment });
            alert("Review submitted.");
            toggleRatingModal(false);
        } catch (err) {
            alert(err?.message || "Failed to submit review.");
        }
    });

    document.getElementById("profileNav")?.addEventListener("click", (e) => {
        const btn = e.target.closest(".profile-nav-btn");
        if (!btn) return;
        document.querySelectorAll(".profile-nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.target;
        ["details", "orders", "addresses", "preferences"].forEach(id => {
            const el = document.getElementById(`section-${id}`);
            if (el) el.style.display = id === target ? "block" : "none";
        });
    });

    setupProfileStars();

    try {
        await loadProfile();
    } catch (err) {
        const msg = String(err?.message || "Failed to load profile.");
        if (/route not found/i.test(msg)) {
            alert("Profile API endpoint is unavailable on the running backend. Please restart backend and try again.");
            return;
        }
        alert(msg);
    }
})();
