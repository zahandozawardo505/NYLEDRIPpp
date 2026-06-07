(function () {
    const form      = document.getElementById('sellerForm');
    const nextBtn   = document.getElementById('nextBtn');
    const prevBtn   = document.getElementById('prevBtn');
    const submitBtn = document.getElementById('submitBtn');
    const stepDots  = document.querySelectorAll('.step-dot');

    let currentStep = 1;
    const totalSteps = 3;

    // --- Pop-Up Generator ---
    function showPopUp(titleText, messages, isSuccess = false) {
        let overlay = document.getElementById('modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal-box">
                    <h3 id="modal-title"></h3>
                    <ul id="modal-list"></ul>
                    <button type="button" id="modal-close" class="btn btn-primary">Got it</button>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('modal-close').onclick = () => overlay.classList.remove('visible');
        }

        const title = document.getElementById('modal-title');
        const list = document.getElementById('modal-list');
        
        title.innerText = titleText;
        title.style.color = isSuccess ? '#2ecc71' : 'var(--primary-color)';
        
        list.innerHTML = '';
        messages.forEach(msg => {
            const li = document.createElement('li');
            li.innerText = msg;
            list.appendChild(li);
        });

        overlay.classList.add('visible');
    }

    // --- Full Validation Logic ---
    function validateStep(step) {
        let errors = [];

        if (step === 1) {
            const brand = document.getElementById('brandName').value.trim();
            const desc = document.getElementById('brandDescription').value.trim();
            const owner = document.getElementById('ownerName').value.trim();
            const phone = document.getElementById('ownerPhone').value.trim();

            if (brand.length < 2) errors.push("Enter a valid Brand Name.");
            if (desc.length < 15) errors.push("Description should be at least 15 characters.");
            if (owner.length < 3) errors.push("Please enter the Owner's Full Name.");
            
            // Phone: Digits only, 10-15 chars
            if (!/^\d+$/.test(phone)) {
                errors.push("Phone number must contain only digits.");
            } else if (phone.length < 10 || phone.length > 15) {
                errors.push("Phone number must be between 10 and 15 digits.");
            }
        }

        if (step === 2) {
            const email = document.getElementById('sellerEmail').value.trim();
            const license = document.getElementById('businessLicense').value;
            const bank = document.getElementById('bankAccount').value.trim();
            const pass = document.getElementById('sellerPassword').value;
            const confirm = document.getElementById('confirmSellerPassword').value;

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid Email is required.");
            if (!license) errors.push("Please upload your Business License or ID.");
            if (bank.length < 8) errors.push("Enter a valid Bank Account number.");
            if (!pass || pass.length < 8) errors.push("Password must be at least 8 characters.");
            if (pass !== confirm) errors.push("Password confirmation does not match.");
        }

        if (step === 3) {
            if (!document.getElementById('termsCheck').checked) errors.push("Agree to Terms & Conditions.");
            if (!document.getElementById('authenticityCheck').checked) errors.push("Confirm product authenticity.");
        }

        if (errors.length > 0) {
            showPopUp("Wait a second...", errors);
            return false;
        }
        return true;
    }

    function updateStepUI(n) {
        document.querySelectorAll('.form-step').forEach((step, i) => {
            step.classList.toggle('active', i + 1 === n);
        });
        stepDots.forEach((dot, i) => {
            dot.classList.toggle('active', i + 1 <= n);
        });
        
        if (prevBtn) prevBtn.style.display = n > 1 ? 'inline-block' : 'none';
        if (nextBtn) nextBtn.style.display = n < totalSteps ? 'inline-block' : 'none';
        if (submitBtn) submitBtn.style.display = n === totalSteps ? 'inline-block' : 'none';
    }

    nextBtn?.addEventListener('click', () => {
        if (validateStep(currentStep)) {
            currentStep++;
            updateStepUI(currentStep);
        }
    });

    prevBtn?.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateStepUI(currentStep);
        }
    });

    form?.addEventListener('submit', async e => {
        e.preventDefault();
        if (validateStep(currentStep)) {
            const formData = new FormData(form);
            const brandName = String(formData.get('brandName') || '').trim();
            const sellerEmail = String(formData.get('email') || '').trim().toLowerCase();
            const password = String(formData.get('sellerPassword') || '').trim();
            const licenseFile = document.getElementById('businessLicense')?.files?.[0] || null;
            try {
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Submitting...';
                }
                if (!licenseFile) throw new Error('Business license document is required.');
                const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
                if (!allowedTypes.has(licenseFile.type)) {
                    throw new Error('Only PDF, JPG, PNG, and WEBP files are allowed.');
                }
                if (licenseFile.size > 5 * 1024 * 1024) {
                    throw new Error('File is too large. Maximum size is 5MB.');
                }
                await Api.applySellerWithFile({
                    brandName,
                    brandDescription: String(formData.get('brandDescription') || ''),
                    brandCategory: '',
                    ownerName: String(formData.get('ownerName') || ''),
                    ownerPhone: String(formData.get('ownerPhone') || ''),
                    sellerEmail,
                    password,
                    bankAccount: String(formData.get('bankAccount') || '')
                }, licenseFile);
                showPopUp("Success!", ["Application submitted with status: waiting. Admin review is required before login."], true);
                form.reset();
                currentStep = 1;
                updateStepUI(1);
            } catch (err) {
                showPopUp("Error", [err.message || "Failed to create seller account"]);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit Application';
                }
            }
        }
    });

    // --- ID / Business License Preview Logic ---
    const licenseInput = document.getElementById('businessLicense');
    const licenseLabel = document.getElementById('businessLicenseLabel');
    const previewContainer = document.getElementById('licensePreviewContainer');
    const previewContent = document.getElementById('licensePreviewContent');
    const removeBtn = document.getElementById('removeLicenseBtn');
    let previewObjectUrl = null;

    function resetLicenseField() {
        if (licenseInput) licenseInput.value = '';
        if (licenseLabel) licenseLabel.textContent = "Upload your business license or national ID";
        if (previewContent) previewContent.innerHTML = '';
        if (previewContainer) previewContainer.style.display = 'none';
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
    }

    licenseInput?.addEventListener('change', () => {
        const file = licenseInput.files?.[0];
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
        if (!file) {
            resetLicenseField();
            return;
        }

        if (licenseLabel) {
            licenseLabel.textContent = `Selected: ${file.name}`;
        }
        if (previewContainer) {
            previewContainer.style.display = 'block';
        }

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (previewContent) {
                    previewContent.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 250px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);" alt="Document Preview">`;
                }
            };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            previewObjectUrl = URL.createObjectURL(file);
            if (previewContent) {
                previewContent.innerHTML = `
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px; background: var(--bg-primary); border-radius: 12px; border: 1px solid var(--border-color);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <div style="text-align: left; min-width: 0;">
                                <span style="font-weight: 700; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: var(--text-primary);">${file.name}</span>
                                <span style="font-size: 12px; color: var(--text-secondary);">${(file.size / 1024 / 1024).toFixed(2)} MB (PDF)</span>
                            </div>
                        </div>
                        <iframe src="${previewObjectUrl}" style="width: 100%; height: 300px; border: 1px solid var(--border-color); border-radius: 12px; background: #fff;"></iframe>
                    </div>
                `;
            }
        } else {
            if (previewContent) {
                previewContent.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--bg-primary); border-radius: 12px; border: 1px solid var(--border-color);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <div style="text-align: left;">
                            <span style="font-weight: 700; display: block; font-size: 14px; color: var(--text-primary);">${file.name}</span>
                            <span style="font-size: 12px; color: var(--text-secondary);">${(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                    </div>
                `;
            }
        }
    });

    removeBtn?.addEventListener('click', resetLicenseField);

    document.querySelectorAll('[data-checkbox-card]').forEach(card => {
        card.addEventListener('click', event => {
            if (event.target.closest('a') || event.target.matches('input,label')) return;
            const checkbox = document.getElementById(card.dataset.checkboxCard);
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });

    updateStepUI(1);
})();
