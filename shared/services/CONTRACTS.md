# عقود الخدمات — AMAN.C (`shared/services/CONTRACTS.md`)

> تصف هذه الوثيقة واجهات الخدمات التي تعتمد عليها واجهتا العميل والإدارة، وتحدد ما يجب أن ينفذه محوّل الخدمات. يستخدم التشغيل العادي محوّل Supabase الحالي عبر `shared/services/runtime.js` و`shared/services/supabase-adapter.js`، بينما تُحقن المحاكاة المحلية حصراً بواسطة خادم المعاينة المحلي. قرار D13 القديم بشأن تأجيل اختيار المزود استُبدل لاحقاً باعتماد قاعدة Supabase الحالية نفسها؛ ولا يعني ذلك السماح بتعديل مخطط القاعدة أو تطبيق ترحيل دون موافقة صريحة. راجع `docs/DATABASE.md` للحالة الحية والتحذيرات.

## 1. الغلاف العام لكل عملية

الواجهات لا تستدعي المحوّل مباشرة؛ تستدعي `window.AMANClientServices.<op>(payload)` و`window.AMANAdminServices.<op>(payload)` (الغلاف في `shared/services/runtime.js`):

- كل عملية `async` وتُرجع كائنًا دائمًا، ولا تُلقي استثناءً للمستدعي.
- النجاح: `{ success: true, ...بيانات }`.
- الفشل: `{ success: false, code: "<رمز>", message: "<نص عربي للعرض>" }`. إن أرجع المحوّل فشلًا بلا `code` يُجعل `request_failed`، وبلا `message` يُجعل «لم تُنفَّذ العملية.»
- استثناء داخل المحوّل ← `{ success:false, code:"service_unreachable" }`.
- لا محوّل مسجَّل ← `service_not_configured`؛ عملية غير منفذة في المحوّل ← `method_not_implemented`. لا يجوز اصطناع نجاح ولا بيانات.
- الواجهة تُظهر «تم» بعد `success === true` فقط، وتعرض `message` كما وصلت.

## 2. رموز الأخطاء المشتركة

| الرمز | المعنى |
|---|---|
| `auth_required` | لا جلسة أو انتهت (عميل أو مدير بحسب النطاق) |
| `admin_required` | العملية تتطلب صلاحية الإدارة |
| `validation_failed` | بيانات إدخال غير صالحة (إدارة) |
| `invalid_request` | بيانات الطلب ناقصة أو غير صالحة |
| `not_found` | عنصر غير موجود |
| `service_not_configured` / `method_not_implemented` / `service_unreachable` / `request_failed` | من الغلاف |

رموز خاصة بالعمليات مذكورة في أقسامها.

## 3. الصلاحيات والمصادقة

- **عميل:** كل عمليات `client` ما عدا `signIn` و`signUp` تتطلب جلسة عميل نشط (`status = active`)، وإلا `auth_required`. العميل يرى بياناته فقط؛ رقم غيره لا يكشف إلا الحالة العامة (`other_protected` أو `not_subscribed`) دون هوية المالك.
- **مدير:** كل عمليات `admin` ما عدا `signInAdmin` تتطلب جلسة مدير، وإلا `auth_required`. حساب العميل لا يدخل الإدارة ولا العكس.
- العميل المعطَّل لا يستطيع الدخول، وتعطيله ينهي جلسته.
- **المحاكاة** تخزّن كلمات المرور نصًا وهي ليست نظام مصادقة؛ قاعدة البيانات ستحتاج: تجزئة كلمات المرور، جلسات حقيقية، تحقق من الصلاحية على الخادم لكل عملية (لا الاعتماد على الواجهة)، وسياسات وصول على مستوى الصفوف (العميل لا يقرأ إلا صفوفه).

## 4. عقود العميل (`client`)

