const validateEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = pass => String(pass || "").length >= 8;
const escapeHTML = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");
const escapeAttr = (value = "") => escapeHTML(value).replace(/`/g, "&#096;");
const getPasswordStrength = pass => {
  let s = 0;
  if (String(pass).length >= 8) s++;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) s++;
  if (/\d/.test(pass)) s++;
  if (/[^A-Za-z0-9]/.test(pass)) s++;
  return Math.max(1, s);
};
const showError = (el, msg) => { if (!el) return; el.textContent = msg; el.classList.add("show"); };
const clearError = el => { if (!el) return; el.textContent = ""; el.classList.remove("show"); };

const getAssetPath = (path) => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("//")) return path;
  const isInHTML = window.location.pathname.toLowerCase().includes("/html/");
  const clean = path.startsWith("../") ? path.slice(3) : path;
  return isInHTML ? `../${clean}` : clean;
};

const getPagePath = (pageName) => {
  const routeMap = {
    "index": "/",
    "shop": "/shop",
    "product": "/product",
    "cart": "/cart",
    "wishlist": "/wishlist",
    "login": "/login",
    "signup": "/signup",
    "auth-callback": "/auth-callback",
    "profile": "/profile",
    "seller": "/seller",
    "seller-dashboard": "/seller-dashboard",
    "seller-signup": "/seller-signup",
    "admin": "/admin"
  };
  const [base, query] = String(pageName || "").split("?");
  const clean = base
    .replace(/^\/?HTML\//i, "")
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .replace(/\.html$/i, "")
    .replace(/\.ejs$/i, "")
    .toLowerCase();
  const path = routeMap[clean] || (base.startsWith("/") ? base : `/${base}`);
  return query ? `${path}?${query}` : path;
};

const formatCurrency = amount =>
  `${new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 0 }).format(amount).replace("EGP", "").trim()} EGP`;

const showToast = (message, type = "info", timeout = 3600) => {
  const text = String(message || "").trim();
  if (!text) return;
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-relevant", "additions");
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = text;
  host.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("toast-leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, timeout);
};

const updateNavbarBadges = () => {
  const cart = (typeof DB !== "undefined" && DB.getCart) ? DB.getCart() : [];
  const wishlist = (typeof DB !== "undefined" && DB.getWishlist) ? DB.getWishlist() : [];
  const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const wishlistCount = wishlist.length;
  const cartBadge = document.getElementById("cartNavBadge");
  const wishlistBadge = document.getElementById("wishlistNavBadge");
  if (cartBadge) { cartBadge.textContent = String(cartCount); cartBadge.style.display = cartCount > 0 ? "inline-flex" : "none"; }
  if (wishlistBadge) { wishlistBadge.textContent = String(wishlistCount); wishlistBadge.style.display = wishlistCount > 0 ? "inline-flex" : "none"; }
};

const updateNavbarAuth = () => {
  const authContainer = document.getElementById("navbarAuth");
  if (!authContainer || typeof DB === "undefined" || !DB.getCurrentUser) return;
  const currentUser = DB.getCurrentUser();
  const profileHref = getPagePath("/profile");
  const sellerHref = getPagePath("/seller-dashboard");
  const loginHref = getPagePath("/login");
  
  if (currentUser) {
    const isSeller = currentUser.role === "seller";
    const isAdmin = currentUser.role === "admin";
    const targetHref = isSeller ? sellerHref : (isAdmin ? getPagePath("/admin") : profileHref);
    const label = isSeller ? "Dashboard" : (isAdmin ? "Admin" : "Account");
    authContainer.innerHTML = `
      <a href="${targetHref}" class="nav-link-auth">${label}</a>
      <button id="navLogoutLink" class="nav-link-logout" title="Logout" style="background:none;border:none;color:inherit;cursor:pointer;display:inline-flex;align-items:center;padding:4px;margin-left:8px;opacity:0.8;transition:opacity 0.2s;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block;">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </button>
    `;
    document.getElementById("navLogoutLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      DB.logout();
      if (typeof Api !== "undefined") Api.setToken("");
      window.location.href = loginHref;
    });
  } else {
    authContainer.innerHTML = `<a href="${loginHref}" class="nav-link-auth">Login</a>`;
  }
};

const initPremiumFeatures = () => {};

document.addEventListener("error", (event) => {
  const target = event.target;
  if (!target || target.tagName !== "IMG" || target.dataset.fallbackApplied === "true") return;
  target.dataset.fallbackApplied = "true";
  target.alt = target.alt || "Product image unavailable";
  target.src = getAssetPath("assets/images/fashion-placeholder.png");
}, true);

const requireSignedInUser = (message = "You have to sign in first.") => {
  if (typeof DB === "undefined" || !DB.getCurrentUser) return false;
  const currentUser = DB.getCurrentUser();
  const hasToken = typeof Api !== "undefined" ? Boolean(Api.token()) : true;
  if (currentUser && hasToken) return true;
  showToast(message, "error");
  window.location.href = getPagePath("/login");
  return false;
};

const requireRole = (roles, message = "You do not have permission to access this page.") => {
  if (typeof DB === "undefined" || !DB.getCurrentUser) return false;
  const allowed = Array.isArray(roles) ? roles : [roles];
  const currentUser = DB.getCurrentUser();
  const hasToken = typeof Api !== "undefined" ? Boolean(Api.token()) : true;
  if (currentUser && hasToken && allowed.includes(currentUser.role)) return true;
  showToast(message, "error");
  window.location.href = getPagePath(currentUser ? "/shop" : "/login");
  return false;
};

const getReelEmbedInfo = (reelUrl, platformHint = "") => {
  const raw = String(reelUrl || "").trim();
  if (!raw) return { error: "Reel URL is required." };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return { error: "Reel URL is not valid." };
  }
  if (!/^https?:$/i.test(parsed.protocol)) return { error: "Reel URL must start with http:// or https://." };

  const host = String(parsed.hostname || "").toLowerCase();
  const pathname = String(parsed.pathname || "");
  let platform = String(platformHint || "").trim().toLowerCase();
  if (!platform) {
    if (host.includes("instagram.com")) platform = "instagram";
    else if (host.includes("tiktok.com")) platform = "tiktok";
  }
  if (!["instagram", "tiktok"].includes(platform)) return { error: "Only Instagram and TikTok links are supported." };

  if (platform === "instagram") {
    if (!host.includes("instagram.com")) return { error: "Instagram reels must use instagram.com links." };
    const match = pathname.match(/\/reel\/([A-Za-z0-9_-]+)/i);
    if (!match) return { error: "Instagram URL must include /reel/{id}." };
    const reelId = match[1];
    const canonicalUrl = `https://www.instagram.com/reel/${reelId}/`;
    return {
      platform,
      canonicalUrl,
      externalUrl: canonicalUrl,
      embedUrl: `${canonicalUrl}embed`,
      reelId
    };
  }

  if (!host.includes("tiktok.com")) return { error: "TikTok reels must use tiktok.com links." };
  const idMatch = pathname.match(/\/video\/(\d+)/i);
  if (!idMatch) return { error: "TikTok URL must include /video/{id}." };
  const reelId = idMatch[1];
  const userMatch = pathname.match(/^\/@([^/]+)\/video\/\d+/i);
  const canonicalUrl = userMatch
    ? `https://www.tiktok.com/@${userMatch[1]}/video/${reelId}`
    : `https://www.tiktok.com/video/${reelId}`;
  return {
    platform,
    canonicalUrl,
    externalUrl: canonicalUrl,
    embedUrl: `https://www.tiktok.com/embed/v2/${reelId}`,
    reelId
  };
};

const validateForm = (formElement) => {
  if (!formElement) return false;
  let isValid = true;
  let firstErrorShown = false;
  const elements = formElement.querySelectorAll('input, select, textarea');
  elements.forEach((el) => {
    if (!el.checkValidity()) {
      isValid = false;
      el.style.borderColor = 'var(--accent-color, #ff4d4f)';
      // Attempt to show error message if a small tag exists next to it
      const errorLabel = el.nextElementSibling;
      if (errorLabel && errorLabel.tagName === 'SMALL') {
        errorLabel.textContent = el.validationMessage;
        errorLabel.style.color = 'var(--accent-color, #ff4d4f)';
      } else if (!firstErrorShown) {
        // Fallback: show toast for first error
        showToast(el.validationMessage, 'error');
        firstErrorShown = true;
      }
    } else {
      el.style.borderColor = '';
      const errorLabel = el.nextElementSibling;
      if (errorLabel && errorLabel.tagName === 'SMALL') {
        errorLabel.textContent = '';
      }
    }
  });
  return isValid;
};
