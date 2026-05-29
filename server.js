const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const SYSTEM_INSTRUCTION = `Sen Mevzuat AI'sın — Türkçe mevzuat, hukuk ve yazılım konularında uzman bir yapay zeka asistanısın. Net, kaynaklara dayalı Türkçe yanıtlar ver. Kod örneklerini markdown code block'larla biçimlendir. Hukuki konularda kullanıcıyı önemli durumlarda profesyonel danışmana yönlendir.`;

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Initialize Firebase Admin SDK
// Priority order:
// 1. Individual FIREBASE_* env vars (each service account field as separate env var)
// 2. FIREBASE_SERVICE_ACCOUNT_PATH (file path — local dev)
// 3. GOOGLE_APPLICATION_CREDENTIALS (ADC fallback)
function loadServiceAccountFromEnv() {
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL'
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length === required.length) return null;
  if (missing.length > 0) {
    throw new Error(`Firebase env vars missing: ${missing.join(', ')}`);
  }

  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  // Env var systems often escape newlines as literal \n — restore real newlines
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  // Strip surrounding quotes if user pasted with them
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1);
  }

  return {
    type: process.env.FIREBASE_TYPE || 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url:
      process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL ||
      'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
  };
}

const serviceAccountObj = loadServiceAccountFromEnv();
if (serviceAccountObj) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccountObj) });
  console.log('Firebase: service account from individual env vars');
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  admin.initializeApp({
    credential: admin.credential.cert(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  });
  console.log('Firebase: service account from FIREBASE_SERVICE_ACCOUNT_PATH');
} else {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  console.log('Firebase: using application default credentials');
}
const db = admin.firestore();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Plan pricing map
const PLAN_CREDITS = {
  free: 10,
  starter: 50,
  pro: 150,
  business: 700
};

app.use(cors());
app.use(express.json());

// Only disable cache for API routes, not static assets
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Health check for Railway/Render
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Set up the JWKS client to get Google's public keys for Firebase ID Tokens
const jwksClient = jwksRsa({
  jwksUri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

function getKey(header, callback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    }
  });
}

// Authentication Middleware with Mock Fallback for local testing
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Kimlik doğrulama belirteci (token) eksik veya geçersiz.' });
  }

  const token = authHeader.split(' ')[1];
  const projectId = process.env.FIREBASE_PROJECT_ID;

  // Immediately reject if token is empty, null, or undefined as a string
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Giriş yapmanız gerekmektedir.' });
  }

  // MOCK AUTH FALLBACK (If FIREBASE_PROJECT_ID is not configured in .env yet)
  if (!projectId || projectId === 'YOUR_FIREBASE_PROJECT_ID' || token.startsWith('mock-token-')) {
    console.log('⚠️ Firebase Project ID tanımlı değil veya mock token algılandı. Geliştirici modunda doğrulandı.');
    const mockUid = token.replace('mock-token-', '') || 'dev-user-123';
    req.user = {
      uid: mockUid,
      email: mockUid + '@mevzuat.ai'
    };
    return next();
  }

  // Pre-validate JWT structure to prevent jwksRsa from parsing malformed strings
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.warn('⚠️ Geçersiz veya malforme kimlik doğrulama belirteci (token) algılandı.');
    return res.status(401).json({ error: 'Geçersiz kimlik doğrulama belirteci.' });
  }

  // Real Firebase ID Token Verification using JWKS
  jwt.verify(token, getKey, {
    audience: projectId,
    issuer: 'https://securetoken.google.com/' + projectId,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('Token doğrulama hatası:', err.message);
      return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş kimlik doğrulama belirteci.' });
    }
    
    // Set authenticated user context
    req.user = {
      uid: decoded.sub,
      email: decoded.email
    };
    next();
  });
}