| العملية | المدخل | الناتج عند النجاح | أخطاء خاصة |
|---|---|---|---|
| `getSession` | — | `{ user: {id,email,full_name,account_type,status} \| null }` (`account_type`: `user` أو `customer` بعد أول طلب معتمد) | — |
| `signIn` | `{email, password}` | `{ user }` وتنشأ جلسة | `invalid_credentials` (رسالة موحدة لا تكشف أي الحقلين خطأ) |
| `signUp` | `{email, password}` | `{ user }` وتنشأ جلسة | `invalid_email`، `weak_password` (أقل من 4 في المحاكاة)، `email_taken` |
| `signOut` | — | — | |
| `lookupNumber` | `{phone}` | `{ number }` بإحدى الحالات الخمس أدناه | `invalid_number` (7–15 رقمًا بعد تطبيع الأرقام الهندية/الفارسية)، `no_companies`، `unknown_prefix`، `invalid_length` |
| `listMyNumbers` | — | `{ items: [numberView] }` | |
| `listMyOperations` | — | `{ items: [{id,request_number,type,status,phone,company,package_name,duration_days,price_yer,payment_method,payment_reference,created_at,rejection_reason,rejection_note}] }` | |
| `getProtectionCatalog` | `{company_id?, operation_type?}` | `{ packages: [{id,name,company_id,operation_type,duration_days,price_yer}], payment_methods: [{id,name,account_number,instructions,reference_required,reference_pattern}] }` (النشط فقط) | |
| `submitProtectionRequest` | `{phone, operation_type, company_id, package_id, payment_method_id, payment_reference}` | `{ request_id, request_number }` | `invalid_request`، `unavailable_package`، `reference_required`، `reference_format`، `reference_pattern_invalid`، `operation_not_allowed`، `reactivation_disabled`، `reactivation_window_closed` |
| `updateProfile` | `{full_name}` (حتى 120) | — | `invalid_name` |
| `changePassword` | `{current_password, new_password}` | — | `wrong_password`، `weak_password` |
| `getNotifications` | — | `{ items: [{id,title,body,created_at,read_at}] }` | |
| `markNotificationRead` | `{notification_id}` | — | `not_found` |
| `listNumberAlerts` | `{phone}` | `{ items: [{id,title,body,created_at,read_at}] }` (لرقم يملكه العميل فقط) | `not_found` |
| `submitReport` | `{phone, reason_code, reason_text?}` | `{ report_id }` | `invalid_reason`، `reason_text_required` (للسبب `other`)، `reason_text_too_long` (>2000)، `report_not_allowed`، `duplicate_report` |

**الحالات الخمس للرقم (`lookupNumber`)**: `not_subscribed` (غير مشترك)، `other_protected` (محمي لدى غيره، بلا أي تفاصيل عن المالك)، ولرقم العميل نفسه: `protected` (مع اسم الباقة والمدة وبداية ونهاية الاشتراك والمتبقي)، `inactive` (مع `last_activation_date` = آخر موعد للتنشيط)، `confiscated` (منتهٍ-مصادَر).

**أسباب البلاغ** (`reason_code`): `mine`، `lost_access`، `unauthorized`، `other`. لا بلاغ على رقم العميل نفسه ولا على رقم غير محمي، ولا بلاغ ثانٍ مفتوح من العميل نفسه للرقم نفسه.

**أهلية العملية** (تُفحص عند الإرسال وعند الاعتماد):
- `activation`: الرقم غير موجود، أو موجود لدى عميل آخر وليس محميًا.
- `extension`: الرقم محمي ولدى العميل نفسه.
- `reactivation`: الرقم `inactive` ولدى العميل نفسه، وقبل نهاية يوم (تاريخ المصادرة − مهلة التنشيط)؛ وإلا `reactivation_window_closed`، وإن كان التنشيط موقوفًا للشركة `reactivation_disabled`.

## 5. عقود الإدارة (`admin`)

| المجموعة | العمليات |
|---|---|
| الجلسة | `getCurrentAdmin`، `signInAdmin {email,password}` (`invalid_credentials`)، `signOutAdmin` |
| الرئيسية | `getDashboardSummary` ← `{ summary: {pending_requests, protected_numbers, open_reports, due_tasks, customers, approved_revenue_yer} }` |
| الطلبات | `listRequests {status?, operation_type?, company_id?, search?}`، `getRequestDetails {request_id}` (يتضمن `warnings` و`approval_blocked_reason`)، `getApprovalPreview {request_id}` (`not_pending`، `approval_blocked`)، `getRejectReasons`، `approveRequest {request_id}`، `rejectRequest {request_id, reason_code, explanation?}` (`invalid_reason`، `explanation_too_long` >300، `not_pending`) |
| الأرقام | `listNumbers {status?, search?}`، `getNumberDetails {number_id}` |
| العملاء | `listCustomers {type?, status?, search?}`، `getCustomerDetails {customer_id}` (لا يُرجع كلمة المرور)، `updateCustomerStatus {customer_id, status: active\|disabled, reason?}` (`invalid_status_change`) |
| المهام | `listTasks`، `getTaskDetails {task_id}`، `executeTask {task_id}` (`task_not_available`، `task_not_executable`)، `previewTaskReschedule {task_id, new_due_at}`، `rescheduleTask {task_id, new_due_at}` (`invalid_request`، `task_not_reschedulable`، `invalid_date`) |
| التقارير | `getRevenueReport {days?: عدد \| "all"}` ← `{count,total_yer,period_label,by_operation,by_company,by_package,by_payment,operations}` |
| البلاغات | `listComplaints`، `decideComplaint {report_id, decision: no_action\|terminate_protection, reason}` (السبب إلزامي؛ `invalid_request`، `no_active_protection`) |
| الإشعارات والتنبيهات | `listAdminNotifications`، `createAdminNotification {title, body, customer_id?}` (بلا `customer_id` = لكل العملاء)، `listAdminAlerts`، `createAdminAlert {number_id, title, body}` (`invalid_relation`) |
| الشركات | `listCompanies`، `previewCompanySettings {company_id, task_interval_days}`، `saveCompanySettings {...}` |
| الباقات | `listPackages`، `savePackage {id?, company_id, operation_type, name, days, price_yer, active}` |
| وسائل الدفع | `listPaymentMethods`، `savePaymentMethod {id?, name, account_number?, instructions, reference_required?, reference_pattern?, active?}` (D9) |
| المحتوى | `getAppContent`، `saveAppContent {key: terms\|privacy\|contact\|help, body}` |
| التدقيق | `listAuditLog {limit?}` |

