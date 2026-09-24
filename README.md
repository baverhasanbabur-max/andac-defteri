# Andaç Defteri — Cloudflare ücretsiz sürüm

Bu sürüm Render Persistent Disk gerektirmez. Cloudflare Workers + D1 kullanır.

## Deploy
1. Cloudflare hesabı açın.
2. Workers & Pages > Create application > Import an existing Git repository ile bu projeyi GitHub'dan bağlayın.
3. D1 database oluşturun: `andac-defteri-db`.
4. `wrangler.toml` içindeki `REPLACE_WITH_D1_DATABASE_ID` yerine D1 ID'yi yazın.
5. İlk deploydan sonra D1 Console'da `migrations/0001_init.sql` çalıştırın veya Wrangler ile `npm run db:init` çalıştırın.
6. Worker Settings > Variables and Secrets kısmına `ADMIN_PIN` secret ekleyin.
7. Deploy edin. Adres `https://andac-defteri.<hesabiniz>.workers.dev` olacaktır.

## Not
Cloudflare Workers Free ve D1 Free bu proje için kullanılabilir; ücretsiz kullanım limitleri vardır. Öğrenci fotoğrafları harici URL olarak tutulur. Kendi fotoğraflarınızı eklemek isterseniz sonraki sürümde Cloudflare R2 eklenebilir.
