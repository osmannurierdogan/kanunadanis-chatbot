# Mevzuat AI - ChatGPT Klonu (MVP)

Bu proje, ChatGPT'nin modern, yüksek kaliteli ve akıcı kullanıcı deneyimini birebir sunan, Türkiye mevzuat analizleri ve genel sorular için tasarlanmış bir **ChatGPT Klonu MVP** uygulamasıdır.

Uygulama, ağır yazılım mimarilerinden arındırılmış, hafif ve çalışan bir MVP olarak inşa edilmiştir. İlerleyen süreçte LLM (yapay zeka modeli) entegrasyonu ve veri tabanı bağlantısı kolayca yapılabilecek şekilde hazırlanmıştır.

---

## 🚀 Teknolojik Altyapı & Özellikler

1. **Ön Yüz (Frontend)**:
   - **Modern & Premium Tasarım**: ChatGPT arayüzüne tıpatıp benzeyen modern koyu tema (`#171717`, `#212121`), cam efekti (glassmorphism) ve yumuşak animasyonlar.
   - **Markdown & Kod Desteği**: Sunucudan gelen zengin Markdown verilerini (kalın yazılar, listeler, tırnaklar, tablolar) otomatik olarak dönüştürür.
   - **PrismJS Sözdizimi Vurgulama**: Kod bloklarını otomatik olarak renklendirir ve dile göre ayrıştırır.
   - **Tek Tıkla Kopyalama**: Hem kod blokları hem de tüm yapay zeka mesajları için pratik "Kopyala" butonları.
   - **Responsive & Mobil Uyumlu**: Kenar çubuğu (sidebar) mobil cihazlarda gizlenebilir ve kaydırarak açılabilir.
   - **Kelime Akış Efekti (Streaming)**: SSE (Server-Sent Events) aracılığıyla kelimelerin akan bir imleç (flashing cursor) eşliğinde harf harf ekrana yansıması.

2. **Arka Yüz (Backend)**:
   - **Node.js & Express**: Hızlı ve güvenilir yerel web sunucusu.
   - **Server-Sent Events (SSE)**: Yapay zeka yanıtlarının gerçek zamanlı akış halinde iletilmesi.
   - **Sohbet Geçmişi Kalıcılığı**: Sohbetler sunucu tarafında `data/chats.json` dosyasına kaydedilir. Sayfa yenilendiğinde veya sunucu kapatılıp açıldığında sohbet geçmişiniz kaybolmaz.
   - **Otomatik Başlık Oluşturma**: Sohbetin konusuna göre ilk mesajdan sonra sohbet başlığı otomatik olarak güncellenir.
   - **Özel Arama Anahtarları**: "Sözleşme", "Mevzuat/Kanun/Yıllık İzin" veya "Kod/Yazılım" kelimelerini içeren promptlara zengin Markdown formatlı özel yanıtlar üretilir, diğer sorular için akıllı asistan yanıtı verilir.

---

## 🛠️ Kurulum ve Çalıştırma

Uygulamayı yerel bilgisayarınızda çalıştırmak oldukça basittir. Node.js yüklü olduğundan emin olduktan sonra aşağıdaki adımları izleyin:

### 1. Bağımlılıkları Yükleyin
Proje ana dizininde terminali açın ve gerekli paketleri yükleyin:
```bash
npm install
```

### 2. Uygulamayı Başlatın
Uygulamayı başlatmak için iki farklı komut kullanabilirsiniz:

- **Üretim Modu (Normal Başlatma)**:
  ```bash
  npm start
  ```
- **Geliştirici Modu (Otomatik Yeniden Başlatma - Node 20+)**:
  ```bash
  npm run dev
  ```

### 3. Tarayıcıda Açın
Uygulama başarıyla başlatıldıktan sonra tarayıcınızdan şu adrese gidin:
👉 [**http://localhost:3000**](http://localhost:3000)

---

## 🔮 Gelecek İyileştirmeler & LLM Entegrasyonu

Uygulamamız, yapay zeka yanıt kaynağını değiştirmeye tamamen hazırdır. LLM'i bağlamak için:
1. `server.js` dosyasındaki `/api/chats/:id/message` uç noktasında bulunan mock veri üretici yerine gerçek bir API (Örn: **Gemini API** veya **OpenAI API**) çağrısı ekleyebilirsiniz.
2. API yanıtını okuyup `res.write()` ile stream ederek ön yüze anlık iletebilirsiniz.
3. Sohbet verilerini saklamak için JSON dosyası yerine SQLite, PostgreSQL veya MongoDB gibi bir veri tabanına geçiş yapabilirsiniz.
