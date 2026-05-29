let isRedirecting = false;

// Get auth token from localStorage (mock) or Firebase (real mode)
async function getAuthToken() {
  const mockToken = localStorage.getItem('mevzuat_mock_token');
  if (mockToken) return mockToken;

  if (typeof firebase !== 'undefined') {
    const user = firebase.auth().currentUser;
    if (user) {
      try {
        return await user.getIdToken(true); // Force refresh to handle expiry
      } catch (err) {
        if (!isRedirecting) {
          isRedirecting = true;
          localStorage.removeItem('mevzuat_logged_in');
          localStorage.removeItem('mevzuat_mock_token');
          localStorage.removeItem('mevzuat_mock_email');
          window.location.href = 'login.html';
        }
        return null;
      }
    }
  }
  return null;
}

async function loadPrices() {
  try {
    const res = await fetch('/api/stripe/prices');
    if (!res.ok) return;
    const prices = await res.json();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('starterPrice', prices.starter);
    set('proPrice', prices.pro);
    set('businessPrice', prices.business);
    set('customPrice', prices.custom);
  } catch (e) {
    // Fiyatlar yüklenemedi, placeholder kalır
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  loadPrices();

  // Check login status
  const isLoggedIn = localStorage.getItem('mevzuat_logged_in') === 'true' || localStorage.getItem('mevzuat_mock_token');
  const loginLink = document.getElementById('loginLink');
  const logoutBtn = document.getElementById('logoutBtn');

  if (!isLoggedIn) {
    if (loginLink) loginLink.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    return;
  }

  // User is logged in
  if (loginLink) loginLink.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'block';

  // Setup logout button
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.location.href = 'logout.html';
    });
  }

  // Fetch current subscription status
  let currentPlan = 'free';
  try {
    const token = await getAuthToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch('/api/subscription', { headers });
    if (response.ok) {
      const subData = await response.json();
      currentPlan = subData.plan || 'free';

      // Mark current plan card
      const planCards = document.querySelectorAll('.plan-card');
      planCards.forEach(card => {
        card.classList.remove('current');
      });

      const currentCard = document.getElementById(currentPlan + 'Plan');
      if (currentCard) {
        currentCard.classList.add('current');
      }
    } else if (response.status === 401) {
      if (!isRedirecting) {
        isRedirecting = true;
        window.location.href = 'login.html';
      }
    }
  } catch (err) {
    // Silently continue on network errors
  }

  // Error message handler
  const errorMessage = document.getElementById('errorMessage');
  function showError(msg) {
    if (errorMessage) {
      errorMessage.textContent = msg;
      errorMessage.style.display = 'block';
      setTimeout(() => {
        errorMessage.style.display = 'none';
      }, 5000);
    }
  }

  // Handle plan selection buttons
  const planButtons = document.querySelectorAll('.plan-action[data-plan]');
  planButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const plan = btn.dataset.plan;
      await createCheckoutSession(plan, null);
    });
  });

  // Handle custom pack amount input
  const customAmount = document.getElementById('customAmount');
  const customCreditsDisplay = document.getElementById('customCreditsDisplay');
  const customPackBtn = document.getElementById('customPackBtn');

  if (customAmount) {
    customAmount.addEventListener('input', () => {
      const amount = parseInt(customAmount.value) || 0;
      const credits = amount * 4;
      if (customCreditsDisplay) {
        customCreditsDisplay.textContent = `${credits} kredi alacaksınız`;
      }
    });
  }

  if (customPackBtn) {
    customPackBtn.addEventListener('click', async () => {
      const amount = parseInt(customAmount.value) || 0;
      if (amount < 1) {
        showError('Lütfen en az ₺1 girin.');
        return;
      }
      await createCheckoutSession(null, amount);
    });
  }

  // Create Stripe checkout session
  async function createCheckoutSession(planId, customAmount) {
    const btn = event?.target;
    if (!btn) {
      showError('Düğme referansı bulunamadı');
      return;
    }
    const originalText = btn.innerHTML;

    // Show loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span>';

    try {
      const token = await getAuthToken();
      if (!token) {
        showError('Oturum açınız.');
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
      }

      const payload = planId ? { planId } : { customAmount };
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = 'login.html';
          return;
        }
        let errorMsg = 'Checkout başlatılamadı.';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // JSON parse failed, use default message
        }
        showError(errorMsg);
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
      }

      let sessionData;
      try {
        sessionData = await response.json();
      } catch (e) {
        showError('Yanıt işlenemedi. Lütfen tekrar deneyin.');
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
      }
      const { sessionId, url } = sessionData;

      if (url) {
        // Redirect to Stripe checkout
        window.location.href = url;
      } else {
        showError('Checkout URL alınamadı.');
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      showError('Bir hata oluştu. Lütfen tekrar deneyin.');
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  // On return from Stripe checkout, show success message
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('checkout') === 'success') {
    errorMessage.textContent = '✓ Ödemeniz başarılı! Planınız güncellenmiştir. Sohbete dönebilirsiniz.';
    errorMessage.style.display = 'block';
    errorMessage.style.borderColor = 'var(--accent-green, #4dffa6)';
    errorMessage.style.background = 'rgba(77, 255, 166, 0.1)';
    errorMessage.style.color = 'var(--accent-green, #4dffa6)';

    // Refresh subscription info after 2 seconds
    setTimeout(async () => {
      try {
        const token = await getAuthToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch('/api/subscription', { headers });
        if (response.ok) {
          try {
            const subData = await response.json();
            location.reload();
          } catch (e) {
            location.reload();
          }
        } else if (response.status === 401) {
          if (!isRedirecting) {
            isRedirecting = true;
            window.location.href = 'login.html';
          }
        } else {
          // Non-401 error, reload to refresh state
          location.reload();
        }
      } catch (err) {
        // Network error, reload anyway to refresh UI
        location.reload();
      }
    }, 2000);
  }

  if (urlParams.get('cancel')) {
    showError('Ödeme iptal edildi. Daha sonra tekrar deneyebilirsiniz.');
  }
});