**التحقق من إعدادات الشركة** (`saveCompanySettings`، الرمز `validation_failed`، وتكرار الاسم `duplicate_name` وتعارض البادئات `prefix_conflict`):
`name` مطلوب وفريد؛ `prefixes` أرقام فقط وغير مكررة ولا تتقاطع مع شركة أخرى؛ `number_lengths` أعداد صحيحة موجبة؛ `task_interval_days` عدد صحيح ≥ 1؛ `task_due_window_days` **مطلوب لكل شركة جديدة** بلا قيمة افتراضية، عدد صحيح ≥ 0 (في التعديل إن غاب بقيت القيمة الحالية)؛ `reactivation_days` عدد صحيح ≥ 0؛ و`is_active` و`create_first_task` و`reactivation_enabled` منطقية.

**التحقق من الباقة:** الشركة موجودة، الاسم غير فارغ، `days` و`price_yer` أعداد صحيحة موجبة، `operation_type` من (`activation`، `extension`، `reactivation`).

**وسيلة الدفع (D9):** الاسم والتعليمات مطلوبان؛ `account_number` نص حتى 100 حرف ويُقصّ؛ إن غاب في التعديل مُسح؛ `reference_required` الافتراضي true؛ `reference_pattern` تعبير نمطي صالح.

**أسباب الرفض المعتمدة:** `bad_reference`، `amount_short`، `not_received`.

**التدقيق:** كل إجراء إداري ناجح يضيف سجلًا (الإجراء، نوع الكيان ومعرّفه، ملخصًا، اسم المنفذ، الوقت). الفاشل لا يُسجَّل كنجاح.

## 6. قواعد العمل الملزمة للخلفية (المصادرة والمهام)

هذه قواعد معتمدة من صاحب المشروع (`docs/DECISIONS.md`: D2/D4/D5/D6 وتوضيحات 2026-11-01) **ويجب أن ينفذها أي محوّل مستقبلي بالنتائج نفسها**:

1. **التقويم والتوقيت:** ميلادي، وتوقيت `Asia/Aden` (UTC+3 ثابت، بلا توقيت صيفي). اليوم يبدأ ويتنهي بتوقيت عدن، وآخر لحظة فيه هي `23:59:59.999`.
2. **الفاصل الدوري** للشركة (`task_interval_days`) هو مهلة المصادرة نفسها.
3. **مهمة قادمة واحدة** مخزنة لكل رقم. موعدها = **تاريخ المصادرة** (آخر يوم في الفاصل). المهام الأبعد تُحسب ولا تُخزَّن.
4. **مرجع المخطط** `plan_anchor_at` لكل رقم: يوم بداية الاشتراك الأول، ثم يوم تنفيذ آخر مهمة. **لا يغيّره التمديد ولا التنشيط.** موعد المهمة التالية المحسوب = يوم المرجع + الفاصل.
5. **لا مهمة خارج نطاق الاشتراك:** تُنشأ المهمة القادمة فقط إن كان موعدها ≤ نهاية الاشتراك. وإن لم تُنشأ فتاريخ المصادرة = موعدها المحسوب (المرجع + الفاصل). التمديد والتنشيط يستكملان المخطط من المرجع نفسه فتُنشأ المهمة الناقصة إن صار موعدها ضمن الاشتراك الجديد، **بموعدها الأصلي نفسه**.
6. **اشتراك جديد (`activation` معتمد)** يبدأ مخططًا جديدًا: تُسقط أي مهمة قادمة قديمة للرقم ويكون المرجع يوم الاعتماد. المهام المنفذة تبقى سجلًا.
7. **التنفيذ** (`executeTask`): جائز في أي وقت داخل الفاصل (مبكرًا أيضًا) **والرقم محمي فقط**؛ بعد انتهاء الاشتراك `task_not_executable`. التنفيذ يسجّلها مكتملة ويجعل يوم التنفيذ مرجعًا جديدًا ثم تُخطَّط التالية وفق قاعدة 5.
8. **المصادرة:** يصبح الرقم `confiscated` بعد نهاية يوم تاريخ المصادرة (موعد المهمة المخزنة، أو المحسوب من المرجع) **حتى أثناء الحماية** إن لم تُنفَّذ المهمة ولم تُعد جدولتها. الرقم المحمي ينتقل إلى `inactive` عند انتهاء الاشتراك.
9. **نافذة الظهور** (`task_due_window_days`): تظهر المهمة `due` ابتداءً من (بداية يوم موعدها − النافذة) ولا تغيّر الموعد ولا تاريخ المصادرة. قبل ذلك `planned`.
10. **التنشيط:** آخر لحظة = نهاية يوم (تاريخ المصادرة − `reactivation_days`) (المهلة 0 = حتى يوم المصادرة). بعدها `reactivation_window_closed`. `reactivation_enabled = false` يمنعه كليًا `reactivation_disabled`. لا يغيّر تاريخ المصادرة.
11. **إعادة الجدولة** (`rescheduleTask`): للمهمة القادمة وحدها، بالزيادة أو النقصان، **لأرقام محمية فقط** (`task_not_reschedulable`)، وبتاريخ غير سابق لليوم (`invalid_date`). المهام اللاحقة تُزاح تبعًا لأنها محسوبة منها. المعاينة تُرجع `{affected_count, new_due_at, confiscation_date}`.
12. **تغيير الفاصل للشركة** يزيح المهام القادمة غير المنفذة بفرق الأيام.
13. **عند الاعتماد** يُعاد فحص الأهلية (`approval_blocked`)؛ والحساب المعطَّل لا يُعتمد له اشتراك جديد.
14. **قرار مفتوح موثق:** شركة إعدادها `create_first_task = false` ليس لها مخطط مهام؛ يبقى لها السلوك السابق (تاريخ المصادرة = نهاية الاشتراك + مهلة التنشيط). وكذلك لم يُحسم هل تُمنع إعادة الجدولة اليدوية إلى ما بعد نهاية الاشتراك (مسموحة حاليًا).

## 7. أشكال البيانات التي ستحتاجها قاعدة البيانات لاحقًا (دون اختيار مزود)

كيانات: مستخدمون (عميل/مدير، الحالة، سبب التعطيل وسجله)، شركات (الإعدادات في قسم 5)، باقات، وسائل دفع، طلبات (بما فيها `number_status_at_submit` وسبب الرفض وتوضيحه)، أرقام (المالك، بداية ونهاية الاشتراك، الباقة، `plan_anchor_at`، الأحداث)، مهام (الرقم، الموعد، الحالة، وقت التنفيذ)، إشعارات (مع `origin_id` للإشعار اليدوي الجماعي وحالة القراءة لكل عميل)، تنبيهات أرقام، بلاغات (القرار وسببه وتاريخه)، سجل تدقيق، ونصوص ثابتة (`terms`، `privacy`، `contact`، `help`).

متطلبات تفرضها القواعد: فهرس فريد على الرقم؛ عمليات الاعتماد والتنفيذ ذرّية (معاملة واحدة تغيّر الطلب والرقم والمهمة والإشعار والتدقيق)؛ منع الطلب المكرر المتزامن؛ حساب الزمن على الخادم لا على جهاز المستخدم؛ وصول العميل لصفوفه فقط؛ كلمات مرور مجزّأة؛ لا كشف لمالك رقم لعميل آخر.

## 8. ما لا يغطيه العقد حاليًا

دفع حقيقي، إرسال بريد/رسائل، رفع ملفات، استعادة كلمة المرور، تعدد المديرين وأدوارهم. أي إضافة تُسجَّل هنا أولًا ثم في المحوّل والاختبار.

## 9. اختبار المطابقة

`tests/contract.test.mjs` يتحقق من الغلاف والصلاحيات وأشكال النتائج ورموز الأخطاء وقواعد القسم 6 المركزية. افتراضيًا يحمّل محوّل المحاكاة في بيئة `vm` بساعة قابلة للتحكم. لتوجيهه إلى محوّل آخر: اضبط `AMAN_CONTRACT_HARNESS` على مسار وحدة ES تصدّر `createHarness()` تُرجع `{ client, admin, setNow }` (ساعة قابلة للتحكم؛ إن لم تتوفر تُتخطى اختبارات الزمن مع تسجيل ذلك).

تشغيل: `node --test tests/contract.test.mjs`. **لم يُشغَّل بعد؛ لا يُعدّ ناجحًا.**
