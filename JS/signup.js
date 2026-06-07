const signupForm = document.getElementById("signupForm");
const signupPasswordInput = document.getElementById("signupPassword");
const signupConfirmPasswordInput = document.getElementById("signupConfirmPassword");
const signupPasswordError = document.getElementById("signupPasswordError");
const signupConfirmPasswordError = document.getElementById("signupConfirmPasswordError");
const passwordStrength = document.getElementById("passwordStrength");
const passwordStrengthLabel = document.getElementById("passwordStrengthLabel");
const passwordStrengthHint = document.getElementById("passwordStrengthHint");

const setFieldError = (el, message) => {
    if (typeof showError === "function") showError(el, message);
    else if (el) el.textContent = message;
};

const clearFieldError = (el) => {
    if (typeof clearError === "function") clearError(el);
    else if (el) el.textContent = "";
};

function passwordStrengthDetails(password) {
    const value = String(password || "");
    if (!value) {
        return {
            state: "",
            label: "Password strength",
            hint: "Use 8+ characters with letters, numbers, and a symbol."
        };
    }

    const score = typeof getPasswordStrength === "function" ? getPasswordStrength(value) : 1;
    const missing = [];
    if (value.length < 8) missing.push("8+ characters");
    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) missing.push("upper and lower case");
    if (!/\d/.test(value)) missing.push("a number");
    if (!/[^A-Za-z0-9]/.test(value)) missing.push("a symbol");

    if (score >= 4) return { state: "strong", label: "Strong", hint: "Strong password." };
    if (score >= 2) return { state: "medium", label: "Medium", hint: missing.length ? `Add ${missing.slice(0, 2).join(" and ")}.` : "Almost there." };
    return { state: "weak", label: "Weak", hint: missing.length ? `Add ${missing.slice(0, 2).join(" and ")}.` : "Make it harder to guess." };
}

function updatePasswordStrength() {
    if (!signupPasswordInput || !passwordStrength) return;
    const details = passwordStrengthDetails(signupPasswordInput.value);
    if (details.state) passwordStrength.dataset.strength = details.state;
    else passwordStrength.removeAttribute("data-strength");
    if (passwordStrengthLabel) passwordStrengthLabel.textContent = details.label;
    if (passwordStrengthHint) passwordStrengthHint.textContent = details.hint;
}

function validateConfirmPassword(showMessage = false) {
    if (!signupPasswordInput || !signupConfirmPasswordInput) return true;
    const password = signupPasswordInput.value || "";
    const confirmPassword = signupConfirmPasswordInput.value || "";

    signupConfirmPasswordInput.setCustomValidity("");
    if (!confirmPassword) {
        clearFieldError(signupConfirmPasswordError);
        return !showMessage;
    }

    if (password !== confirmPassword) {
        signupConfirmPasswordInput.setCustomValidity("Passwords do not match.");
        setFieldError(signupConfirmPasswordError, "Passwords do not match.");
        return false;
    }

    clearFieldError(signupConfirmPasswordError);
    return true;
}

if (signupForm) {
    updatePasswordStrength();

    signupPasswordInput?.addEventListener("input", () => {
        updatePasswordStrength();
        if (validatePassword(signupPasswordInput.value)) clearFieldError(signupPasswordError);
        validateConfirmPassword();
    });

    signupConfirmPasswordInput?.addEventListener("input", () => {
        validateConfirmPassword();
    });

    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        updatePasswordStrength();
        const passwordsMatch = validateConfirmPassword(true);
        if (!validateForm(signupForm)) return;
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        const name = document.getElementById("signupName")?.value.trim() || "User";
        const email = document.getElementById("signupEmail")?.value.trim().toLowerCase() || "";
        const password = document.getElementById("signupPassword")?.value || "";
        const confirmPassword = document.getElementById("signupConfirmPassword")?.value || "";
        
        if (!validateEmail(email)) return showToast("Please enter a valid email.", "error");
        if (!validatePassword(password)) {
            setFieldError(signupPasswordError, "Password must be at least 8 characters.");
            return showToast("Password must be at least 8 characters.", "error");
        }
        if (!passwordsMatch || password !== confirmPassword) {
            setFieldError(signupConfirmPasswordError, "Passwords do not match.");
            signupConfirmPasswordInput?.focus();
            return showToast("Passwords do not match.", "error");
        }
        
        try {
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating..."; }
            const { token, user } = await Api.signup({ name, email, password, role: "user" });
            Api.setToken(token);
            DB.setCurrentUser(user);
            window.location.href = "/shop";
        } catch (err) {
            showToast(err.message || "Signup failed.", "error");
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Create Account"; }
        }
    });
}

document.getElementById("googleSignupBtn")?.addEventListener("click", () => {
    window.location.href = Api.googleAuthUrl("/shop");
});
