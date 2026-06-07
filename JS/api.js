const API_BASE = (() => {
  const configured = String(window.NILEDRIP_API_BASE || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';
})();

function toQueryString(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function normalizeListResponse(payload) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      pagination: {
        page: 1,
        limit: payload.length,
        total: payload.length,
        totalPages: 1
      }
    };
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const pagination = payload?.pagination || {
    page: 1,
    limit: items.length,
    total: items.length,
    totalPages: 1
  };
  return { items, pagination };
}

function unwrapApiPayload(payload) {
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "success")) {
    if (payload.success === false) {
      const err = new Error(payload.message || "Request failed");
      err.payload = payload;
      throw err;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;
  }
  return payload;
}

const Api = {
  baseUrl: API_BASE,
  token: () => Store.get('nyledrip_token', ''),
  setToken: (token) => Store.set('nyledrip_token', token || ''),
  headers(auth = false) {
    const h = { 'Content-Type': 'application/json' };
    if (auth && this.token()) h.Authorization = `Bearer ${this.token()}`;
    return h;
  },
  async request(path, opts = {}) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { credentials: 'include', ...opts });
    } catch (_) {
      const err = new Error("Network error. Backend may be offline.");
      err.status = 0;
      throw err;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data?.message || `Request failed (${response.status})`);
      err.status = response.status;
      err.payload = data;
      throw err;
    }
    return unwrapApiPayload(data);
  },
  async requestForm(path, formData, auth = false) {
    const headers = {};
    if (auth && this.token()) headers.Authorization = `Bearer ${this.token()}`;
    return this.request(path, {
      method: 'POST',
      headers,
      body: formData
    });
  },

  signup(payload) {
    return this.request('/auth/signup', { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
  },
  login(payload) {
    return this.request('/auth/login', { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
  },
  resendVerification(email) {
    return this.request('/auth/resend-verification', { method: 'POST', headers: this.headers(), body: JSON.stringify({ email }) });
  },
  googleAuthUrl(returnTo = '/shop') {
    return `${this.baseUrl}/auth/google${toQueryString({ returnTo })}`;
  },

  getProducts(query = {}) {
    return this.request(`/products${toQueryString(query)}`).then(normalizeListResponse);
  },
  getProductById(id) {
    return this.request(`/products/${id}`);
  },
  notifyBackInStock(id) {
    return this.request(`/products/${id}/back-in-stock`, { method: 'POST', headers: this.headers(true) });
  },
  createProduct(payload) {
    return this.request('/products', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  updateProduct(id, payload) {
    return this.request(`/products/${id}`, { method: 'PUT', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  deleteProduct(id) {
    return this.request(`/products/${id}`, { method: 'DELETE', headers: this.headers(true) });
  },
  uploadProductImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    return this.requestForm('/products/upload-image', fd, true);
  },

  getSellers(query = {}) {
    return this.request(`/sellers${toQueryString(query)}`).then(normalizeListResponse);
  },
  getSeller(id) {
    return this.request(`/sellers/${id}`);
  },
  updateSeller(id, payload) {
    return this.request(`/sellers/${id}`, { method: 'PUT', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  getSellerReelsAnalytics(sellerId) {
    return this.request(`/sellers/${sellerId}/reels/analytics`, { headers: this.headers(true) });
  },
  trackSellerReelView(sellerId, reelId) {
    return this.request(`/sellers/${sellerId}/reels/${reelId}/view`, { method: 'POST' });
  },
  trackSellerReelClick(sellerId, reelId) {
    return this.request(`/sellers/${sellerId}/reels/${reelId}/click`, { method: 'POST' });
  },

  getOrders(query = {}) {
    return this.request(`/orders${toQueryString(query)}`, { headers: this.headers(true) }).then(normalizeListResponse);
  },
  createOrder(payload) {
    return this.request('/orders', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  getPromoQuote(payload) {
    return this.request('/orders/promo-quote', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  updateOrderStatus(id, status) {
    return this.request(`/orders/${id}/status`, { method: 'PATCH', headers: this.headers(true), body: JSON.stringify({ status }) });
  },
  getOrderTracking(id) {
    return this.request(`/orders/${id}/tracking`, { headers: this.headers(true) });
  },
  cancelOrder(id, reason = '') {
    return this.request(`/orders/${id}/cancel`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ reason }) });
  },
  requestOrderReturn(id, reason = '') {
    return this.request(`/orders/${id}/return-request`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ reason }) });
  },

  applySeller(payload) {
    return this.request('/seller-applications', { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
  },
  applySellerWithFile(fields, file) {
    const fd = new FormData();
    Object.entries(fields || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      fd.append(key, String(value));
    });
    if (file) fd.append('businessLicense', file);
    return this.requestForm('/seller-applications', fd, false);
  },
  getSellerApplications(query = {}) {
    return this.request(`/seller-applications${toQueryString(query)}`, { headers: this.headers(true) }).then(normalizeListResponse);
  },
  reviewSellerApplication(id, action) {
    return this.request(`/seller-applications/${id}/review`, { method: 'PATCH', headers: this.headers(true), body: JSON.stringify({ action }) });
  },

  getUsersAdmin(query = {}) {
    return this.request(`/users${toQueryString(query)}`, { headers: this.headers(true) }).then(normalizeListResponse);
  },
  getCurrentUser() {
    return this.request('/users/me', { headers: this.headers(true) });
  },
  updateCurrentUser(payload) {
    return this.request('/users/me', { method: 'PATCH', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  uploadAvatar(file) {
    const fd = new FormData();
    fd.append('avatar', file);
    return this.requestForm('/users/me/avatar', fd, true);
  },
  changePassword(payload) {
    return this.request('/users/me/change-password', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  logoutAllSessions() {
    return this.request('/users/me/logout-all', { method: 'POST', headers: this.headers(true) });
  },
  getAddresses() {
    return this.request('/users/me/addresses', { headers: this.headers(true) }).then((p) => p?.items || []);
  },
  addAddress(payload) {
    return this.request('/users/me/addresses', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) }).then((p) => p?.items || []);
  },
  updateAddress(addressId, payload) {
    return this.request(`/users/me/addresses/${addressId}`, { method: 'PUT', headers: this.headers(true), body: JSON.stringify(payload) }).then((p) => p?.items || []);
  },
  deleteAddress(addressId) {
    return this.request(`/users/me/addresses/${addressId}`, { method: 'DELETE', headers: this.headers(true) }).then((p) => p?.items || []);
  },
  setDefaultAddress(addressId) {
    return this.request(`/users/me/addresses/${addressId}/default`, { method: 'PATCH', headers: this.headers(true) }).then((p) => p?.items || []);
  },
  getMyWishlist() {
    return this.request('/users/me/wishlist', { headers: this.headers(true) }).then((p) => p?.items || []);
  },
  updateMyWishlist(items) {
    return this.request('/users/me/wishlist', { method: 'PUT', headers: this.headers(true), body: JSON.stringify({ items }) }).then((p) => p?.items || []);
  },
  getMyCart() {
    return this.request('/users/me/cart', { headers: this.headers(true) }).then((p) => p?.items || []);
  },
  updateMyCart(items) {
    return this.request('/users/me/cart', { method: 'PUT', headers: this.headers(true), body: JSON.stringify({ items }) }).then((p) => p?.items || []);
  },
  updatePreferences(payload) {
    return this.request('/users/me/preferences', { method: 'PATCH', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  getNotifications() {
    return this.request('/users/me/notifications', { headers: this.headers(true) }).then((p) => p?.items || []);
  },
  markNotificationRead(id) {
    return this.request(`/users/me/notifications/${id}/read`, { method: 'PATCH', headers: this.headers(true) }).then((p) => p?.items || []);
  },
  setUserStatus(id, status) {
    return this.request(`/users/${id}/status`, { method: 'PATCH', headers: this.headers(true), body: JSON.stringify({ status }) });
  },
  promoteToAdmin(email) {
    return this.request(`/users/promote`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ email }) });
  },
  getCurrencyRate(base = "EGP", target = "USD") {
    return this.request(`/utils/currency${toQueryString({ base, target })}`);
  },
  getProductReviews(productId, query = {}) {
    return this.request(`/reviews/product/${productId}${toQueryString(query)}`);
  },
  getReviewsAdmin(query = {}) {
    return this.request(`/reviews${toQueryString(query)}`, { headers: this.headers(true) }).then(normalizeListResponse);
  },
  updateReviewStatus(id, status) {
    return this.request(`/reviews/${id}/status`, { method: 'PATCH', headers: this.headers(true), body: JSON.stringify({ status }) });
  },
  reportReview(id) {
    return this.request(`/reviews/${id}/report`, { method: 'POST', headers: this.headers(true) });
  },
  getReviewEligibility(productId) {
    return this.request(`/reviews/eligibility/${productId}`, { headers: this.headers(true) });
  },
  createReview(payload) {
    return this.request('/reviews', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  getAdminSettings() {
    return this.request('/admin/settings', { headers: this.headers(true) });
  },
  updateAdminSettings(payload) {
    return this.request('/admin/settings', { method: 'PATCH', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  uploadAdminHeroBackground(file) {
    const fd = new FormData();
    fd.append('heroBackgroundMedia', file);
    return this.requestForm('/admin/settings/hero-background', fd, true);
  },
  getAuditLogs(query = {}) {
    return this.request(`/admin/audit-logs${toQueryString(query)}`, { headers: this.headers(true) }).then(normalizeListResponse);
  },
  getPayouts(query = {}) {
    return this.request(`/admin/payouts${toQueryString(query)}`, { headers: this.headers(true) }).then(normalizeListResponse);
  },
  createPayout(payload) {
    return this.request('/admin/payouts', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) });
  },
  updatePayoutStatus(id, status) {
    return this.request(`/admin/payouts/${id}/status`, { method: 'PATCH', headers: this.headers(true), body: JSON.stringify({ status }) });
  },
  getPublicSettings() {
    return this.request('/utils/public-settings');
  },
  getProductReviews(productId, query = {}) {
    return this.request(`/reviews/product/${productId}${toQueryString(query)}`);
  },
  checkReviewEligibility(productId) {
    return this.request(`/reviews/eligibility/${productId}`, { headers: this.headers(true) });
  },
  postReview(payload) {
    return this.request('/reviews', { method: 'POST', headers: this.headers(true), body: JSON.stringify(payload) });
  }
};
window.Api = Api;
