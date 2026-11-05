# البنية المعمارية المرجعية لـ AMAN.C-1

## الهدف
تنظيم ملفات AMAN.C-1 دون إعادة كتابة المنتج أو تغيير قواعده أو وظائفه أو واجهاته أو قاعدة بياناته. تبقى التقنية الأساسية HTML وCSS وJavaScript.

## الشجرة

```text
AMAN.C-1/
├── README.md
├── AGENTS.md
├── package.json
├── index.html
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── WORK_RULES.md
│   ├── MIGRATION_MAP.md
│   ├── DECISIONS.md
│   ├── RESUME.md
│   ├── HISTORY.md
│   └── SCREEN_MAP_BASELINE.md
├── apps/
│   ├── customer/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── notifications-tabs.js
│   │   ├── manifest.webmanifest
│   │   └── sw.js
│   └── admin/
│       ├── index.html
│       ├── app.js
│       ├── login.css
│       ├── manifest.webmanifest
│       ├── sw.js
│       └── modules/
│           ├── numbers.js
│           ├── requests.js
│           ├── customers.js
│           ├── tasks-reports.js
│           ├── operations.js
│           └── management.js
├── shared/
│   ├── services/
│   │   ├── runtime.js
│   │   ├── supabase-config.js
│   │   ├── supabase-adapter.js
│   │   ├── theme.js
│   │   ├── pwa.js
│   │   └── CONTRACTS.md
│   ├── components/
│   │   ├── visual-layer-loader.js
│   │   ├── visual-layer.js
│   │   ├── compact-filters.js
│   │   └── pull-to-refresh.js
│   └── styles/
│       ├── app.css
│       └── visual-layer.css
├── assets/
│   ├── brand/
│   └── icons/
│       ├── customer/
│       └── admin/
├── simulation/
├── supabase/
│   └── migrations/
│       └── README.md
├── tests/
├── scripts/
└── .github/workflows/validate.yml
```

## اختصاص المجلدات
- `apps/customer`: واجهة العميل وسلوكها فقط.
- `apps/admin`: واجهة الإدارة؛ وتقسم `modules` الوظائف حسب المجال لا حسب أرقام مراحل التطوير.
- `shared/services`: runtime وعقود الخدمات وإعداد ومحوّل Supabase والسمة وتسجيل PWA المشترك.
- `shared/components`: طبقة العرض والفلاتر والتحديث بالسحب المشتركة.
- `shared/styles`: الأنماط المشتركة؛ و`login.css` يبقى خاصاً بالإدارة.
- `assets/icons/customer` و`assets/icons/admin`: أيقونات مستقلة لأن محتواها مختلف، و`assets/brand` لشعارات العلامة.
- `simulation`: محوّل محلي لا يُحمّل في صفحات الإنتاج.
- `supabase/migrations`: الترحيلات الجديدة فقط؛ لا يعاد استخدام الترحيل القديم.
- `tests` و`scripts`: التحقق والاختبارات والبناء والمعاينة.

## قرارات تصميم البنية
- لا توجد طبقة `shared/utils` مستقلة حالياً؛ وظائف التنسيق المشتركة موجودة في runtime، ولا مبرر لإنشاء مجلد عام فارغ.
- لا توحّد Service Workers؛ لكل تطبيق نطاق تخزين مؤقت وموارد مستقل. يوحّد فقط سكربت تسجيل PWA.
- لا تعتمد الخدمات المشتركة على تطبيق بعينه. التطبيقات تعتمد على shared، ولا تستدعي قاعدة البيانات مباشرة.
- يحافظ التنظيم على RTL والخطوط والألوان الحالية؛ ملفات CSS هي مرجع الهوية البصرية ولا توجد إعادة تصميم.

## تحميل التطبيق وPWA
تحمّل الصفحات خدمة السمة ومحمّل الطبقة المرئية والأنماط، ثم runtime ومكتبة Supabase والإعداد والمحوّل، ثم المكونات المشتركة وتطبيق الواجهة ووحداته. يسجل سكربت PWA المشترك عاملي خدمة منفصلين، ويحتفظ كل عامل بقائمة cache خاصة بتطبيقه.

## حدود غير قابلة للتجاوز
لا تعديل على AMAN.C الأصلي، ولا تغيير على قواعد المنتج أو قاعدة Supabase الحية، ولا نشر إنتاجي أو إضافة أسرار أثناء إعادة التنظيم.