// Ensure a user doc exists with default plan/credits. Returns latest data.
async function ensureUserDoc(uid, email) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const nextResetMs = Date.now() + (30 * 24 * 60 * 60 * 1000);
    const defaults = {
      email: email || null,
      plan: 'free',
      creditsRemaining: 10,
      creditsResetAt: admin.firestore.Timestamp.fromMillis(nextResetMs),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(defaults, { merge: true });
    return defaults;
  }
  return snap.data();
}

// Credit check middleware - ensure user has credits before proceeding
async function checkCredit(req, res, next) {
  try {
    const ref = db.collection('users').doc(req.user.uid);
    let userData = await ensureUserDoc(req.user.uid, req.user.email);
    const plan = userData.plan || 'free';
    const now = Date.now();

    // Handle free plan monthly reset
    if (plan === 'free') {
      const resetAtMs = userData.creditsResetAt?.toMillis?.() || 0;
      if (resetAtMs < now) {
        const nextResetMs = now + (30 * 24 * 60 * 60 * 1000);
        await ref.set({
          creditsRemaining: 10,
          creditsResetAt: admin.firestore.Timestamp.fromMillis(nextResetMs),
          plan: 'free'
        }, { merge: true });
        userData.creditsRemaining = 10;
      }
    }

    const creditsRemaining = userData.creditsRemaining || 0;
    if (creditsRemaining <= 0) {
      return res.status(402).json({
        error: 'insufficient_credits',
        message: 'Yeterli kredi bulunmamaktadır. Lütfen plan yükseltin veya kredi satın alın.',
        plan: plan,
        creditsRemaining: 0
      });
    }

    // Deduct one credit atomically
    await ref.update({
      creditsRemaining: admin.firestore.FieldValue.increment(-1)
    });

    next();
  } catch (err) {
    console.error('Credit check error:', err);
    res.status(500).json({ error: 'Kredi kontrolü sırasında hata oluştu.' });
  }
}

// REST API Endpoints (Secured per-user)
// Chats are stored in Firestore: users/{uid}/chats/{chatId}

// 1. Get all chat sessions for the authenticated user
app.get('/api/chats', authenticateUser, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.user.uid)
      .collection('chats').orderBy('updatedAt', 'desc').get();
    const summary = snap.docs.map(d => {
      const c = d.data();
      return { id: d.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt };
    });
    res.json(summary);
  } catch (err) {
    console.error('Get chats error:', err);
    res.status(500).json({ error: 'Sohbetler alınamadı.' });
  }
});

// 2. Create a new chat session for the authenticated user
app.post('/api/chats', authenticateUser, async (req, res) => {
  try {
    const chatId = 'chat_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const newChat = {
      title: req.body.title || 'Yeni Sohbet',
      userId: req.user.uid,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    await db.collection('users').doc(req.user.uid).collection('chats').doc(chatId).set(newChat);
    res.status(201).json({ id: chatId, ...newChat });
  } catch (err) {
    console.error('Create chat error:', err);
    res.status(500).json({ error: 'Sohbet oluşturulamadı.' });
  }
});

// 3. Get a specific chat session for the authenticated user
app.get('/api/chats/:id', authenticateUser, async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.user.uid)
      .collection('chats').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Sohbet bulunamadı veya bu sohbete erişim yetkiniz yok.' });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('Get chat error:', err);
    res.status(500).json({ error: 'Sohbet alınamadı.' });
  }
});

// 4. Delete a chat session belonging to the authenticated user
app.delete('/api/chats/:id', authenticateUser, async (req, res) => {
  try {
    const ref = db.collection('users').doc(req.user.uid).collection('chats').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Sohbet bulunamadı.' });
    }
    await ref.delete();
    res.json({ success: true, message: 'Sohbet başarıyla silindi.' });
  } catch (err) {
    console.error('Delete chat error:', err);
    res.status(500).json({ error: 'Sohbet silinemedi.' });
  }
});

