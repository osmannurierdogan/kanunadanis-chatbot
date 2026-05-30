/**
 * Mevzuat AI - ChatGPT Clone Frontend Controller
 * Pure Vanilla JavaScript Client Logic with Glassmorphic Auth Integration
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Markdown Parser and Code Highlighting Configuration
  const md = window.markdownit({
    html: false, // Security: Disable direct HTML injecting in markdown
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      const code = md.utils.escapeHtml(str);
      const languageStr = lang || 'txt';
      return `<div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang">${languageStr}</span>
          <button class="copy-code-btn" onclick="copyCodeBlock(this)">
            <i class="lucide-copy"></i>
            <span>Kopyala</span>
          </button>
        </div>
        <pre class="language-${languageStr}"><code class="language-${languageStr}">${code}</code></pre>
      </div>`;
    }
  });

  // Global helper for copying code block (exposed to window)
  window.copyCodeBlock = async function (btn) {
    const codeBlock = btn.closest('.code-block-wrapper').querySelector('code');
    const textToCopy = codeBlock.textContent;
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      
      // Update UI state
      const textSpan = btn.querySelector('span');
      const icon = btn.querySelector('i');
      
      textSpan.textContent = 'Kopyalandı!';
      btn.style.color = '#10a37f';
      
      if (icon) {
        icon.className = 'lucide-check';
      }
      
      setTimeout(() => {
        textSpan.textContent = 'Kopyala';
        btn.style.color = '';
        if (icon) {
          icon.className = 'lucide-copy';
        }
      }, 2000);
    } catch (err) {
      console.error('Kopyalama hatası:', err);
    }
  };

  // Global helper for copying message content
  window.copyMessageText = async function (btn, messageId) {
    const messageContent = document.querySelector(`#${messageId} .message-content`);
    let text = "";
    messageContent.childNodes.forEach(node => {
      if (node.classList && node.classList.contains('code-block-wrapper')) {
        text += '\n```' + node.querySelector('.code-lang').textContent + '\n' + node.querySelector('code').textContent + '\n```\n';
      } else {
        text += node.textContent + '\n';
      }
    });

    try {
      await navigator.clipboard.writeText(text.trim());
      const icon = btn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'check');
        btn.style.color = '#10a37f';
        lucide.createIcons();
        
        setTimeout(() => {
          icon.setAttribute('data-lucide', 'copy');
          btn.style.color = '';
          lucide.createIcons();
        }, 2000);
      }
    } catch (err) {
      console.error('Mesaj kopyalama hatası:', err);
    }
  };

  // Global status message helper
  window.showStatus = function(message, type = 'info') {
    let statusEl = document.querySelector('.status-message');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'status-message';
      document.body.appendChild(statusEl);
    }

    statusEl.className = `status-message status-${type}`;
    statusEl.textContent = message;
    statusEl.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:6px;z-index:9999;font-size:14px;';

    if (type === 'error') {
      statusEl.style.backgroundColor = 'rgba(255,68,68,0.9)';
      statusEl.style.color = '#fff';
    } else if (type === 'success') {
      statusEl.style.backgroundColor = 'rgba(77,255,166,0.9)';
      statusEl.style.color = '#000';
    }

    clearTimeout(statusEl.hideTimer);
    statusEl.hideTimer = setTimeout(() => {
      statusEl.remove();
    }, 4000);
  };

  // 2. Application State Management
  const state = {
    chats: [],
    activeChatId: null,
    isGenerating: false,
    activeController: null,
    currentModel: 'mevzuat-4.5',
    // Authentication States
    isMockMode: true,
    userToken: null,
    userEmail: null,
    isSignUp: false
  };

  // 3. Select DOM Elements
  const newChatBtn = document.getElementById('newChatBtn');
  const headerNewChatBtn = document.getElementById('headerNewChatBtn');
  const chatListContainer = document.getElementById('chatListContainer');
  const chatContainer = document.getElementById('chatContainer');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const messageList = document.getElementById('messageList');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');
  const attachmentChip = document.getElementById('attachmentChip');
  const attachmentName = document.getElementById('attachmentName');
  const attachmentRemove = document.getElementById('attachmentRemove');
  const micBtn = document.getElementById('micBtn');
  const hideSidebarBtn = document.getElementById('hideSidebarBtn');
  const showSidebarBtn = document.getElementById('showSidebarBtn');
  const sidebar = document.getElementById('sidebar');
  const modelSelectorBtn = document.getElementById('modelSelectorBtn');
  const modelDropdown = document.getElementById('modelDropdown');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const suggestionCards = document.querySelectorAll('.suggestion-card');
  const tabButtons = document.querySelectorAll('.tab-btn');

  // Auth Selectors
  const authOverlay = document.getElementById('authOverlay');
  const authForm = document.getElementById('authForm');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const googleAuthBtn = document.getElementById('googleAuthBtn');
  const authToggleBtn = document.getElementById('authToggleBtn');
  const authToggleText = document.getElementById('authToggleText');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const authErrorMsg = document.getElementById('authErrorMsg');
  const mockAuthBadge = document.getElementById('mockAuthBadge');
  const logoutBtn = document.getElementById('logoutBtn');
  const userEmailSpan = document.getElementById('userEmail');
  const userAvatarDiv = document.getElementById('userAvatar');

  // Create a mobile backdrop overlay element
  const mobileBackdrop = document.createElement('div');
  mobileBackdrop.className = 'sidebar-overlay';
  document.body.appendChild(mobileBackdrop);

  // 4. Theme Management & Initial Launch Sequence
  function applyTheme(theme) {
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = theme;
    }
    
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else if (theme === 'dark') {
      document.body.classList.remove('light-theme');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.add('light-theme');
      }
    }
  }

  async function init() {
    // Read and apply saved theme immediately
    const savedTheme = localStorage.getItem('mevzuat_theme') || 'system';
    applyTheme(savedTheme);

    setupEventListeners();
    lucide.createIcons();
    
    // Auto-scroll input listener to grow input area
    chatInput.addEventListener('input', autoGrowInput);

    try {
      // 1. Fetch Firebase config from Express Server
      const configRes = await fetch('/api/config');
      const config = await configRes.json();

      if (config.projectId) {
        // Real Firebase Auth Mode
        state.isMockMode = false;
        if (mockAuthBadge) mockAuthBadge.style.display = 'none';
        
        // Initialize Firebase
        firebase.initializeApp(config);
        
        // Initialize Analytics if measurementId is present
        if (config.measurementId) {
          firebase.analytics();
        }
        
        // Setup Auth state observer
        firebase.auth().onAuthStateChanged(async (user) => {
          if (user) {
            const token = await user.getIdToken();
            state.userToken = token;
            state.userEmail = user.email;
            
            // Persist login state
            localStorage.setItem('mevzuat_logged_in', 'true');
            
            updateUserProfile(user.email);
            showAuthView(false);
            await fetchChatList();
            await loadUserProfileDetails();
          } else {
            state.userToken = null;
            state.userEmail = null;
            
            // Remove login state
            localStorage.removeItem('mevzuat_logged_in');
            
            showAuthView(true);
          }
        });
      } else {
        // Fallback to Developer/Mock Auth Mode
        console.log('⚡ Firebase configuration missing or empty. Entering Mock/Developer Auth Mode.');
        state.isMockMode = true;
        if (mockAuthBadge) mockAuthBadge.style.display = 'flex';

        // Check local storage for mock session
        const savedToken = localStorage.getItem('mevzuat_mock_token');
        const savedEmail = localStorage.getItem('mevzuat_mock_email');

        if (savedToken && savedEmail) {
          state.userToken = savedToken;
          state.userEmail = savedEmail;
          
          // Persist login state
          localStorage.setItem('mevzuat_logged_in', 'true');
          
          updateUserProfile(savedEmail);
          showAuthView(false);
          await fetchChatList();
          await loadUserProfileDetails();
        } else {
          localStorage.removeItem('mevzuat_logged_in');
          showAuthView(true);
        }
      }
    } catch (err) {
      console.error('Uygulama başlatılırken hata oluştu:', err);
      // Fallback to Mock Auth Mode on failure
      state.isMockMode = true;
      if (mockAuthBadge) mockAuthBadge.style.display = 'flex';
      showAuthView(true);
    }
  }

  // 5. Event Listeners Setup
  function setupEventListeners() {
    // Sidebar visibility toggles
    hideSidebarBtn.addEventListener('click', () => toggleSidebar(false));
    showSidebarBtn.addEventListener('click', () => toggleSidebar(true));
    mobileBackdrop.addEventListener('click', () => toggleSidebar(false));

    // Create chat triggers
    newChatBtn.addEventListener('click', () => startNewChat());
    headerNewChatBtn.addEventListener('click', () => startNewChat());

    // Suggestions trigger
    suggestionCards.forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        submitSuggestedPrompt(prompt);
      });
    });

    // Chat submit event
    chatForm.addEventListener('submit', handleFormSubmit);
    chatInput.addEventListener('keydown', handleKeyDown);

    // File attachment
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', handleFileSelected);
    }
    if (attachmentRemove) {
      attachmentRemove.addEventListener('click', clearAttachment);
    }

    // Voice input (Web Speech API)
    if (micBtn) {
      micBtn.addEventListener('click', toggleVoiceRecognition);
    }

    // Model Selector dropdown
    modelSelectorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modelDropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      modelDropdown.classList.remove('show');
    });

    modelDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        modelDropdown.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        state.currentModel = item.getAttribute('data-model');
        
        // Update display text
        const modelLabel = item.querySelector('.item-title span').textContent;
        const iconName = item.getAttribute('data-icon') || 'sparkles';
        
        modelSelectorBtn.querySelector('.model-name').textContent = modelLabel;
        modelSelectorBtn.querySelector('.model-icon').innerHTML = `<i data-lucide="${iconName}"></i>`;
        
        lucide.createIcons();
        modelDropdown.classList.remove('show');
      });
    });

    // Settings Modal
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('show'));
    closeModalBtn.addEventListener('click', () => settingsModal.classList.remove('show'));
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove('show');
    });

    // Tab buttons in Settings
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const targetTab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-pane').forEach(pane => {
          if (pane.id === `tab-${targetTab}`) {
            pane.classList.add('active');
          } else {
            pane.classList.remove('active');
          }
        });

        // Dynamically load profile details when tab active
        if (targetTab === 'profile') {
          const profileEmail = document.getElementById('profileEmail');
          const profileProvider = document.getElementById('profileProvider');

          if (state.userEmail) {
            profileEmail.textContent = state.userEmail;

            if (state.isMockMode) {
              profileProvider.textContent = 'Geliştirici Modu';
              profileProvider.style.backgroundColor = 'rgba(171, 104, 255, 0.15)';
              profileProvider.style.color = 'var(--accent-purple)';
            } else {
              const user = firebase.auth().currentUser;
              if (user && user.providerData && user.providerData.length > 0) {
                const providerId = user.providerData[0].providerId;
                if (providerId === 'google.com') {
                  profileProvider.textContent = 'Google';
                  profileProvider.style.backgroundColor = 'rgba(66, 133, 244, 0.15)';
                  profileProvider.style.color = '#4285f4';
                } else {
                  profileProvider.textContent = 'E-posta & Şifre';
                  profileProvider.style.backgroundColor = 'rgba(16, 163, 127, 0.15)';
                  profileProvider.style.color = 'var(--accent-green)';
                }
              } else {
                profileProvider.textContent = 'E-posta';
                profileProvider.style.backgroundColor = 'rgba(16, 163, 127, 0.15)';
                profileProvider.style.color = 'var(--accent-green)';
              }
            }
          } else {
            profileEmail.textContent = 'Giriş yapılmadı.';
            profileProvider.textContent = '-';
          }
        }

        // Load billing info when billing tab active
        if (targetTab === 'billing') {
          loadBillingInfo();
        }
      });
    });

    // Profile Details Form Submission
    const profileDetailsForm = document.getElementById('profileDetailsForm');
    if (profileDetailsForm) {
      profileDetailsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveUserProfileDetails();
      });
    }

    // Theme selection listener
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = localStorage.getItem('mevzuat_theme') || 'system';
      themeSelect.addEventListener('change', async (e) => {
        const theme = e.target.value;
        localStorage.setItem('mevzuat_theme', theme);
        applyTheme(theme);

        // Sync theme to Firestore if in Real Firebase mode
        if (!state.isMockMode && firebase.auth().currentUser) {
          try {
            const uid = firebase.auth().currentUser.uid;
            await firebase.firestore().collection('users').doc(uid).set({
              theme: theme
            }, { merge: true });
          } catch (err) {
            console.warn('Firestore theme update failed:', err);
          }
        }
      });
    }

    // System color scheme change listener
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const savedTheme = localStorage.getItem('mevzuat_theme') || 'system';
      if (savedTheme === 'system') {
        if (e.matches) {
          document.body.classList.remove('light-theme');
        } else {
          document.body.classList.add('light-theme');
        }
      }
    });

    // Authentication Listeners
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        window.location.href = 'logout.html';
      });
    }
  }

  // 6. Sidebar Operations
  function toggleSidebar(show) {
    if (show) {
      sidebar.classList.remove('collapsed');
      sidebar.classList.add('active');
    } else {
      sidebar.classList.add('collapsed');
      sidebar.classList.remove('active');
    }
  }

  // Fetch all chats and build sidebar tree
  async function fetchChatList() {
    if (!state.userToken) return;

    try {
      const response = await fetch('/api/chats', {
        headers: {
          'Authorization': `Bearer ${state.userToken}`
        }
      });
      if (!response.ok) {
        console.warn('Sohbet listesi yüklenemedi. Durum kodu:', response.status);
        state.chats = [];
        renderSidebarChats();
        return;
      }
      state.chats = await response.json();
      renderSidebarChats();
    } catch (err) {
      console.error('Sohbet geçmişi yüklenirken hata oluştu:', err);
    }
  }

  function renderSidebarChats() {
    chatListContainer.innerHTML = '';
    
    // Defensive: ensure state.chats is always an array
    if (!Array.isArray(state.chats)) {
      state.chats = [];
    }

    if (state.chats.length === 0) {
      chatListContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px 10px;">
          Henüz sohbet geçmişi yok.
        </div>
      `;
      return;
    }

    // Group chats by date
    const groups = {
      today: { title: 'Bugün', items: [] },
      yesterday: { title: 'Dün', items: [] },
      lastWeek: { title: 'Son 7 Gün', items: [] },
      older: { title: 'Daha Eski', items: [] }
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgoStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    state.chats.forEach(chat => {
      const chatDate = new Date(chat.updatedAt);
      if (chatDate >= todayStart) {
        groups.today.items.push(chat);
      } else if (chatDate >= yesterdayStart) {
        groups.yesterday.items.push(chat);
      } else if (chatDate >= sevenDaysAgoStart) {
        groups.lastWeek.items.push(chat);
      } else {
        groups.older.items.push(chat);
      }
    });

    // Render grouped lists
    Object.keys(groups).forEach(key => {
      const group = groups[key];
      if (group.items.length === 0) return;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'chat-group';
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'chat-group-title';
      titleDiv.textContent = group.title;
      groupDiv.appendChild(titleDiv);

      group.items.forEach(chat => {
        const activeClass = state.activeChatId === chat.id ? 'active' : '';
        const item = document.createElement('div');
        item.className = `chat-item ${activeClass}`;
        item.setAttribute('data-id', chat.id);
        
        item.innerHTML = `
          <div class="chat-item-link">
            <i class="chat-icon" data-lucide="message-square"></i>
            <span class="chat-item-title">${escapeHtml(chat.title)}</span>
          </div>
          <button class="chat-delete-btn" title="Sohbeti Sil">
            <i data-lucide="trash-2"></i>
          </button>
        `;

        // Load chat on click
        item.querySelector('.chat-item-link').addEventListener('click', () => {
          selectChat(chat.id);
          // Hide sidebar on mobile upon selection
          if (window.innerWidth <= 768) {
            toggleSidebar(false);
          }
        });

        // Delete chat on click
        item.querySelector('.chat-delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteChatSession(chat.id);
        });

        groupDiv.appendChild(item);
      });

      chatListContainer.appendChild(groupDiv);
    });

    lucide.createIcons();
  }

  // 7. Chat Loading & Switch
  async function selectChat(chatId) {
    if (state.isGenerating) {
      alert("Lütfen mevcut cevabın tamamlanmasını bekleyin veya durdurun.");
      return;
    }
    
    state.activeChatId = chatId;
    
    // Highlight sidebar active item
    document.querySelectorAll('.chat-item').forEach(el => {
      if (el.getAttribute('data-id') === chatId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        headers: {
          'Authorization': `Bearer ${state.userToken}`
        }
      });
      if (!response.ok) throw new Error('Sohbet yüklenemedi.');
      
      const chat = await response.json();
      renderChatMessages(chat.messages);
    } catch (err) {
      console.error(err);
      alert('Sohbet yüklenirken bir hata oluştu.');
    }
  }

  function renderChatMessages(messages) {
    messageList.innerHTML = '';
    
    if (!messages || messages.length === 0) {
      welcomeScreen.style.display = 'flex';
      messageList.style.display = 'none';
      return;
    }

    welcomeScreen.style.display = 'none';
    messageList.style.display = 'flex';

    messages.forEach(msg => {
      appendMessageToDOM(msg.role, msg.content, msg.id);
    });

    scrollToBottom();
  }

  function appendMessageToDOM(role, content, msgId) {
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `message-item-wrapper ${role}`;
    
    const idAttr = msgId ? `id="${msgId}"` : '';
    
    // Get sender initials for avatar
    let avatarContent;
    if (isUser) {
      avatarContent = state.userEmail ? state.userEmail.split('@')[0].substring(0, 2).toUpperCase() : 'Sİ';
    } else {
      avatarContent = '<i data-lucide="scale"></i>';
    }

    const senderName = isUser ? 'Siz' : 'Mevzuat AI';
    const formattedContent = isUser ? escapeHtml(content).replace(/\n/g, '<br>') : md.render(content);

    wrapper.innerHTML = `
      <div class="message-item" ${idAttr}>
        <div class="message-avatar">
          ${avatarContent}
        </div>
        <div class="message-body">
          <span class="message-sender">${senderName}</span>
          <div class="message-content">${formattedContent}</div>
          ${!isUser && msgId ? `
            <div class="message-actions">
              <button class="action-icon-btn" onclick="copyMessageText(this, '${msgId}')" title="Metni Kopyala">
                <i data-lucide="copy"></i>
              </button>
              <button class="action-icon-btn" title="Beğen">
                <i data-lucide="thumbs-up"></i>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    messageList.appendChild(wrapper);
    lucide.createIcons();
    
    if (!isUser) {
      Prism.highlightAllUnder(wrapper);
    }
  }

  // Create clean slate active chat session
  async function startNewChat() {
    if (state.isGenerating) {
      alert("Lütfen mevcut cevabın tamamlanmasını bekleyin.");
      return;
    }

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.userToken}`
        },
        body: JSON.stringify({ title: 'Yeni Sohbet' })
      });
      if (!response.ok) {
        console.error('Yeni sohbet oluşturulamadı. Durum kodu:', response.status);
        return;
      }
      
      const newChat = await response.json();
      state.activeChatId = newChat.id;
      
      await fetchChatList();
      renderChatMessages([]);
      chatInput.focus();
    } catch (err) {
      console.error('Yeni sohbet oluşturulamadı:', err);
    }
  }

  // Custom Premium Confirmation Modal Helper
  function showConfirm(title, message, onOk) {
    const confirmModal = document.getElementById('confirmModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const okBtn = document.getElementById('confirmOkBtn');

    if (!confirmModal) {
      // Fallback if modal not present
      if (confirm(message)) onOk();
      return;
    }

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;

    confirmModal.classList.add('show');

    const cleanup = () => {
      confirmModal.classList.remove('show');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      confirmModal.onclick = null;
    };

    okBtn.onclick = (e) => {
      e.stopPropagation();
      cleanup();
      onOk();
    };

    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      cleanup();
    };

    confirmModal.onclick = (e) => {
      if (e.target === confirmModal) {
        cleanup();
      }
    };
  }

  async function deleteChatSession(chatId) {
    showConfirm('Sohbeti Sil', 'Bu sohbeti silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.', async () => {
      try {
        const response = await fetch(`/api/chats/${chatId}`, { 
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${state.userToken}`
          }
        });
        if (response.ok) {
          if (state.activeChatId === chatId) {
            state.activeChatId = null;
            renderChatMessages([]);
          }
          await fetchChatList();
        }
      } catch (err) {
        console.error('Sohbet silinirken hata:', err);
      }
    });
  }

  // Load user profile details from Firestore or local storage cache
  async function loadUserProfileDetails() {
    const firstNameInput = document.getElementById('profileFirstName');
    const lastNameInput = document.getElementById('profileLastName');
    const birthDateInput = document.getElementById('profileBirthDate');
    const professionInput = document.getElementById('profileProfession');
    const institutionInput = document.getElementById('profileInstitution');
    const themeSelect = document.getElementById('themeSelect');

    if (!firstNameInput) return;

    // Load from local storage cache immediately
    firstNameInput.value = localStorage.getItem('profile_first_name') || '';
    lastNameInput.value = localStorage.getItem('profile_last_name') || '';
    birthDateInput.value = localStorage.getItem('profile_birth_date') || '';
    professionInput.value = localStorage.getItem('profile_profession') || '';
    institutionInput.value = localStorage.getItem('profile_institution') || '';

    // If real Firebase and user is logged in
    if (!state.isMockMode && firebase.auth().currentUser) {
      try {
        const uid = firebase.auth().currentUser.uid;
        const db = firebase.firestore();
        const docRef = db.collection('users').doc(uid);
        const doc = await docRef.get();
        if (doc.exists) {
          const data = doc.data();
          if (data.firstName) firstNameInput.value = data.firstName;
          if (data.lastName) lastNameInput.value = data.lastName;
          if (data.birthDate) birthDateInput.value = data.birthDate;
          if (data.profession) professionInput.value = data.profession;
          if (data.institution) institutionInput.value = data.institution;
          if (data.theme) {
            themeSelect.value = data.theme;
            localStorage.setItem('mevzuat_theme', data.theme);
            applyTheme(data.theme);
          }

          // Cache to local storage
          localStorage.setItem('profile_first_name', data.firstName || '');
          localStorage.setItem('profile_last_name', data.lastName || '');
          localStorage.setItem('profile_birth_date', data.birthDate || '');
          localStorage.setItem('profile_profession', data.profession || '');
          localStorage.setItem('profile_institution', data.institution || '');
        }
      } catch (err) {
        console.warn('Firestore profile load failed (using cache/local storage):', err);
      }
    }
  }

  // Save user profile details to Firestore or local storage cache
  async function saveUserProfileDetails(e) {
    if (e) e.preventDefault();

    const saveBtn = document.getElementById('saveProfileBtn');
    const statusDiv = document.getElementById('profileSaveStatus');
    const firstName = document.getElementById('profileFirstName').value.trim();
    const lastName = document.getElementById('profileLastName').value.trim();
    const birthDate = document.getElementById('profileBirthDate').value;
    const profession = document.getElementById('profileProfession').value.trim();
    const institution = document.getElementById('profileInstitution').value.trim();
    const theme = document.getElementById('themeSelect').value;

    if (!saveBtn) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width: 16px; height: 16px;"></i> <span>Kaydediliyor...</span>';
    lucide.createIcons();

    // Cache to local storage immediately
    localStorage.setItem('profile_first_name', firstName);
    localStorage.setItem('profile_last_name', lastName);
    localStorage.setItem('profile_birth_date', birthDate);
    localStorage.setItem('profile_profession', profession);
    localStorage.setItem('profile_institution', institution);
    localStorage.setItem('mevzuat_theme', theme);
    applyTheme(theme);

    let success = true;

    // Save to Firestore in real Firebase mode
    if (!state.isMockMode && firebase.auth().currentUser) {
      try {
        const uid = firebase.auth().currentUser.uid;
        const db = firebase.firestore();
        await db.collection('users').doc(uid).set({
          email: firebase.auth().currentUser.email,
          firstName,
          lastName,
          birthDate,
          profession,
          institution,
          theme,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error('Firestore profile save error:', err);
        success = false;
      }
    }

    // Reset button state
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i data-lucide="save"></i> <span>Bilgileri Güncelle</span>';
    lucide.createIcons();

    // Show status
    statusDiv.style.display = 'block';
    if (success) {
      statusDiv.className = 'profile-save-status success';
      statusDiv.textContent = 'Profil ve ayarlarınız başarıyla güncellendi.';
    } else {
      statusDiv.className = 'profile-save-status error';
      statusDiv.textContent = 'Ayarlar yerel olarak kaydedildi fakat sunucuya senkronize edilemedi.';
    }

    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 4000);
  }

  // Load billing info (subscription and credits)
  async function loadBillingInfo() {
    const billingCurrentPlan = document.getElementById('billingCurrentPlan');
    const billingCreditsRemaining = document.getElementById('billingCreditsRemaining');
    const billingPortalBtn = document.getElementById('billingPortalBtn');

    if (!billingCurrentPlan || !billingCreditsRemaining) return;

    try {
      const response = await fetch('/api/subscription', {
        headers: {
          'Authorization': `Bearer ${state.userToken}`
        }
      });

      if (!response.ok) {
        billingCurrentPlan.textContent = 'Yüklenemedi';
        billingCreditsRemaining.textContent = '-';
        const userPlanElement = document.getElementById('userPlan');
        if (userPlanElement) userPlanElement.textContent = 'Ücretsiz';
        const userCreditsEl = document.getElementById('userCredits');
        if (userCreditsEl) userCreditsEl.textContent = '';
        return;
      }

      const subData = await response.json();
      const planNames = {
        'free': 'Ücretsiz',
        'starter': 'Başlangıç',
        'pro': 'Pro',
        'business': 'İş'
      };

      const planLabel = planNames[subData.plan] || subData.plan;
      billingCurrentPlan.textContent = `${planLabel} Planı`;
      billingCreditsRemaining.textContent = `${subData.creditsRemaining || 0} / ${subData.creditsMax || 10}`;

      // Update sidebar plan display
      const userPlanElement = document.getElementById('userPlan');
      if (userPlanElement) {
        userPlanElement.textContent = planLabel;
      }
      const userCreditsEl = document.getElementById('userCredits');
      if (userCreditsEl) {
        userCreditsEl.textContent = `${subData.creditsRemaining ?? 0} / ${subData.creditsMax ?? 10} sorgu`;
      }

      // Setup portal button - only if user has a Stripe customer
      if (billingPortalBtn) {
        if (!subData.stripeCustomerId) {
          // No subscription yet - change button to redirect to pricing
          billingPortalBtn.textContent = 'Plan Al';
          billingPortalBtn.onclick = () => {
            window.location.href = 'pricing.html';
          };
        } else {
          // Has subscription - setup portal link
          billingPortalBtn.onclick = async () => {
            try {
              const portalResponse = await fetch('/api/stripe/portal', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${state.userToken}`
                }
              });

              if (!portalResponse.ok) {
                showStatus('Henüz bir aboneliğiniz yok. Lütfen plan seçiniz.', 'error');
                setTimeout(() => {
                  window.location.href = 'pricing.html';
                }, 2000);
                return;
              }

              const { url } = await portalResponse.json();
              if (url) {
                window.location.href = url;
              }
            } catch (err) {
              console.error('Portal error:', err);
              showStatus('Bir hata oluştu. Lütfen tekrar deneyiniz.', 'error');
            }
          };
        }
      }
    } catch (err) {
      console.error('Billing info load failed:', err);
      billingCurrentPlan.textContent = 'Yüklenemedi';
      billingCreditsRemaining.textContent = '-';
      const userPlanElement = document.getElementById('userPlan');
      if (userPlanElement) userPlanElement.textContent = 'Ücretsiz';
      const userCreditsEl = document.getElementById('userCredits');
      if (userCreditsEl) userCreditsEl.textContent = '';
    }
  }

  // File attachment state & handlers
  state.attachment = null;

  function clearAttachment() {
    state.attachment = null;
    if (fileInput) fileInput.value = '';
    if (attachmentChip) attachmentChip.style.display = 'none';
    if (attachmentName) attachmentName.textContent = '';
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 1024 * 1024; // 1MB
    if (file.size > maxSize) {
      alert('Dosya 1MB sınırını aşıyor. Daha küçük bir dosya seçin.');
      fileInput.value = '';
      return;
    }

    try {
      const text = await file.text();
      state.attachment = { name: file.name, content: text };
      if (attachmentName) attachmentName.textContent = file.name;
      if (attachmentChip) attachmentChip.style.display = 'inline-flex';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      sendBtn.disabled = false;
    } catch (err) {
      alert('Dosya okunamadı. Yalnızca metin tabanlı dosyalar desteklenir.');
      fileInput.value = '';
    }
  }

  // Voice recognition (Web Speech API)
  let recognition = null;
  let isRecording = false;

  function toggleVoiceRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Tarayıcınız sesli giriş özelliğini desteklemiyor. Chrome veya Edge kullanın.');
      return;
    }

    if (isRecording) {
      recognition?.stop();
      return;
    }

    recognition = new SR();
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = '';
    const baseValue = chatInput.value;

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
    };

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      const combined = (baseValue + (baseValue ? ' ' : '') + finalTranscript + interim).trim();
      chatInput.value = combined;
      autoGrowInput();
    };

    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      if (e.error === 'not-allowed') {
        alert('Mikrofon erişimi reddedildi. Tarayıcı ayarlarını kontrol edin.');
      }
    };

    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove('recording');
    };

    recognition.start();
  }

  // 8. Send & Stream API Interactions
  async function submitSuggestedPrompt(prompt) {
    chatInput.value = prompt;
    autoGrowInput();
    sendBtn.disabled = false;
    
    // Trigger form submit
    chatForm.dispatchEvent(new Event('submit'));
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    let text = chatInput.value.trim();
    if ((!text && !state.attachment) || state.isGenerating) return;

    if (state.attachment) {
      const att = state.attachment;
      text = `[Ek: ${att.name}]\n\n\`\`\`\n${att.content}\n\`\`\`\n\n${text}`.trim();
      clearAttachment();
    }

    // Reset input form
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;

    // 1. Ensure we have an active chat session. If not, create one first!
    if (!state.activeChatId) {
      try {
        const response = await fetch('/api/chats', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.userToken}`
          },
          body: JSON.stringify({ title: text.length > 25 ? text.substring(0, 25) + '...' : text })
        });
        if (!response.ok) {
          console.error('Yeni sohbet oluşturulamadı. Durum kodu:', response.status);
          alert('Yeni sohbet başlatılamadı. Lütfen oturumunuzu kontrol edin.');
          return;
        }
        const newChat = await response.json();
        state.activeChatId = newChat.id;
      } catch (err) {
        console.error(err);
        alert('Yeni sohbet başlatılırken bir hata oluştu.');
        return;
      }
    }

    // Hide welcome panel, show message list
    welcomeScreen.style.display = 'none';
    messageList.style.display = 'flex';

    // 2. Render User Message immediately
    appendMessageToDOM('user', text);
    scrollToBottom();

    // 3. Set up AI Streaming Message Frame
    state.isGenerating = true;
    updateSendBtnState();
    
    const aiMsgId = 'msg_' + Math.random().toString(36).substr(2, 9);
    const aiWrapper = document.createElement('div');
    aiWrapper.className = 'message-item-wrapper assistant';
    aiWrapper.innerHTML = `
      <div class="message-item" id="${aiMsgId}">
        <div class="message-avatar">
          <i data-lucide="scale"></i>
        </div>
        <div class="message-body">
          <span class="message-sender">Mevzuat AI</span>
          <div class="message-timeline"></div>
        </div>
      </div>
    `;
    messageList.appendChild(aiWrapper);
    lucide.createIcons();
    scrollToBottom();

    const timelineDiv = aiWrapper.querySelector('.message-timeline');

    const TOOL_LABELS = {
      search_kanun: { label: 'Kanun aranıyor', done: 'Kanun arandı' },
      search_within_kanun: { label: 'Kanun maddesi aranıyor', done: 'Kanun maddesi bulundu' },
      search_teblig: { label: 'Tebliğ aranıyor', done: 'Tebliğ arandı' },
      search_within_teblig: { label: 'Tebliğ içinde aranıyor', done: 'Tebliğ içinde arandı' },
      get_teblig_content: { label: 'Tebliğ metni getiriliyor', done: 'Tebliğ metni getirildi' },
      search_cbk: { label: 'Cumhurbaşkanlığı kararnamesi aranıyor', done: 'CB kararnamesi arandı' },
      search_within_cbk: { label: 'CBK maddesi aranıyor', done: 'CBK maddesi bulundu' },
      search_cbyonetmelik: { label: 'CB yönetmeliği aranıyor', done: 'CB yönetmeliği arandı' },
      search_within_cbyonetmelik: { label: 'CB yönetmeliği maddesi aranıyor', done: 'CB yön. maddesi bulundu' },
      search_cbbaskankarar: { label: 'Cumhurbaşkanı kararı aranıyor', done: 'Cumhurbaşkanı kararı arandı' },
      search_within_cbbaskankarar: { label: 'Cumhurbaşkanı kararı içinde aranıyor', done: 'Cumhurbaşkanı kararı içinde arandı' },
      get_cbbaskankarar_content: { label: 'Cumhurbaşkanı kararı metni getiriliyor', done: 'Cumhurbaşkanı kararı metni getirildi' },
      search_cbgenelge: { label: 'CB genelgesi aranıyor', done: 'CB genelgesi arandı' },
      search_within_cbgenelge: { label: 'CB genelgesi içinde aranıyor', done: 'CB genelgesi içinde arandı' },
      get_cbgenelge_content: { label: 'CB genelgesi metni getiriliyor', done: 'CB genelgesi metni getirildi' },
      search_khk: { label: 'KHK aranıyor', done: 'KHK arandı' },
      search_within_khk: { label: 'KHK maddesi aranıyor', done: 'KHK maddesi bulundu' },
      search_tuzuk: { label: 'Tüzük aranıyor', done: 'Tüzük arandı' },
      search_within_tuzuk: { label: 'Tüzük maddesi aranıyor', done: 'Tüzük maddesi bulundu' },
      search_kurum_yonetmelik: { label: 'Kurum yönetmeliği aranıyor', done: 'Kurum yönetmeliği arandı' },
      search_within_kurum_yonetmelik: { label: 'Kurum yönetmeliği maddesi aranıyor', done: 'Kurum yön. maddesi bulundu' },
      search_mevzuat: { label: 'Mevzuat aranıyor', done: 'Mevzuat arandı' },
      get_mevzuat_content: { label: 'Mevzuat metni getiriliyor', done: 'Mevzuat metni getirildi' },
      search_within_mevzuat: { label: 'Mevzuat içinde aranıyor', done: 'Mevzuat içinde arandı' },
      get_mevzuat_gerekce: { label: 'Kanun gerekçesi getiriliyor', done: 'Kanun gerekçesi getirildi' },
      get_mevzuat_madde_tree: { label: 'Madde dizini getiriliyor', done: 'Madde dizini getirildi' }
    };

    const labelFor = (name, state) => {
      const t = TOOL_LABELS[name];
      if (!t) return name.replace(/_/g, ' ');
      return state === 'done' ? t.done : t.label;
    };

    // Args'ı kullanıcı dostu formata çevir
    const formatArgs = (input) => {
      if (!input || typeof input !== 'object' || Object.keys(input).length === 0) {
        return null;
      }
      const lines = [];
      for (const [k, v] of Object.entries(input)) {
        const niceKey = k.replace(/_/g, ' ');
        let val;
        if (typeof v === 'string') val = v;
        else if (typeof v === 'number' || typeof v === 'boolean') val = String(v);
        else val = JSON.stringify(v);
        if (val.length > 200) val = val.slice(0, 200) + '…';
        lines.push({ key: niceKey, value: val });
      }
      return lines;
    };

    const escapeHtml = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Timeline segments — sıra korunur
    const timelineSegments = [];
    const chipById = {};
    let currentTextSegment = null;
    let currentTextEl = null;

    const ensureTextSegment = () => {
      if (currentTextSegment) return currentTextSegment;
      const seg = { type: 'text', text: '' };
      timelineSegments.push(seg);
      currentTextSegment = seg;
      const el = document.createElement('div');
      el.className = 'message-content timeline-text';
      el.innerHTML = '<span class="typing-cursor"></span>';
      timelineDiv.appendChild(el);
      currentTextEl = el;
      return seg;
    };

    const renderTextSegment = (isStreaming) => {
      if (!currentTextSegment || !currentTextEl) return;
      const html = md.render(currentTextSegment.text);
      currentTextEl.innerHTML = html + (isStreaming ? '<span class="typing-cursor"></span>' : '');
      Prism.highlightAllUnder(currentTextEl);
    };

    const appendText = (chunk) => {
      ensureTextSegment();
      currentTextSegment.text += chunk;
      renderTextSegment(true);
    };

    const finalizeCurrentText = () => {
      if (currentTextEl) {
        const html = md.render(currentTextSegment.text);
        currentTextEl.innerHTML = html;
        Prism.highlightAllUnder(currentTextEl);
      }
      currentTextSegment = null;
      currentTextEl = null;
    };

    const createChip = (id, name, state, input, result, errorMsg) => {
      const label = labelFor(name, state);
      const args = formatArgs(input);
      const argsHtml = args
        ? `<div class="tool-chip-section"><div class="tool-chip-section-title">İstek</div>${
            args.map(a => `<div class="tool-chip-kv"><span class="tool-chip-k">${escapeHtml(a.key)}:</span> <span class="tool-chip-v">${escapeHtml(a.value)}</span></div>`).join('')
          }</div>`
        : '';

      let resultHtml = '';
      if (state === 'done' && result) {
        const trimmed = result.length > 1200 ? result.slice(0, 1200) + '\n… (kısaltıldı)' : result;
        resultHtml = `<div class="tool-chip-section"><div class="tool-chip-section-title">Sonuç</div><pre class="tool-chip-result">${escapeHtml(trimmed)}</pre></div>`;
      } else if (state === 'error' && errorMsg) {
        resultHtml = `<div class="tool-chip-section"><div class="tool-chip-section-title">Hata</div><pre class="tool-chip-result tool-chip-error-msg">${escapeHtml(errorMsg)}</pre></div>`;
      }

      const headerIcon = state === 'running'
        ? '<span class="tool-chip-spinner"></span>'
        : state === 'done'
        ? '<i data-lucide="check" class="tool-chip-icon"></i>'
        : '<i data-lucide="x" class="tool-chip-icon"></i>';

      const chevron = '<i data-lucide="chevron-down" class="tool-chip-chevron"></i>';

      return `
        <button type="button" class="tool-chip-header">
          ${headerIcon}
          <span class="tool-chip-label">${escapeHtml(label)}${state === 'running' ? '…' : ''}</span>
          ${chevron}
        </button>
        <div class="tool-chip-details">
          ${argsHtml}
          ${resultHtml}
        </div>
      `;
    };

    const renderLucideIn = (el) => {
      if (!window.lucide || !el) return;
      try {
        // Scoped render — sadece bu element içindeki [data-lucide]'leri işle
        if (typeof lucide.createIcons === 'function') {
          lucide.createIcons({ nameAttr: 'data-lucide', root: el });
        }
      } catch (e) {
        // Fallback to global
        try { lucide.createIcons(); } catch (_) { /* swallow */ }
      }
    };

    const upsertChip = (id, name, state, input, result, errorMsg) => {
      finalizeCurrentText();
      let chip = chipById[id];
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'tool-chip ' + state;
        chip.dataset.expanded = 'false';
        timelineDiv.appendChild(chip);
        chipById[id] = chip;
        timelineSegments.push({ type: 'tool', id });
      } else {
        chip.className = 'tool-chip ' + state;
      }
      chip.innerHTML = createChip(id, name, state, input, result, errorMsg);
      const header = chip.querySelector('.tool-chip-header');
      if (header) {
        header.addEventListener('click', () => {
          const expanded = chip.dataset.expanded === 'true';
          chip.dataset.expanded = expanded ? 'false' : 'true';
        });
      }
      // Auto-expand while running, auto-collapse when done
      if (state === 'running') chip.dataset.expanded = 'true';
      else chip.dataset.expanded = state === 'error' ? 'true' : 'false';
      renderLucideIn(chip);
    };

    // 4. Trigger Post SSE Endpoint
    try {
      const controller = new AbortController();
      state.activeController = controller;

      const response = await fetch(`/api/chats/${state.activeChatId}/message`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.userToken}`
        },
        body: JSON.stringify({ message: text }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error('API bağlantısı kurulamadı.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          if (part.startsWith('data: ')) {
            const dataStr = part.slice(6).trim();
            if (dataStr === '[DONE]') {
              break;
            }
            let data = null;
            try {
              data = JSON.parse(dataStr);
            } catch (e) {
              // Partial buffer or malformed event — skip
              continue;
            }

            try {
              if (data.text) {
                appendText(data.text);
                scrollToBottom();
              } else if (data.type === 'tool_pending') {
                upsertChip(data.id, data.name, 'running', null, null, null);
                scrollToBottom();
              } else if (data.type === 'tool_start') {
                upsertChip(data.id, data.name, 'running', data.input || null, null, null);
                scrollToBottom();
              } else if (data.type === 'tool_end') {
                upsertChip(data.id, data.name, 'done', data.input || null, data.result || null, null);
              } else if (data.type === 'tool_error') {
                upsertChip(data.id, data.name, 'error', data.input || null, null, data.message);
              } else if (data.error) {
                console.error('Stream server error:', data.error);
                finalizeCurrentText();
                const errEl = document.createElement('div');
                errEl.className = 'message-content timeline-text';
                errEl.innerHTML = `<p style="color:#b91c1c;"><strong>Sunucu hatası:</strong> ${escapeHtml(data.error)}</p>`;
                timelineDiv.appendChild(errEl);
              }
            } catch (handlerErr) {
              console.error('Event handler exception for event:', data, handlerErr);
              // Bir event handler'ı patlasa bile loop'u kesmiyoruz — bir sonraki event'le devam.
            }
          }
        }
      }

      // Finish Streaming successfully
      finalizeCurrentText();

      const aiBody = aiWrapper.querySelector('.message-body');
      const actionDiv = document.createElement('div');
      actionDiv.className = 'message-actions';
      actionDiv.innerHTML = `
        <button class="action-icon-btn" onclick="copyMessageText(this, '${aiMsgId}')" title="Metni Kopyala">
          <i data-lucide="copy"></i>
        </button>
        <button class="action-icon-btn" title="Beğen">
          <i data-lucide="thumbs-up"></i>
        </button>
      `;
      aiBody.appendChild(actionDiv);
      lucide.createIcons();

    } catch (err) {
      finalizeCurrentText();
      const errorDiv = document.createElement('div');
      errorDiv.className = 'message-content timeline-text';
      if (err.name === 'AbortError') {
        errorDiv.innerHTML = `<p style="color: #ff6b6b; font-style: italic; font-size: 13px; margin-top: 8px;">(Sohbet akışı durduruldu.)</p>`;
      } else {
        console.error('Chat stream error:', err);
        const msg = escapeHtml(err.message || String(err));
        const stack = escapeHtml(err.stack || 'no stack');
        errorDiv.innerHTML = `
          <p style="color:#b91c1c;"><strong>Frontend hatası:</strong> ${msg}</p>
          <details style="margin-top:8px;">
            <summary style="cursor:pointer; font-size:12px; color:#6b7280;">Stack trace</summary>
            <pre style="font-size:11px; background:rgba(0,0,0,0.05); padding:8px; border-radius:4px; overflow:auto; max-height:240px; margin-top:6px; white-space:pre-wrap;">${stack}</pre>
          </details>
        `;
      }
      timelineDiv.appendChild(errorDiv);
    } finally {
      state.isGenerating = false;
      state.activeController = null;
      updateSendBtnState();
      
      await fetchChatList();
      scrollToBottom();
    }
  }

  // Stop current active SSE stream
  function stopGenerating() {
    if (state.activeController) {
      state.activeController.abort();
      state.isGenerating = false;
      state.activeController = null;
      updateSendBtnState();
    }
  }

  // 9. Input & UI Utilities
  function autoGrowInput() {
    chatInput.style.height = 'auto';
    const newHeight = Math.min(chatInput.scrollHeight - 12, 160);
    chatInput.style.height = newHeight + 'px';
    sendBtn.disabled = chatInput.value.trim() === '' && !state.attachment && !state.isGenerating;
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  }

  function updateSendBtnState() {
    if (state.isGenerating) {
      sendBtn.disabled = false;
      sendBtn.className = 'send-btn generating';
      sendBtn.innerHTML = '<i data-lucide="square"></i>';
      sendBtn.onclick = (e) => {
        e.preventDefault();
        stopGenerating();
      };
    } else {
      sendBtn.className = 'send-btn';
      sendBtn.innerHTML = '<i data-lucide="arrow-up"></i>';
      sendBtn.onclick = null;
      sendBtn.disabled = chatInput.value.trim() === '' && !state.attachment;
    }
    lucide.createIcons();
  }

  function scrollToBottom() {
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 10);
  }

  // Auth UI Toggle states
  function showAuthView(show) {
    if (show) {
      localStorage.removeItem('mevzuat_logged_in');
      localStorage.removeItem('mevzuat_mock_token');
      localStorage.removeItem('mevzuat_mock_email');
      window.location.href = 'login.html';
    } else {
      if (logoutBtn) logoutBtn.style.display = 'flex';
    }
  }

  function updateUserProfile(email) {
    if (!email) return;
    userEmailSpan.textContent = email;
    const initials = email.split('@')[0].substring(0, 2).toUpperCase();
    userAvatarDiv.textContent = initials;
  }

  function translateAuthError(code) {
    switch (code) {
      case 'auth/invalid-email':
        return 'Geçersiz bir e-posta adresi girdiniz.';
      case 'auth/user-disabled':
        return 'Bu kullanıcı hesabı askıya alınmıştır.';
      case 'auth/user-not-found':
        return 'Bu e-posta adresine kayıtlı kullanıcı bulunamadı.';
      case 'auth/wrong-password':
        return 'Hatalı şifre girdiniz. Lütfen tekrar deneyin.';
      case 'auth/email-already-in-use':
        return 'Bu e-posta adresi başka bir hesap tarafından kullanılıyor.';
      case 'auth/weak-password':
        return 'Şifreniz çok zayıf. Şifre en az 6 karakter olmalıdır.';
      case 'auth/invalid-credential':
        return 'E-posta veya şifre hatalı.';
      default:
        return code || 'Kimlik doğrulama başarısız oldu. Lütfen bilgilerinizi kontrol edin.';
    }
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Launch the App
  init();
});
