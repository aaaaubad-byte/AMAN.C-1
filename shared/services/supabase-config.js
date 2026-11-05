/*
 * AMAN.C — إعدادات الاتصال العامة بـ Supabase (للمتصفح).
 *
 * يحتوي هذا الملف قيمتين عامتين فقط، مخصصتين بطبيعتهما للاستخدام داخل المتصفح:
 *   - عنوان المشروع (Project URL).
 *   - مفتاح النشر العام (Publishable key). حمايته تعتمد على RLS ودوال RPC الموثوقة في قاعدة البيانات.
 *
 * ممنوع وضع أي سر هنا أو في أي ملف JavaScript أو في المستودع:
 *   مفتاح الخدمة الإداري (secret)، كلمة مرور قاعدة البيانات، أو أي مفتاح إداري.
 */
(() => {
"use strict";
window.AMAN_SUPABASE_CONFIG = Object.freeze({
 url: "https://hzurzkjtjvkfxmwzskks.supabase.co",
 publishableKey: "sb_publishable_nhuRIWsuEwz-QhjkNhTYyg_kne0byL6"
});
})();