// Mock answers database to simulate a smart Turkish Legal & General AI
const MOCK_ANSWERS = {
  sozlesme: `Aşağıda talep ettiğiniz **Hizmet Sözleşmesi Şablonu** yer almaktadır. Bu şablonu ihtiyaçlarınıza göre düzenleyebilirsiniz:

### **HİZMET SÖZLEŞMESİ**

| Madde No | Başlık | Açıklama |
| :--- | :--- | :--- |
| **Madde 1** | **Taraflar** | Bir tarafta **Hizmet Alan** ile Microsoft Word gibi kelime işlemcilerde açılabilir. |
| **Madde 2** | **Konu** | Hizmet Veren'in, Hizmet Alan'a sağlayacağı yazılım geliştirme ve danışmanlık hizmetinin detaylarıdır. |
| **Madde 3** | **Ücret ve Ödeme** | Toplam proje bedeli **150.000 TL + KDV**'dir. Ödemeler aşamalı teslimlere göre yapılacaktır. |
| **Madde 4** | **Fikri Mülkiyet** | Proje tamamlanıp ödemesi alındığında, tüm kaynak kodlar ve fikri mülkiyet hakları Hizmet Alan'a devredilir. |

#### **Yükümlülükler**
1. **Hizmet Veren**, işi belirtilen takvime (3 ay) uygun olarak teslim etmekle yükümlüdür.
2. **Hizmet Alan**, işin yapılması için gerekli tüm bilgi ve dokümanları zamanında paylaşacaktır.
3. Taraflar, ticari sır niteliğindeki bilgileri **üçüncü şahıslarla paylaşamaz (Gizlilik Taahhüdü)**.

\`\`\`javascript
// Örnek Sözleşme Onay Fonksiyonu
function approveContract(contractId, userSignature) {
  if (!userSignature) {
    throw new Error("İmza alanı boş bırakılamaz!");
  }
  return {
    id: contractId,
    status: "APPROVED",
    timestamp: new Date().toISOString(),
    signature: userSignature
  };
}
console.log(approveContract("CTR-992", "Ahmet Yılmaz"));
\`\`\`

> **Önemli Not:** Bu sözleşme taslağı genel bilgilendirme amacıyla hazırlanmıştır. Ticari faaliyetlerinizde hak kaybına uğramamak adına, imzalamadan önce mutlaka uzman bir hukukçuya danışmanız tavsiye edilir.`,

  mevzuat: `Türkiye Cumhuriyeti mevzuatına göre **İş Kanunu kapsamında Yıllık Ücretli İzin** hakları ve şartları şunlardır:

### **4857 Sayılı İş Kanunu - Madde 53**
İşyerinde işe başladığı günden itibaren, deneme süresi de içinde olmak üzere, **en az bir yıl** çalışmış olan işçilere yıllık ücretli izin verilir.

#### **Hizmet Süresine Göre İzin Süreleri:**
* **1 yıldan 5 yıla kadar** (beş yıl dahil) çalışanlara: **14 günden az olamaz.**
* **5 yıldan fazla 15 yıldan az** çalışanlara: **20 günden az olamaz.**
* **15 yıl (dahil) ve daha fazla** çalışanlara: **26 günden az olamaz.**

> *Not: Yer altı işlerinde çalışan işçilerin yıllık ücretli izin süreleri dörder gün arttırılarak uygulanır. 18 ve daha küçük yaştaki işçiler ile 50 ve daha yukarı yaştaki işçilere verilecek yıllık ücretli izin süresi **20 günden az olamaz**.*

#### **İzin Kullanım Kuralları**
1. **Bölünemezlik İlkesi:** Yıllık ücretli izin işveren tarafından bölünemez. Ancak tarafların anlaşmasıyla bir bölümü **10 günden aşağı olmamak üzere** en fazla üçe bölünebilir.
2. **Ücret Ödemesi:** İşveren, yıllık ücretli izin dönemine ilişkin ücreti, işçinin izne başlamasından önce **peşin olarak ödemek veya avans olarak vermek** zorundadır.`,

  kod: `Elbette! Aşağıda modern ve temiz bir **JavaScript API Fetching ve Veri Listeleme** bileşeni örneği bulabilirsiniz. 

Bu kod bloğu, asenkron yapıyı kullanır ve hata yönetimini ('try-catch') barındırır:

\`\`\`javascript
/**
 * Belirtilen URL'den kullanıcı verilerini çeken asenkron fonksiyon
 * @param {string} url - API uç noktası
 */
async function fetchUsers(url) {
  try {
    console.log("Kullanıcı verileri indiriliyor...");
    const response = await fetch(url);
    
    // Bağlantı kontrolü
    if (!response.ok) {
      throw new Error("HTTP hata kodu: " + response.status);
    }
    
    const users = await response.json();
    
    // Verileri formatlayarak konsola yazdır
    users.forEach(user => {
      console.log("[ID: " + user.id + "] - İsim: " + user.name + " | E-posta: " + user.email);
    });
    
    return users;
  } catch (error) {
    console.error("Veri çekme işlemi başarısız oldu:", error.message);
    return [];
  }
}

// Örnek kullanım:
const API_URL = "https://jsonplaceholder.typicode.com/users";
fetchUsers(API_URL);
\`\`\`

#### **Bu Kodun Avantajları:**
1. **Asenkron Yapı (async/await):** Kodun okunabilirliğini artırır, callback cehennemini önler.
2. **Hata Yönetimi (Error Handling):** Ağ kopmaları veya hatalı API yanıtlarında uygulamanın çökmesini engeller.
3. **Kontrol Mekanizması:** 'response.ok' ile HTTP hata durumları (404, 500 vb.) yakalanır.`
};

