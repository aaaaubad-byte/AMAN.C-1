# خريطة النقل وإعادة التنظيم

## جرد المصدر
- المصدر المعتمد: `aaaaubad-byte/AMAN.C` على `main`.
- شجرة المصدر: 105 ملفات.
- نسخة AMAN.C-1 قبل إعادة التنظيم: 66 ملفاً.
- لم تُنقل 49 ملفاً بمساراتها؛ تصنيفها موضح أدناه. خريطة الشاشة الأصلية نُقلت إلى `docs/SCREEN_MAP_BASELINE.md`.

## خريطة المسارات

| المصدر | الوجهة في AMAN.C-1 | الإجراء |
|---|---|---|
| `index.html` | `index.html` | تحديث روابط التطبيقات والأصول |
| `client/index.html` | `apps/customer/index.html` | نقل وتحديث المسارات |
| `client/app.js` | `apps/customer/app.js` | نقل |
| `client/ui-v5.js` | `apps/customer/notifications-tabs.js` | إعادة تسمية حسب المسؤولية |
| `client/manifest.webmanifest` | `apps/customer/manifest.webmanifest` | نقل وتحديث id والأيقونات |
| `client/sw.js` | `apps/customer/sw.js` | نقل وتحديث قائمة التخزين المؤقت |
| `client/pwa.js` و`admin/pwa.js` | `shared/services/pwa.js` | توحيد سكربت التسجيل بعد مطابقة السلوك |
| أيقونات العميل v3 | `assets/icons/customer/` | نقل وإعادة تسمية إلى أسماء معيارية |
| `admin/index.html` | `apps/admin/index.html` | نقل وتحديث المسارات |
| `admin/app.js` | `apps/admin/app.js` | نقل؛ لا يحذف مسار القرار المكرر قبل نجاح الاختبارات |
| `admin/login.css` | `apps/admin/login.css` | نقل |
| `admin/phase3-a5-a8.js` | `apps/admin/modules/numbers.js` و`requests.js` | فصل الأرقام عن قرارات الطلبات |
| `admin/phase3-a9-a12.js` | `apps/admin/modules/customers.js` | إعادة تسمية |
| `admin/phase3-a13-a17.js` | `apps/admin/modules/tasks-reports.js` | إعادة تسمية |
| `admin/phase4-a18-a25.js` | `apps/admin/modules/operations.js` | إعادة تسمية |
| `admin/phase5-a26-a31.js` | `apps/admin/modules/management.js` | إعادة تسمية |
| أيقونات الإدارة v3 | `assets/icons/admin/` | نقل وإعادة تسمية |
| `services/runtime.js` | `shared/services/runtime.js` | نقل |
| `services/supabase-config.js` | `shared/services/supabase-config.js` | نقل |
| `services/supabase-adapter.js` | `shared/services/supabase-adapter.js` | نقل |
| `services/theme.js` | `shared/services/theme.js` | نقل وفصل محمّل الطبقة المرئية |
| `services/CONTRACTS.md` | `shared/services/CONTRACTS.md` | نقل وتحديث وصف Supabase |
| `services/aman-ui-v6.js` | `shared/components/visual-layer.js` | إعادة تسمية |
| `services/compact-filters.js` | `shared/components/compact-filters.js` | نقل إلى المكونات |
| `services/pull-to-refresh.js` | `shared/components/pull-to-refresh.js` | نقل إلى المكونات |
| `styles/app.css` | `shared/styles/app.css` | نقل |
| `styles/visual-v6.css` | `shared/styles/visual-layer.css` | نقل وإعادة تسمية |
| شعارات PNG ذات اللاحقة v2 | `assets/brand/logo-mark*.png` | إعادة تسمية دون تغيير الصورة |
| `scripts/build-pwa.mjs` | المسار نفسه | تحديث مجلدي التطبيقات |
| `scripts/local-preview.mjs` | المسار نفسه | تحديث المسارات والحقن المحلي |
| `scripts/validate.mjs` | المسار نفسه | تحديث الملفات والمراجع المفحوصة |
| `scripts/color-audit/*` | المسارات نفسها | إبقاء |
| `simulation/simulation-adapter.js` | المسار نفسه | إبقاء؛ المحاكاة محلية فقط |
| `simulation/README.md` | المسار نفسه | تحديث تعليمات التشغيل |
| `tests/*` | المسارات نفسها | تحديث المسارات وتوسيع فحص الهيكل |
| `docs/PRODUCT.md` و`DATABASE.md` | المساران نفسيهما | تحديث المراجع وتوثيق التعارضات |
| `docs/DECISIONS.md` | المسار نفسه | استعادة قرارات المالك وتمييز D13 المتجاوز |
| `docs/WORKFLOW.md` | `docs/WORK_RULES.md` | إعادة تسمية وتوحيد قواعد العمل |
| `docs/PROGRESS_LOG.md` وبقية الوثائق التاريخية | `docs/HISTORY.md` و`DECISIONS.md` و`RESUME.md` | تلخيص المعلومات المهمة لا نسخ النسخ المتعارضة |
| `AMAN_C_SCREEN_MAP_BASELINE.md` | `docs/SCREEN_MAP_BASELINE.md` | نقل سابقاً؛ المرجع محفوظ |
| `supabase/migrations/20261101000100_initial_schema.sql` | لا ينقل | ترحيل قديم لا يطابق القاعدة الحية |
| `.github/workflows/deploy.yml` | لا ينقل | النشر مؤجل ويحتاج موافقة |
| `.github/workflows/validate-product.yml` | يستبدل بـ`.github/workflows/validate.yml` | فحص موحد بلا نشر |

## الملفات المستبعدة

### 24 أصلاً بصرياً قديماً
نسخ أيقونات قديمة وSVG بديلة في مجلدي العميل والإدارة وشعارات SVG قديمة. لم تظهر إحالات لها في ملفات HTML وCSS وJavaScript وmanifest وService Worker التشغيلية التي فُحصت. احتُفظ بالأيقونات v3 المعتمدة وبشعاري PNG المستخدمين فقط.

### 22 وثيقة تاريخية
توجيهات الاستكمال وتقارير المراحل وسجلات تقدم الواجهات وتهيئة Supabase. حُفظت قرارات المالك في `DECISIONS.md`، وقواعد العمل في `WORK_RULES.md`، والتاريخ المختصر في `HISTORY.md`. لا تُنسخ كل النسخ المتتابعة إلى المرجع النشط.

### ملفات تشغيل قديمة
- Workflow النشر الأصلي لم يُنقل.
- Workflow التحقق القديم استُبدل بفحص موحد.
- الترحيل المحلي القديم لا يطابق القاعدة الحية، لذلك لا ينقل ولا يطبق.

## شروط إكمال النقل
- لا تحذف المسارات القديمة إلا بعد التأكد من وجود وجهاتها الجديدة.
- افحص كل روابط HTML وCSS وJS وPWA والاختبارات والسكريبتات والتوثيق.
- لا تحذف تنفيذ القرار المكرر في `apps/admin/app.js` إلا بعد نجاح الاختبارات المرتبطة به.
- لا تعلن اكتمال البنية قبل نجاح CI على commit البنية الجديدة.
