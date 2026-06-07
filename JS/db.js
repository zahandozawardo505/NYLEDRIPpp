const CATEGORY_TREE = {
    Tops: ["T-Shirts", "Shirts", "Polo Shirts", "Tank Tops"],
    Bottoms: ["Pants", "Trousers", "Jeans", "Sweatpants", "Shorts", "Skirts"],
    "Hoodies & Sweatshirts": ["Hoodies", "Sweatshirts", "Zip Hoodies"],
    Jackets: ["Jackets", "Coats", "Blazers", "Vests"],
    Shoes: ["Sneakers", "Boots", "Sandals", "Formal Shoes"],
    Accessories: ["Caps", "Bags", "Belts", "Watches", "Sunglasses"]
};
const GENDERS = ["Men", "Women", "Unisex"];
const KEYS = {
    products: "niledrip_products",
    users: "niledrip_users",
    sellers: "niledrip_sellers",
    orders: "niledrip_orders",
    cart: "niledrip_cart",
    wishlist: "niledrip_wishlist",
    currentUser: "niledrip_current_user",
    applications: "niledrip_applications"
};
const CART_RESET_FLAG = "niledrip_cart_reset_v1";
const DEMO_PURGE_FLAG = "niledrip_demo_purge_v1";

function nowISO() { return new Date().toISOString(); }
function toId(v) { return String(v ?? ""); }
function toNum(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function read(key, fallback) { return Store.get(key, fallback); }
function write(key, value) { Store.set(key, value); return value; }
function emitState() { window.dispatchEvent(new Event("db:changed")); }
let cartSyncTimer = null;
let wishlistSyncTimer = null;
async function safeSyncUserState(kind, items) {
    try {
        if (typeof Api === "undefined" || !Api.token || !Api.token()) return;
        const current = DB.getCurrentUser?.();
        if (!current || !["user", "admin"].includes(String(current.role || "").toLowerCase())) return;
        if (kind === "cart" && typeof Api.updateMyCart === "function") await Api.updateMyCart(items);
        if (kind === "wishlist" && typeof Api.updateMyWishlist === "function") await Api.updateMyWishlist(items);
    } catch {}
}
function scheduleStateSync(kind, items) {
    if (kind === "cart") {
        clearTimeout(cartSyncTimer);
        cartSyncTimer = setTimeout(() => { safeSyncUserState("cart", items); }, 350);
        return;
    }
    if (kind === "wishlist") {
        clearTimeout(wishlistSyncTimer);
        wishlistSyncTimer = setTimeout(() => { safeSyncUserState("wishlist", items); }, 350);
    }
}
function normalizeProduct(input) {
    const createdAt = input.createdAt || nowISO();
    const variants = Array.isArray(input.variants) ? input.variants : [];
    return {
        id: toId(input.id || Date.now()),
        sellerId: toId(input.sellerId || "seller-1"),
        sellerName: input.sellerName || "NYLEDRIP Seller",
        sellerLogo: input.sellerLogo || "",
        name: input.name || "",
        description: input.description || "",
        gender: GENDERS.includes(input.gender) ? input.gender : "Unisex",
        category: input.category || "Tops",
        subcategory: input.subcategory || "T-Shirts",
        price: toNum(input.price, 0),
        cost: toNum(input.cost, 0),
        images: Array.isArray(input.images) ? input.images.filter(Boolean) : [input.image || "../assets/images/bmw.webp"],
        variants: variants.map(v => ({
            colorName: v.colorName || "Default",
            colorHex: v.colorHex || "#000000",
            sizes: Array.isArray(v.sizes) ? v.sizes.map(s => ({ size: s.size || "M", stock: Math.max(0, toNum(s.stock, 0)) })) : []
        })),
        createdAt,
        updatedAt: nowISO()
    };
}
function productTotalStock(product) {
    return (product.variants || []).reduce((sum, color) => {
        return sum + (color.sizes || []).reduce((s, size) => s + Math.max(0, toNum(size.stock, 0)), 0);
    }, 0);
}
function sanitizeCartItems(items) {
    if (!Array.isArray(items)) return [];
    const cleaned = items.map(item => {
        const pid = toId(item.productId || item.id);
        return {
            productId: pid,
            sellerId: toId(item.sellerId),
            name: item.name || "",
            price: toNum(item.price, 0),
            image: item.image || "",
            selectedColor: item.selectedColor || item.color || "Default",
            selectedSize: item.selectedSize || item.size || "M",
            quantity: Math.max(0, toNum(item.quantity, 0))
        };
    }).filter(item => {
        if (!item.productId || item.quantity <= 0) return false;
        return true;
    });
    return cleaned;
}
function generateOrderId(sellerId, productId) {
    const sellerCode = toId(sellerId).replace(/\D/g, "").slice(-4).padStart(4, "0");
    const productCode = toId(productId).replace(/\D/g, "").slice(-3).padStart(3, "0");
    const existing = new Set(read(KEYS.orders, []).map(o => toId(o.id)));
    let id = "";
    do {
        const seq = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
        id = `${sellerCode}${productCode}${seq}`;
    } while (existing.has(id));
    return id;
}

if (!read(CART_RESET_FLAG, false)) {
    write(KEYS.cart, []);
    write(CART_RESET_FLAG, true);
}
if (!read(DEMO_PURGE_FLAG, false)) {
    const demoNames = new Set(["Premium Hoodie", "Classic Tee"]);
    const products = read(KEYS.products, []);
    if (Array.isArray(products) && products.length) {
        write(KEYS.products, products.filter(p => !demoNames.has(String(p?.name || "").trim())));
    }
    write(DEMO_PURGE_FLAG, true);
}

const DB = {
    CATEGORY_TREE, GENDERS, productTotalStock, generateOrderId,
    getProducts() { return read(KEYS.products, []); },
    saveProducts(products) { write(KEYS.products, (products || []).map(normalizeProduct)); emitState(); },
    getProductById(id) { return this.getProducts().find(p => toId(p.id) === toId(id)) || null; },
    addProduct(product) { const list = this.getProducts(); const normalized = normalizeProduct(product); list.push(normalized); this.saveProducts(list); return normalized; },
    updateProduct(id, updatedProduct) { const list = this.getProducts().map(p => toId(p.id) === toId(id) ? normalizeProduct({ ...p, ...updatedProduct, id: p.id, createdAt: p.createdAt }) : p); this.saveProducts(list); },
    deleteProduct(id) { this.saveProducts(this.getProducts().filter(p => toId(p.id) !== toId(id))); },
    getUsers() { return read(KEYS.users, []); },
    saveUsers(users) { write(KEYS.users, users || []); emitState(); },
    getCurrentUser() { return read(KEYS.currentUser, null); },
    setCurrentUser(user) { write(KEYS.currentUser, user || null); emitState(); },
    logout() {
        Store.remove(KEYS.currentUser);
        Store.remove('nyledrip_token');
        emitState();
    },
    getSellers() { return read(KEYS.sellers, []); },
    saveSellers(sellers) { write(KEYS.sellers, sellers || []); emitState(); },
    getSellerById(id) { return this.getSellers().find(s => toId(s.id) === toId(id)) || null; },
    updateSeller(id, sellerData) { this.saveSellers(this.getSellers().map(s => toId(s.id) === toId(id) ? { ...s, ...sellerData } : s)); },
    getOrders() { return read(KEYS.orders, []); },
    saveOrders(orders) { write(KEYS.orders, orders || []); emitState(); },
    addOrder(order) { const orders = this.getOrders(); const next = { ...order, id: generateOrderId(order.sellerId, order.productId), createdAt: order.createdAt || nowISO() }; orders.push(next); this.saveOrders(orders); return next; },
    getCart() {
        const current = read(KEYS.cart, []);
        const cleaned = sanitizeCartItems(current);
        if (JSON.stringify(current) !== JSON.stringify(cleaned)) write(KEYS.cart, cleaned);
        return cleaned;
    },
    saveCart(cart) { const cleaned = sanitizeCartItems(cart || []); write(KEYS.cart, cleaned); emitState(); scheduleStateSync("cart", cleaned); },
    getWishlist() { return read(KEYS.wishlist, []); },
    saveWishlist(wishlist) { write(KEYS.wishlist, wishlist || []); emitState(); scheduleStateSync("wishlist", wishlist || []); },
    getApplications() { return read(KEYS.applications, []); },
    saveApplications(apps) { write(KEYS.applications, apps || []); emitState(); },
    save(key, value) { write(key, value); emitState(); },
    async syncUserStateFromBackend() {
        try {
            if (typeof Api === "undefined" || !Api.token || !Api.token()) return;
            const current = this.getCurrentUser();
            if (!current || !["user", "admin"].includes(String(current.role || "").toLowerCase())) return;
            const [wishlist, cart] = await Promise.all([
                typeof Api.getMyWishlist === "function" ? Api.getMyWishlist() : Promise.resolve([]),
                typeof Api.getMyCart === "function" ? Api.getMyCart() : Promise.resolve([])
            ]);
            if (Array.isArray(wishlist)) write(KEYS.wishlist, wishlist);
            if (Array.isArray(cart)) write(KEYS.cart, sanitizeCartItems(cart));
            emitState();
        } catch {}
    },
    get products() { return this.getProducts(); },
    get users() { return this.getUsers(); },
    get sellers() { return this.getSellers(); },
    get orders() { return this.getOrders(); },
    get cart() { return this.getCart(); },
    get wishlist() { return this.getWishlist(); },
    get applications() { return this.getApplications(); }
};