const DEFAULT_ANSWER = `Merhaba! Ben **Mevzuat AI**, size mevzuat analizi, hukuki belge taslakları hazırlama, kod yazma ve genel konularda yardımcı olmak için tasarlanmış gelişmiş bir yapay zeka asistanıyım.

Sorunuzu dikkatle inceledim. Size şu şekillerde yardımcı olabilirim:

1. **Mevzuat İncelemesi**: Türkiye Cumhuriyeti kanunları, yönetmelikleri ve resmi genelgeleri hakkında özet ve analizler yapabilirim.
2. **Sözleşme Taslakları**: Kira, hizmet, gizlilik veya satış sözleşmeleri gibi metinleri hızlıca taslak haline getirebilirim.
3. **Kod ve Yazılım**: Yazılım projeleriniz için kod blokları yazabilir, hataları ayıklayabilir ve mimari tavsiyeler verebilirim.

**Size daha iyi yardımcı olabilmem için sorunuzu biraz daha detaylandırabilir misiniz?** Örneğin, aradığınız özel bir kanun maddesi mi var yoksa belirli bir hizmet sözleşmesi taslağına mı ihtiyacınız var?`;

// 5. POST message & Stream Response via Server-Sent Events (SSE) (Secured per-user, with credit check)
app.post('/api/chats/:id/message', authenticateUser, checkCredit, async (req, res) => {
  const chatId = req.params.id;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Mesaj içeriği boş olamaz.' });
  }
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY tanımlı değil. Lütfen .env dosyasını kontrol edin.' });
  }

  const chatRef = db.collection('users').doc(req.user.uid).collection('chats').doc(chatId);
  const chatDoc = await chatRef.get();

  if (!chatDoc.exists) {
    return res.status(404).json({ error: 'Sohbet bulunamadı veya bu sohbete erişim yetkiniz yok.' });
  }

  const chat = chatDoc.data();
  const messages = chat.messages || [];

  // 1. User message'ı kaydet
  const userMsg = {
    id: 'msg_' + Math.random().toString(36).substr(2, 9),
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  };
  messages.push(userMsg);

  // 2. Title — ilk mesajda kullanıcı metninin kısaltması
  const title = messages.length === 1
    ? (message.length > 40 ? message.substring(0, 40) + '...' : message)
    : chat.title;

  const now = new Date().toISOString();
  await chatRef.update({ messages, title, updatedAt: now });

  // 3. SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    // 4. Anthropic mesaj formatı
    const anthropicMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const stream = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: SYSTEM_INSTRUCTION,
      messages: anthropicMessages,
      stream: true
    });

    let accumulated = '';
    for await (const event of stream) {
      if (aborted) break;
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const text = event.delta.text;
        if (text) {
          accumulated += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
    }

    // 5. AI cevabını Firestore'a kaydet
    if (accumulated && !aborted) {
      const aiMsg = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: accumulated,
        timestamp: new Date().toISOString()
      };
      messages.push(aiMsg);
      await chatRef.update({ messages, updatedAt: new Date().toISOString() });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Anthropic error:', err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message || 'Anthropic hatası' })}\n\n`);
      res.end();
    }
  }
});

