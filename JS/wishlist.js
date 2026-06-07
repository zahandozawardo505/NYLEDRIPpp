(function () {
    const grid = document.getElementById("wishlistGrid");
    const empty = document.getElementById("wishlistEmpty");
    function render() {
        const wishlist = DB.getWishlist();
        if (!grid) return;
        if (!wishlist.length) {
            empty && (empty.style.display = "block");
            grid.innerHTML = "";
            return;
        }
        empty && (empty.style.display = "none");
        grid.innerHTML = wishlist.map(p => `
            <article class="product-card">
                <a href="/product?id=${p.productId}" class="product-image-link"><img src="${p.image || ""}" alt="${p.name}"></a>
                <div class="card-info">
                    <h3>${p.name}</h3><p>${p.price} EGP</p>
                    <div class="shop-card-actions">
                        <button class="btn btn-primary move-to-cart" data-id="${p.productId}">Move to Cart</button>
                        <button class="btn btn-danger remove-wishlist" data-id="${p.productId}">Remove</button>
                    </div>
                </div>
            </article>`).join("");
        updateNavbarBadges();
    }
    document.addEventListener("click", (e) => {
        const id = e.target.dataset.id;
        if (e.target.closest(".remove-wishlist")) {
            DB.saveWishlist(DB.getWishlist().filter(x => x.productId !== id));
            return render();
        }
        if (e.target.closest(".move-to-cart")) {
            const item = DB.getWishlist().find(x => x.productId === id);
            if (!item) return;
            const cart = DB.getCart();
            cart.push({ productId: item.productId, sellerId: item.sellerId, name: item.name, price: item.price, image: item.image, selectedColor: "Default", selectedSize: "M", quantity: 1 });
            DB.saveCart(cart);
            DB.saveWishlist(DB.getWishlist().filter(x => x.productId !== id));
            render();
        }
    });
    render();
})();
