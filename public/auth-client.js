// Authentication Client Script for Mevzuat AI
// Handles Login, Registration, and Google Sign-in with elegant error handling and Mock fallback

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // 1.5. Polyfill :has() selector for older browsers
  document.querySelectorAll('.input-icon-wrapper input').forEach(input => {
    input.addEventListener('focus', () => {
      input.closest('.input-icon-wrapper')?.classList.add('has-focus');
    });
    input.addEventListener('blur', () => {
      input.closest('.input-icon-wrapper')?.classList.remove('has-focus');
    });
  });

  // 2. DOM Elements
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const googleAuthBtn = document.getElementById('googleAuthBtn');
  const authErrorMsg = document.getElementById('authErrorMsg');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const mockAuthBadge = document.getElementById('mockAuthBadge');

  let isMockMode = true;

  // 3. Helper Functions
  function showError(msg) {
    if (!authErrorMsg) return;
    authErrorMsg.textContent = msg;
    authErrorMsg.style.display = 'block';
    
    // Smooth shake animation for high-end feel
    authErrorMsg.style.animation = 'none';
    setTimeout(() => {
      authErrorMsg.style.animation = 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both';
    }, 10);
  }

  function hideError() {
    if (!authErrorMsg) return;
    authErrorMsg.style.display = 'none';
  }

  function setSubmitting(submitting, text = 'Lütfen bekleyin...') {
    if (!authSubmitBtn) return;
    const btnText = authSubmitBtn.querySelector('span');
    const btnIcon = authSubmitBtn.querySelector('i');
    
    if (submitting) {
      authSubmitBtn.disabled = true;
      if (btnText) btnText.textContent = text;
      if (btnIcon) {
        btnIcon.setAttribute('data-lucide', 'loader-2');
        btnIcon.classList.add('animate-spin');
        lucide.createIcons();
      }
    } else {
      authSubmitBtn.disabled = false;
      if (btnText) btnText.textContent = loginForm ? 'Giriş Yap' : 'Kayıt Ol';
      if (btnIcon) {
        btnIcon.setAttribute('data-lucide', 'arrow-right');
        btnIcon.classList.remove('animate-spin');
        lucide.createIcons();
      }
    }
  }

  function translateAuthError(error) {
    if (!error) return 'Bilinmeyen bir hata oluştu.';
    const code = error.code || '';
    const message = error.message || '';

    switch (code) {
      case 'auth/invalid-email':
        return 'Geçersiz bir e-posta adresi girdiniz.';
      case 'auth/user-disabled':
        return 'Bu hesap askıya alınmıştır.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'E-posta adresi veya şifre hatalı.';
      case 'auth/email-already-in-use':
        return 'Bu e-posta adresi zaten kullanımda.';
      case 'auth/operation-not-allowed':
        return 'Bu giriş yöntemine şu anda izin verilmiyor.';
      case 'auth/weak-password':
        return 'Şifreniz çok zayıf. Lütfen en az 6 karakterli bir şifre belirleyin.';
      case 'auth/popup-closed-by-user':
        return 'Giriş penceresi kapatıldı.';
      default:
        return message || 'Bir kimlik doğrulama hatası oluştu.';
    }
  }

  // 4. Initialize Firebase Configuration
  try {
    const configRes = await fetch('/api/config');
    const config = await configRes.json();

    if (config.projectId) {
      isMockMode = false;
      if (mockAuthBadge) mockAuthBadge.style.display = 'none';

      // Initialize Firebase App
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      // Check current auth status (if logged in and on auth page, redirect to index)
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
          localStorage.setItem('mevzuat_logged_in', 'true');
          const currentPage = window.location.pathname.split('/').pop() || 'index.html';
          if (currentPage === 'login.html' || currentPage === 'register.html' || currentPage === 'logout.html') {
            window.location.href = 'index.html';
          }
        }
      });
    } else {
      console.warn('Firebase setup missing. Operating in Mock mode.');
      isMockMode = true;
      if (mockAuthBadge) mockAuthBadge.style.display = 'flex';
    }
  } catch (err) {
    console.error('Failed to configure auth client:', err);
    isMockMode = true;
    if (mockAuthBadge) mockAuthBadge.style.display = 'flex';
  }

  // 4. Handle Forgot Password Link
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      if (!email) {
        showError('Şifre sıfırlama için önce e-posta adresinizi girin.');
        return;
      }
      if (isMockMode) {
        showError('Mock modunda şifre sıfırlama desteklenmiyor.');
        return;
      }
      try {
        await firebase.auth().sendPasswordResetEmail(email);
        hideError();
        authErrorMsg.textContent = 'Şifre sıfırlama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.';
        authErrorMsg.style.display = 'block';
        authErrorMsg.style.borderColor = 'var(--accent-green)';
        authErrorMsg.style.background = 'rgba(77, 255, 166, 0.08)';
        authErrorMsg.style.color = 'var(--accent-green)';
        authErrorMsg.setAttribute('role', 'status');
        authErrorMsg.setAttribute('aria-live', 'polite');

        setTimeout(() => {
          authErrorMsg.style.borderColor = '';
          authErrorMsg.style.background = '';
          authErrorMsg.style.color = '';
          authErrorMsg.style.display = 'none';
          authErrorMsg.removeAttribute('role');
          authErrorMsg.removeAttribute('aria-live');
        }, 5000);
      } catch (err) {
        showError(translateAuthError(err));
      }
    });
  }

  // 5. Handle Login Form Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;

      if (!email || !password) {
        showError('Lütfen tüm alanları doldurun.');
        return;
      }

      setSubmitting(true, 'Giriş Yapılıyor...');

      if (isMockMode) {
        // Mock Login Flow
        setTimeout(() => {
          localStorage.setItem('mevzuat_mock_token', 'mock-token-' + email.split('@')[0]);
          localStorage.setItem('mevzuat_mock_email', email);
          localStorage.setItem('mevzuat_logged_in', 'true');
          window.location.href = 'index.html';
        }, 1000);
      } else {
        // Real Firebase Login
        try {
          await firebase.auth().signInWithEmailAndPassword(email, password);
          localStorage.setItem('mevzuat_logged_in', 'true');
          window.location.href = 'index.html';
        } catch (err) {
          setSubmitting(false);
          showError(translateAuthError(err));
        }
      }
    });
  }

  // 6. Handle Register Form Submit
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;

      if (!email || !password) {
        showError('Lütfen tüm alanları doldurun.');
        return;
      }

      if (password.length < 6) {
        showError('Şifreniz en az 6 karakter olmalıdır.');
        return;
      }

      const passwordConfirmInput = document.getElementById('authPasswordConfirm');
      const passwordConfirm = passwordConfirmInput?.value || '';
      if (passwordConfirmInput && password !== passwordConfirm) {
        showError('Şifreler eşleşmiyor.');
        return;
      }

      setSubmitting(true, 'Kayıt Yapılıyor...');

      if (isMockMode) {
        // Mock Register Flow
        setTimeout(() => {
          localStorage.setItem('mevzuat_mock_token', 'mock-token-' + email.split('@')[0]);
          localStorage.setItem('mevzuat_mock_email', email);
          localStorage.setItem('mevzuat_logged_in', 'true');
          window.location.href = 'index.html';
        }, 1000);
      } else {
        // Real Firebase Registration
        try {
          const userCred = await firebase.auth().createUserWithEmailAndPassword(email, password);

          // Create user document in Firestore
          const db = firebase.firestore();
          await db.collection('users').doc(userCred.user.uid).set({
            email: email,
            firstName: '',
            lastName: '',
            birthDate: '',
            institution: '',
            profession: '',
            theme: 'light',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          localStorage.setItem('mevzuat_logged_in', 'true');
          window.location.href = 'index.html';
        } catch (err) {
          setSubmitting(false);
          showError(translateAuthError(err));
        }
      }
    });
  }

  // 7. Handle Google Sign-in
  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', async () => {
      hideError();

      if (isMockMode) {
        localStorage.setItem('mevzuat_mock_token', 'mock-token-google_user');
        localStorage.setItem('mevzuat_mock_email', 'google_user@domain.com');
        localStorage.setItem('mevzuat_logged_in', 'true');
        window.location.href = 'index.html';
      } else {
        try {
          const provider = new firebase.auth.GoogleAuthProvider();
          const result = await firebase.auth().signInWithPopup(provider);

          // Create user document for new users only
          if (result.additionalUserInfo?.isNewUser !== false) {
            try {
              const db = firebase.firestore();
              await db.collection('users').doc(result.user.uid).set({
                email: result.user.email,
                firstName: '',
                lastName: '',
                birthDate: '',
                institution: '',
                profession: '',
                theme: 'light',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
            } catch (err) {
              console.error('Google signup profile creation error:', err);
            }
          }

          localStorage.setItem('mevzuat_logged_in', 'true');
          window.location.href = 'index.html';
        } catch (err) {
          showError(translateAuthError(err));
        }
      }
    });
  }
});