// 5. Expose Firebase configuration to frontend
app.get('/api/config', (req, res) => {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  res.json({
    projectId: projectId && projectId !== 'YOUR_FIREBASE_PROJECT_ID' ? projectId : null,
    apiKey: process.env.FIREBASE_API_KEY || null,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || null,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || null,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || null,
    appId: process.env.FIREBASE_APP_ID || null,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || null
  });
});

// 6. GET /api/subscription - Get user's subscription status
app.get('/api/stripe/prices', async (req, res) => {
  try {
    const [silver, gold, diamond, custom] = await Promise.all([
      stripe.prices.retrieve(process.env.STRIPE_PRICE_SILVER),
      stripe.prices.retrieve(process.env.STRIPE_PRICE_GOLD),
      stripe.prices.retrieve(process.env.STRIPE_PRICE_DIAMOND),
      stripe.prices.retrieve(process.env.STRIPE_PRICE_CUSTOM),
    ]);
    res.json({
      starter: silver.unit_amount / 100,
      pro: gold.unit_amount / 100,
      business: diamond.unit_amount / 100,
      custom: custom.unit_amount / 100,
    });
  } catch (err) {
    console.error('Prices fetch error:', err);
    res.status(500).json({ error: 'Fiyatlar alınamadı.' });
  }
});

app.get('/api/subscription', authenticateUser, async (req, res) => {
  try {
    const data = await ensureUserDoc(req.user.uid, req.user.email);
    const plan = data.plan || 'free';
    const creditsRemaining = data.creditsRemaining ?? 0;

    res.json({
      plan,
      creditsRemaining,
      creditsMax: PLAN_CREDITS[plan] || 10,
      stripeCustomerId: data.stripeCustomerId || null,
      stripeSubscriptionId: data.stripeSubscriptionId || null,
      subscriptionStatus: data.subscriptionStatus || null
    });
  } catch (err) {
    console.error('Subscription fetch error:', err);
    res.status(500).json({ error: 'Abonelik bilgisi alınamadı.' });
  }
});

// 7. POST /api/stripe/checkout - Create Stripe Checkout Session
app.post('/api/stripe/checkout', authenticateUser, async (req, res) => {
  try {
    const { planId, customAmount } = req.body;
    const userData = await ensureUserDoc(req.user.uid, req.user.email);

    if (customAmount) {
      // Pay-as-you-go: custom pack ($1 = 4 credits)
      const credits = customAmount * 4;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price: process.env.STRIPE_PRICE_CUSTOM,
          quantity: customAmount
        }],
        success_url: `${BASE_URL}/index.html?checkout=success`,
        cancel_url: `${BASE_URL}/pricing.html`,
        metadata: {
          uid: req.user.uid,
          credits: credits.toString(),
          type: 'custom_pack'
        }
      });

      return res.json({ sessionId: session.id, url: session.url });
    }

    // Subscription: starter/pro/business
    const priceMap = {
      starter: process.env.STRIPE_PRICE_SILVER,
      pro: process.env.STRIPE_PRICE_GOLD,
      business: process.env.STRIPE_PRICE_DIAMOND
    };

    if (!priceMap[planId]) {
      return res.status(400).json({ error: 'Geçersiz plan.' });
    }

    let customerId = userData.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { uid: req.user.uid }
      });
      customerId = customer.id;
      await db.collection('users').doc(req.user.uid).set({
        stripeCustomerId: customerId
      }, { merge: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{
        price: priceMap[planId],
        quantity: 1
      }],
      success_url: `${BASE_URL}/index.html?checkout=success`,
      cancel_url: `${BASE_URL}/pricing.html`,
      metadata: { planId }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message || 'Checkout oluşturulamadı.' });
  }
});

