const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validateForm(loginForm)) return;
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const email = document.getElementById("loginEmail")?.value.trim().toLowerCase();
        const password = document.getElementById("loginPassword")?.value || "";
        try {
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Logging in..."; }
            const { token, user } = await Api.login({ email, password });
            Api.setToken(token);
            DB.setCurrentUser(user);
            if (user.role === "seller") window.location.href = "/seller-dashboard";
            else if (user.role === "admin") window.location.href = "/admin";
            else window.location.href = "/shop";
        } catch (err) {
            showToast(err.message || "Invalid credentials.", "error");
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Login"; }
        }
    });
}

document.getElementById("googleLoginBtn")?.addEventListener("click", () => {
    window.location.href = Api.googleAuthUrl("/shop");
});

document.getElementById("forgotPasswordBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail")?.value.trim().toLowerCase() || prompt("Enter your email") || "";
    if (!validateEmail(email)) return showToast("Enter a valid email first.", "error");
    await Api.forgotPassword(email);
    showToast("If the account exists, a reset link was sent. Check the backend console in local dev.", "success", 6000);
});

document.getElementById("resendVerifyBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail")?.value.trim().toLowerCase() || prompt("Enter your email") || "";
    if (!validateEmail(email)) return showToast("Enter a valid email first.", "error");
    await Api.resendVerification(email);
    showToast("If the account exists, a verification link was sent. Check the backend console in local dev.", "success", 6000);
});
