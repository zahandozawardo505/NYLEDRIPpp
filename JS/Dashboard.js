(async function () {
  const current = DB.getCurrentUser();
  if (!current || current.role !== "admin") {
    if (typeof requireRole === "function") requireRole("admin", "Admin access requires an admin account.");
    else window.location.href = "/login";
    return;
  }
  if (!Api.token()) {
    showToast("Admin session missing. Please login again.", "error");
    window.location.href = "/login";
    return;
  }

  let users = [];
  let sellers = [];
  let orders = [];
  let products = [];
  let applications = [];
  let reviews = [];
  let payouts = [];
  let auditLogs = [];
  let settings = null;
  const TABLE_PAGE_SIZE = 10;
  let usersPage = 1;
  let sellersPage = 1;
  let appsPage = 1;
  let reviewsPage = 1;

  function toCsv(headers, rows) {
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[ch]));
  }
  function productIdOf(product) {
    return String(product?._id || product?.id || "").trim();
  }
  function productNameForReview(review) {
    const apiName = String(review?.productName || review?.product?.name || review?.productTitle || "").trim();
    if (apiName && apiName.toLowerCase() !== "product") return apiName;

    const reviewProductId = String(review?.productId || review?.product_id || review?.itemId || review?.product?._id || review?.product?.id || "").trim();
    if (reviewProductId) {
      const match = products.find((product) => productIdOf(product) === reviewProductId);
      if (match?.name) return match.name;
      if (match?.title) return match.title;
    }
    return "Unknown product";
  }
  function normalizeReviewRows(rows = []) {
    return rows.map((review) => ({
      ...review,
      productName: productNameForReview(review)
    }));
  }
  function downloadCsv(filename, csv) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }
  function renderStats() {
    const revenue = orders.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
    const stats = document.getElementById("adminStats");
    if (!stats) return;
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-info"><h4>Total Users</h4><p class="stat-number">${users.length}</p></div></div>
      <div class="stat-card"><div class="stat-info"><h4>Total Sellers</h4><p class="stat-number">${sellers.length}</p></div></div>
      <div class="stat-card"><div class="stat-info"><h4>Total Orders</h4><p class="stat-number">${orders.length}</p></div></div>
      <div class="stat-card"><div class="stat-info"><h4>Total Revenue</h4><p class="stat-number">${revenue} EGP</p></div></div>`;
  }
  function pager(totalRows, page, targetId, cls) {
    const totalPages = Math.max(1, Math.ceil(totalRows / TABLE_PAGE_SIZE));
    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);
    return totalPages > 1
      ? `<div id="${targetId}" class="${cls}" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px;">
          <button class="btn btn-small btn-secondary table-page-btn" data-target="${targetId}" data-page="${prev}" ${page <= 1 ? "disabled" : ""}>Prev</button>
          <span>Page ${page} / ${totalPages}</span>
          <button class="btn btn-small btn-secondary table-page-btn" data-target="${targetId}" data-page="${next}" ${page >= totalPages ? "disabled" : ""}>Next</button>
        </div>`
      : "";
  }
  function renderUsers(q = "") {
    const tbody = document.getElementById("adminUsersTbody");
    const holder = document.getElementById("adminUsersPager");
    if (!tbody) return;
    const search = q.trim().toLowerCase();
    const rows = users.filter(u => !search || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search));
    const pageCount = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
    usersPage = Math.min(usersPage, pageCount);
    const start = (usersPage - 1) * TABLE_PAGE_SIZE;
    const paged = rows.slice(start, start + TABLE_PAGE_SIZE);
    tbody.innerHTML = paged.map(u => `
      <tr>
        <td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
        <td><span class="status-badge ${u.status === "BANNED" ? "pending" : "verified"}">${u.status || "ACTIVE"}</span></td>
        <td><button class="btn btn-small btn-danger admin-ban-user" data-id="${u.id}">${u.status === "BANNED" ? "Unban" : "Ban"}</button></td>
      </tr>`).join("") || '<tr><td colspan="6">No users found.</td></tr>';
    if (holder) holder.innerHTML = pager(rows.length, usersPage, "adminUsersPager", "admin-table-pager");
  }
  function renderSellers(q = "") {
    const tbody = document.getElementById("adminSellersTbody");
    const holder = document.getElementById("adminSellersPager");
    if (!tbody) return;
    const search = q.trim().toLowerCase();
    const rows = sellers.filter(s => !search || `${s.name} ${s.email} ${s.status || ""}`.toLowerCase().includes(search));
    const pageCount = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
    sellersPage = Math.min(sellersPage, pageCount);
    const start = (sellersPage - 1) * TABLE_PAGE_SIZE;
    const paged = rows.slice(start, start + TABLE_PAGE_SIZE);
    tbody.innerHTML = paged.map(s => `
      <tr>
        <td>${s.id}</td><td>${s.name}</td><td>${s.email}</td>
        <td><span class="status-badge ${String(s.status).toLowerCase() === "suspended" ? "pending" : "verified"}">${s.status || "active"}</span></td>
        <td><button class="btn btn-small btn-danger admin-suspend-seller" data-id="${s.id}">${String(s.status).toLowerCase() === "suspended" ? "Activate" : "Suspend"}</button></td>
      </tr>`).join("") || '<tr><td colspan="5">No sellers found.</td></tr>';
    if (holder) holder.innerHTML = pager(rows.length, sellersPage, "adminSellersPager", "admin-table-pager");
  }
  let activeAppForExport = null;

  function showAppDetails(app) {
    activeAppForExport = app;
    const body = document.getElementById("adminAppModalBody");
    if (!body) return;

    body.innerHTML = `
      <div class="app-detail-grid">
        <div class="app-detail-label">Brand Name</div>
        <div class="app-detail-value">${app.brandName || "-"}</div>

        <div class="app-detail-label">Description</div>
        <div class="app-detail-value">${app.brandDescription || "No description provided."}</div>

        <div class="app-detail-label">Category</div>
        <div class="app-detail-value">${app.brandCategory || "Not specified"}</div>

        <div class="app-detail-label">Owner Name</div>
        <div class="app-detail-value">${app.ownerName || "-"}</div>

        <div class="app-detail-label">Phone</div>
        <div class="app-detail-value">${app.ownerPhone || "-"}</div>

        <div class="app-detail-label">Email</div>
        <div class="app-detail-value">${app.sellerEmail || "-"}</div>

        <div class="app-detail-label">Bank Account</div>
        <div class="app-detail-value">${app.bankAccount || "Not provided"}</div>

        <div class="app-detail-label">Status</div>
        <div class="app-detail-value"><span class="status-badge ${app.status === "accepted" ? "verified" : (app.status === "rejected" ? "pending" : "active")}">${app.status}</span></div>

        <div class="app-detail-label">Applied Date</div>
        <div class="app-detail-value">${new Date(app.createdAt).toLocaleString()}</div>

        <div class="app-detail-label">License Document</div>
        <div class="app-detail-value">
          ${app.businessLicenseUrl ? `<a href="${app.businessLicenseUrl}" target="_blank" rel="noopener" style="color: var(--primary-color); font-weight: 700; text-decoration: none;">Open Uploaded Document</a>` : "No document uploaded"}
        </div>
      </div>
    `;

    const modal = document.getElementById("adminAppModal");
    if (modal) {
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeAppDetailsModal() {
    const modal = document.getElementById("adminAppModal");
    if (modal) {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
    activeAppForExport = null;
  }

  function exportAppAsTxt(app) {
    if (!app) return;
    const content = `SELLER APPLICATION DETAILS
----------------------------------
Brand Name:        ${app.brandName || "-"}
Description:       ${app.brandDescription || "No description provided."}
Category:          ${app.brandCategory || "Not specified"}
Owner Name:        ${app.ownerName || "-"}
Phone Number:      ${app.ownerPhone || "-"}
Email Address:     ${app.sellerEmail || "-"}
Bank Account Num:  ${app.bankAccount || "Not provided"}
Status:            ${app.status || "-"}
Applied Date:      ${new Date(app.createdAt).toLocaleString()}
License Doc URL:   ${app.businessLicenseUrl || "None"}
`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${String(app.brandName).replace(/[^a-z0-9]/gi, '_').toLowerCase()}-application.txt`;
    a.click();
  }

  function exportAppAsDoc(app) {
    if (!app) return;
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <meta charset="utf-8">
        <title>${app.brandName} Onboarding Application</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          h2 { color: #FF3366; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
          th { font-weight: 700; color: #666; width: 160px; text-transform: uppercase; font-size: 12px; }
          td { font-weight: 500; }
        </style>
      </head>
      <body>
        <h2>Seller Onboarding Application</h2>
        <table>
          <tr><th>Brand Name</th><td>${app.brandName || "-"}</td></tr>
          <tr><th>Description</th><td>${app.brandDescription || "-"}</td></tr>
          <tr><th>Category</th><td>${app.brandCategory || "Not specified"}</td></tr>
          <tr><th>Owner Name</th><td>${app.ownerName || "-"}</td></tr>
          <tr><th>Phone Number</th><td>${app.ownerPhone || "-"}</td></tr>
          <tr><th>Email Address</th><td>${app.sellerEmail || "-"}</td></tr>
          <tr><th>Bank Account</th><td>${app.bankAccount || "-"}</td></tr>
          <tr><th>Status</th><td>${app.status || "-"}</td></tr>
          <tr><th>Applied Date</th><td>${new Date(app.createdAt).toLocaleString()}</td></tr>
          <tr><th>License Document</th><td><a href="${app.businessLicenseUrl || '#'}">${app.businessLicenseUrl || 'No Document'}</a></td></tr>
        </table>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: "application/msword;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${String(app.brandName).replace(/[^a-z0-9]/gi, '_').toLowerCase()}-application.doc`;
    a.click();
  }

  function renderApplications() {
    const tbody = document.getElementById("adminApplicationsTbody");
    const holder = document.getElementById("adminApplicationsPager");
    if (!tbody) return;
    const pageCount = Math.max(1, Math.ceil(applications.length / TABLE_PAGE_SIZE));
    appsPage = Math.min(appsPage, pageCount);
    const start = (appsPage - 1) * TABLE_PAGE_SIZE;
    const paged = applications.slice(start, start + TABLE_PAGE_SIZE);
    tbody.innerHTML = paged.map(a => `
      <tr>
        <td>${a.brandName}</td>
        <td>${a.ownerName}</td>
        <td>${a.sellerEmail}</td>
        <td>${a.ownerPhone}</td>
        <td><span class="status-badge ${a.status === "accepted" ? "verified" : (a.status === "rejected" ? "pending" : "active")}">${a.status}</span></td>
        <td>${new Date(a.createdAt).toLocaleDateString()}</td>
        <td>
          ${a.status === "waiting" ? `<button class="btn btn-small btn-primary app-accept" data-id="${a._id}">Accept</button> <button class="btn btn-small btn-danger app-reject" data-id="${a._id}">Reject</button>` : "-"}
          <button class="btn btn-small btn-secondary app-details-btn" data-id="${a._id}">View Details</button>
          ${a.businessLicenseUrl ? `<a class="btn btn-small btn-secondary" href="${a.businessLicenseUrl}" target="_blank" rel="noopener">View License</a>` : ''}
        </td>
      </tr>`).join("") || '<tr><td colspan="7">No applications.</td></tr>';
    if (holder) holder.innerHTML = pager(applications.length, appsPage, "adminApplicationsPager", "admin-table-pager");
  }
  function renderReviews() {
    const tbody = document.getElementById("adminReviewsTbody");
    const holder = document.getElementById("adminReviewsPager");
    if (!tbody) return;
    const pageCount = Math.max(1, Math.ceil(reviews.length / TABLE_PAGE_SIZE));
    reviewsPage = Math.min(reviewsPage, pageCount);
    const start = (reviewsPage - 1) * TABLE_PAGE_SIZE;
    const paged = reviews.slice(start, start + TABLE_PAGE_SIZE);
    tbody.innerHTML = paged.map(r => `
      <tr>
        <td>${escapeHtml(productNameForReview(r))}</td>
        <td>${escapeHtml(r.userName || "Customer")}${r.userEmail ? `<br><small>${escapeHtml(r.userEmail)}</small>` : ""}</td>
        <td>${"★".repeat(Number(r.rating || 0)).padEnd(5, "☆")}</td>
        <td>${escapeHtml(r.comment || "-")}</td>
        <td><span class="status-badge ${r.status === "visible" ? "verified" : "pending"}">${escapeHtml(r.status)}</span></td>
        <td>
          <button class="btn btn-small btn-secondary review-status-btn" data-id="${r._id}" data-status="visible">Show</button>
          <button class="btn btn-small btn-danger review-status-btn" data-id="${r._id}" data-status="hidden">Hide</button>
          <button class="btn btn-small btn-secondary review-status-btn" data-id="${r._id}" data-status="reported">Mark Reported</button>
        </td>
      </tr>`).join("") || '<tr><td colspan="6">No reviews found.</td></tr>';
    if (holder) holder.innerHTML = pager(reviews.length, reviewsPage, "adminReviewsPager", "admin-table-pager");
  }
  function renderPayouts() {
    const select = document.getElementById("payoutSellerSelect");
    if (select) select.innerHTML = `<option value="">Select seller</option>${sellers.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}`;
    const tbody = document.getElementById("adminPayoutsTbody");
    if (!tbody) return;
    tbody.innerHTML = payouts.map(p => `<tr><td>${p.sellerName || p.sellerId}</td><td>${p.grossAmount || 0}</td><td>${p.commissionAmount || 0}</td><td>${p.amount || 0}</td><td>${p.status}</td><td>${p.status === "paid" ? "-" : `<button class="btn btn-small btn-primary payout-status-btn" data-id="${p._id}" data-status="paid">Mark Paid</button>`}</td></tr>`).join("") || '<tr><td colspan="6">No payouts.</td></tr>';
  }
  function renderAuditLogs() {
    const tbody = document.getElementById("adminAuditTbody");
    if (!tbody) return;
    tbody.innerHTML = auditLogs.map(a => `<tr><td>${new Date(a.createdAt).toLocaleString()}</td><td>${a.actorRole || "-"} ${a.actorId || ""}</td><td>${a.action}</td><td>${a.entityType || "-"} ${a.entityId || ""}</td><td>${a.message || ""}</td></tr>`).join("") || '<tr><td colspan="5">No audit logs.</td></tr>';
  }
  function renderSettings() {
    if (!settings) return;
    const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value ?? ""; };
    setVal("settingCommission", settings.commissionRate);
    setVal("settingPayoutHold", settings.payoutHoldDays);
    setVal("settingFreeShipping", settings.freeShippingThreshold);
    setVal("settingSupportEmail", settings.supportEmail);
    renderHeroMediaPreview(settings.heroBackgroundType || "default", settings.heroBackgroundUrl || "", settings.heroBackgroundOriginalName || "");
  }

  function absoluteMediaUrl(source) {
    const value = String(source || "").trim();
    if (!value) return "";
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith("/")) {
      try {
        return `${new URL(Api.baseUrl, window.location.origin).origin}${value}`;
      } catch {
        return value;
      }
    }
    return value;
  }

  function renderHeroMediaPreview(type = "default", source = "", label = "", isNewFile = false) {
    const preview = document.getElementById("heroMediaPreview");
    const status = document.getElementById("heroMediaStatus");
    const uploadBtn = document.getElementById("uploadHeroMediaBtn");
    if (!preview) return;
    const url = absoluteMediaUrl(source);
    if (!url || type === "default") {
      preview.innerHTML = `<span>No hero media uploaded.</span>`;
      if (status) status.textContent = "Upload JPG, PNG, WEBP, MP4, or WEBM.";
      if (uploadBtn) { uploadBtn.textContent = "Upload Hero Media"; uploadBtn.classList.remove("btn-success"); uploadBtn.classList.add("btn-primary"); }
      return;
    }
    if (type === "video") {
      preview.innerHTML = `<video src="${url}" autoplay loop muted playsinline controls></video>`;
    } else {
      preview.innerHTML = `<img src="${url}" alt="Current hero background preview">`;
    }
    if (isNewFile) {
      if (status) { status.textContent = `✓ New file ready: ${label}`; status.style.color = "#22c55e"; }
      if (uploadBtn) { uploadBtn.textContent = "⬆ Upload New Hero Media"; uploadBtn.classList.remove("btn-primary"); uploadBtn.classList.add("btn-success"); }
    } else {
      if (status) { status.textContent = label ? `Current media: ${label} (already active)` : "Current hero media is active."; status.style.color = ""; }
      if (uploadBtn) { uploadBtn.textContent = "Upload Hero Media"; uploadBtn.classList.remove("btn-success"); uploadBtn.classList.add("btn-primary"); }
    }
  }
  async function refreshData() {
    const [productsRes, sellersRes, usersRes, ordersRes, appRes, reviewRes, payoutRes, auditRes, settingsRes] = await Promise.all([
      Api.getProducts({ page: 1, limit: 500 }),
      Api.getSellers({ page: 1, limit: 500 }),
      Api.getUsersAdmin({ page: 1, limit: 500 }),
      Api.getOrders({ page: 1, limit: 500 }),
      Api.getSellerApplications({ page: 1, limit: 500 }),
      Api.getReviewsAdmin({ page: 1, limit: 500 }),
      Api.getPayouts({ page: 1, limit: 500 }),
      Api.getAuditLogs({ page: 1, limit: 100 }),
      Api.getAdminSettings()
    ]);
    products = productsRes.items || [];
    sellers = (sellersRes.items || []).map(s => ({ ...s, id: String(s._id || s.id) }));
    users = (usersRes.items || []).map(u => ({ ...u, id: String(u._id || u.id) }));
    orders = ordersRes.items || [];
    applications = appRes.items || [];
    reviews = normalizeReviewRows(reviewRes.items || []);
    payouts = payoutRes.items || [];
    auditLogs = auditRes.items || [];
    settings = settingsRes;
  }

  function wireTabs() {
    const navLinks = document.querySelectorAll("[data-tab]");
    const tabs = document.querySelectorAll(".admin-tab");
    navLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const id = link.getAttribute("data-tab");
        navLinks.forEach(n => n.classList.remove("active"));
        tabs.forEach(t => { t.classList.remove("active"); t.style.display = "none"; });
        link.classList.add("active");
        const tab = document.getElementById(id);
        if (tab) { tab.classList.add("active"); tab.style.display = "block"; }
      });
    });
  }

  document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    DB.logout();
    Api.setToken("");
    window.location.href = "/";
  });
  document.getElementById("adminUserSearch")?.addEventListener("input", (e) => renderUsers(e.target.value));
  document.getElementById("adminSellerSearch")?.addEventListener("input", (e) => renderSellers(e.target.value));
  document.getElementById("adminReviewStatus")?.addEventListener("change", async (e) => {
    const payload = await Api.getReviewsAdmin({ page: 1, limit: 500, status: e.target.value });
    reviews = normalizeReviewRows(payload.items || []);
    reviewsPage = 1;
    renderReviews();
  });

  document.getElementById("promoteAdminBtn")?.addEventListener("click", async () => {
    const emailInput = document.getElementById("promoteAdminEmail");
    const email = emailInput?.value.trim();
    if (!email) return showToast("Please enter an email to promote.", "error");
    if (!confirm(`Are you sure you want to make ${email} an admin?`)) return;
    
    try {
      const res = await Api.promoteToAdmin(email);
      showToast(res.message || "User promoted to admin.", "success");
      emailInput.value = "";
      await refreshData();
      renderUsers(document.getElementById("adminUserSearch")?.value || "");
    } catch (err) {
      showToast(err.message || "Failed to promote user.", "error");
    }
  });

    document.addEventListener("click", async (e) => {
    const tablePageBtn = e.target.closest(".table-page-btn");
    if (tablePageBtn) {
      const target = tablePageBtn.dataset.target;
      const page = Number(tablePageBtn.dataset.page || 1);
      if (target === "adminUsersPager") usersPage = page;
      if (target === "adminSellersPager") sellersPage = page;
      if (target === "adminApplicationsPager") appsPage = page;
      if (target === "adminReviewsPager") reviewsPage = page;
      renderUsers(document.getElementById("adminUserSearch")?.value || "");
      renderSellers(document.getElementById("adminSellerSearch")?.value || "");
      renderApplications();
      renderReviews();
      return;
    }
    const banBtn = e.target.closest(".admin-ban-user");
    if (banBtn) {
      const id = String(banBtn.dataset.id);
      const target = users.find(u => u.id === id);
      if (!target) return;
      const nextStatus = target.status === "BANNED" ? "ACTIVE" : "BANNED";
      if (!confirm(`${nextStatus === "BANNED" ? "Ban" : "Unban"} user ${target.email}?`)) return;
      await Api.setUserStatus(id, nextStatus);
      users = users.map(u => u.id === id ? { ...u, status: nextStatus } : u);
      renderUsers(document.getElementById("adminUserSearch")?.value || "");
      return;
    }
    const suspendBtn = e.target.closest(".admin-suspend-seller");
    if (suspendBtn) {
      const id = String(suspendBtn.dataset.id);
      const seller = sellers.find(s => s.id === id);
      if (!seller) return;
      const nextStatus = String(seller.status).toLowerCase() === "suspended" ? "active" : "suspended";
      if (!confirm(`${nextStatus === "suspended" ? "Suspend" : "Activate"} seller ${seller.name}?`)) return;
      await Api.updateSeller(id, { status: nextStatus });
      sellers = sellers.map(s => s.id === id ? { ...s, status: nextStatus } : s);
      renderSellers(document.getElementById("adminSellerSearch")?.value || "");
      return;
    }
    const acceptBtn = e.target.closest(".app-accept");
    if (acceptBtn) {
      if (!confirm("Accept this seller application?")) return;
      await Api.reviewSellerApplication(acceptBtn.dataset.id, "accept");
      applications = (await Api.getSellerApplications({ page: 1, limit: 500 })).items || [];
      sellers = ((await Api.getSellers({ page: 1, limit: 500 })).items || []).map(s => ({ ...s, id: String(s._id || s.id) }));
      renderApplications();
      renderSellers(document.getElementById("adminSellerSearch")?.value || "");
      return;
    }
    const rejectBtn = e.target.closest(".app-reject");
    if (rejectBtn) {
      if (!confirm("Reject this seller application?")) return;
      await Api.reviewSellerApplication(rejectBtn.dataset.id, "reject");
      applications = (await Api.getSellerApplications({ page: 1, limit: 500 })).items || [];
      renderApplications();
      return;
    }
    const reviewBtn = e.target.closest(".review-status-btn");
    if (reviewBtn) {
      const status = String(reviewBtn.dataset.status || "");
      await Api.updateReviewStatus(reviewBtn.dataset.id, status);
      const payload = await Api.getReviewsAdmin({ page: 1, limit: 500, status: document.getElementById("adminReviewStatus")?.value || "" });
      reviews = normalizeReviewRows(payload.items || []);
      renderReviews();
      return;
    }
    const payoutBtn = e.target.closest(".payout-status-btn");
    if (payoutBtn) {
      await Api.updatePayoutStatus(payoutBtn.dataset.id, payoutBtn.dataset.status);
      payouts = (await Api.getPayouts({ page: 1, limit: 500 })).items || [];
      renderPayouts();
      return;
    }
    const appDetailsBtn = e.target.closest(".app-details-btn");
    if (appDetailsBtn) {
      const id = String(appDetailsBtn.dataset.id);
      const app = applications.find(a => String(a._id) === id);
      if (app) showAppDetails(app);
      return;
    }
  });

  document.getElementById("createPayoutBtn")?.addEventListener("click", async () => {
    const sellerId = document.getElementById("payoutSellerSelect")?.value || "";
    const amount = Number(document.getElementById("payoutAmountInput")?.value || 0);
    await Api.createPayout({ sellerId, amount });
    payouts = (await Api.getPayouts({ page: 1, limit: 500 })).items || [];
    renderPayouts();
  });
  document.getElementById("saveSettingsBtn")?.addEventListener("click", async () => {
    settings = await Api.updateAdminSettings({
      commissionRate: Number(document.getElementById("settingCommission")?.value || 0),
      payoutHoldDays: Number(document.getElementById("settingPayoutHold")?.value || 0),
      freeShippingThreshold: Number(document.getElementById("settingFreeShipping")?.value || 0),
      supportEmail: document.getElementById("settingSupportEmail")?.value || ""
    });
    renderSettings();
    showToast("Settings saved.", "success");
  });

  let selectedHeroFile = null;

  document.getElementById("settingHeroMedia")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      selectedHeroFile = null;
      return renderSettings();
    }
    selectedHeroFile = file;
    const type = file.type.startsWith("video/") ? "video" : "image";
    renderHeroMediaPreview(type, URL.createObjectURL(file), file.name, true);
  });

  document.getElementById("uploadHeroMediaBtn")?.addEventListener("click", async () => {
    const file = selectedHeroFile;
    if (!file) {
      const hasExisting = settings && settings.heroBackgroundType && settings.heroBackgroundType !== "default" && settings.heroBackgroundUrl;
      if (hasExisting) {
        return showToast("Your hero background is already active. Use the file picker above to select a new file if you want to change it.", "info");
      }
      return showToast("Select an image or video file first using the file picker above.", "warning");
    }
    try {
      settings = await Api.uploadAdminHeroBackground(file);
      selectedHeroFile = null;
      const input = document.getElementById("settingHeroMedia");
      if (input) input.value = "";
      renderSettings();
      showToast("Hero background uploaded successfully!", "success");
    } catch (err) {
      showToast(err?.message || "Failed to upload hero background.", "error");
    }
  });

  document.getElementById("resetHeroMediaBtn")?.addEventListener("click", async () => {
    settings = await Api.updateAdminSettings({ heroBackgroundType: "default" });
    const input = document.getElementById("settingHeroMedia");
    if (input) input.value = "";
    renderSettings();
    showToast("Default hero background restored.", "success");
  });

  document.getElementById("exportUsersBtn")?.addEventListener("click", () => {
    downloadCsv("niledrip-users.csv", toCsv(["User ID", "Name", "Email", "Role", "Status"], users.map(u => [u.id, u.name, u.email, u.role, u.status || "ACTIVE"])));
  });
  document.getElementById("exportSellersBtn")?.addEventListener("click", () => {
    downloadCsv("niledrip-sellers.csv", toCsv(["Seller ID", "Name", "Email", "Status"], sellers.map(s => [s.id, s.name, s.email, s.status || "active"])));
  });
  document.getElementById("exportOrdersBtn")?.addEventListener("click", () => {
    downloadCsv("niledrip-orders.csv", toCsv(["Order ID", "Product ID", "Seller ID", "User ID", "Qty", "Total", "Status", "Payment", "Date"], orders.map(o => [o.id, o.productId, o.sellerId, o.userId, o.quantity, o.totalPrice, o.status, o.paymentStatus || "unpaid", o.createdAt])));
  });
  document.getElementById("exportProductsBtn")?.addEventListener("click", () => {
    downloadCsv("niledrip-products.csv", toCsv(["Product ID", "Seller ID", "Name", "Category", "Subcategory", "Price"], products.map(p => [p._id || p.id, p.sellerId, p.name, p.category, p.subcategory, p.price])));
  });
  document.getElementById("exportReviewsBtn")?.addEventListener("click", () => {
    downloadCsv("niledrip-reviews.csv", toCsv(["Review ID", "Product", "Customer", "Rating", "Status", "Comment"], reviews.map(r => [r._id, productNameForReview(r), r.userEmail || r.userName, r.rating, r.status, r.comment])));
  });

  document.getElementById("adminAppModalCloseBtn")?.addEventListener("click", closeAppDetailsModal);
  document.getElementById("adminAppModalBackdrop")?.addEventListener("click", closeAppDetailsModal);
  document.getElementById("exportAppTxtBtn")?.addEventListener("click", () => {
    if (activeAppForExport) exportAppAsTxt(activeAppForExport);
  });
  document.getElementById("exportAppDocBtn")?.addEventListener("click", () => {
    if (activeAppForExport) exportAppAsDoc(activeAppForExport);
  });

  wireTabs();
  try {
    await refreshData();
    renderStats();
    renderUsers();
    renderSellers();
    renderApplications();
    renderReviews();
    renderPayouts();
    renderAuditLogs();
    renderSettings();
  } catch (err) {
    alert(err?.message || "Failed to load admin dashboard data.");
  }
})();