// 8. POST /api/stripe/portal - Create Stripe Customer Portal Session
app.post('/api/stripe/portal', authenticateUser, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data() || {};
    const customerId = userData.stripeCustomerId;

    if (!customerId) {
      return res.status(400).json({ error: 'Stripe müşteri bulunamadı.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${BASE_URL}/index.html`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Portal oturuşu oluşturulamadı.' });
  }
});

// 9. POST /api/stripe/webhook - Stripe Webhook Handler
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        if (session.mode === 'payment') {
          // Custom pack: uid is in session.metadata directly
          const uid = session.metadata.uid;
          const credits = parseInt(session.metadata.credits) || 0;
          if (credits > 0 && uid) {
            await db.collection('users').doc(uid).set({
              creditsRemaining: admin.firestore.FieldValue.increment(credits)
            }, { merge: true });
          }
        } else if (session.mode === 'subscription') {
          // Subscription: uid is in the Stripe customer's metadata, not session.metadata
          const planId = session.metadata.planId;
          if (planId && session.customer) {
            const customer = await stripe.customers.retrieve(session.customer);
            const uid = customer.metadata?.uid;
            if (uid) {
              const maxCredits = PLAN_CREDITS[planId] || 10;
              const resetAtMs = Date.now() + (30 * 24 * 60 * 60 * 1000);
              await db.collection('users').doc(uid).set({
                plan: planId,
                creditsRemaining: maxCredits,
                creditsResetAt: admin.firestore.Timestamp.fromMillis(resetAtMs),
                stripeSubscriptionId: session.subscription,
                subscriptionStatus: 'active'
              }, { merge: true });
            }
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const uid = customer.metadata.uid;

        if (uid) {
          const planId = subscription.items.data[0]?.price?.metadata?.planId || 'free';
          const maxCredits = PLAN_CREDITS[planId] || 10;

          await db.collection('users').doc(uid).set({
            plan: planId,
            subscriptionStatus: subscription.status
          }, { merge: true });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const uid = customer.metadata.uid;

        if (uid) {
          await db.collection('users').doc(uid).set({
            plan: 'free',
            creditsRemaining: 10,
            creditsResetAt: admin.firestore.Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000)),
            stripeSubscriptionId: null,
            subscriptionStatus: null
          }, { merge: true });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const customer = await stripe.customers.retrieve(subscription.customer);
          const uid = customer.metadata.uid;

          if (uid) {
            const planId = subscription.items.data[0]?.price?.metadata?.planId || 'free';
            const maxCredits = PLAN_CREDITS[planId] || 10;
            const resetAtMs = Date.now() + (30 * 24 * 60 * 60 * 1000);

            await db.collection('users').doc(uid).set({
              creditsRemaining: maxCredits,
              creditsResetAt: admin.firestore.Timestamp.fromMillis(resetAtMs),
              subscriptionStatus: 'active'
            }, { merge: true });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const customer = await stripe.customers.retrieve(subscription.customer);
          const uid = customer.metadata.uid;

          if (uid) {
            await db.collection('users').doc(uid).set({
              subscriptionStatus: 'past_due'
            }, { merge: true });
          }
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook işlenirken hata oluştu.' });
  }
});

// Serve UI for any unmatched route (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Mevzuat AI Server is running on port ${PORT}`);
  console.log(`👉 Open http://localhost:${PORT} in your browser`);
  console.log(`==================================================`);
});
