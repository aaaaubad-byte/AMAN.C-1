/* AMAN.C — سلوك عرضي لعناصر المرجع v5 في واجهة العميل: شريط تبويب تصفية الإشعارات.
   يكتب القيمة في الحقل المخفي #notification-filter ويطلق حدث change الذي يستمع إليه client/app.js. لا يلمس البيانات ولا الخدمات. */
(() => {
"use strict";
const tabs = document.getElementById("notification-tabs"), input = document.getElementById("notification-filter");
if (!tabs || !input) return;
tabs.addEventListener("click", event => {
 const button = event.target.closest("button[data-filter]");
 if (!button) return;
 input.value = button.dataset.filter;
 tabs.querySelectorAll("button").forEach(node => node.setAttribute("aria-selected", String(node === button)));
 input.dispatchEvent(new Event("change", { bubbles: true }));
});
})();
