(() => {
"use strict";
const $=id=>document.getElementById(id);
const dashboard=$("dashboard-screen"),section=$("admin-section"),login=$("admin-login"),nav=$("admin-bottom-nav");
const tabs=[...document.querySelectorAll("[data-admin-tab]")];
const service=()=>window.AMANAdminServices||null;
/* جدول أيقونات SVG ثابتة داخلية (ليست من بيانات المستخدم) */
const svgWrap=d=>'<svg class="aman-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const ICONS={
 list:svgWrap('<path class="icon-fill" d="M5 2.5h11l4 4v14a1.8 1.8 0 0 1-1.8 1.8H5A1.8 1.8 0 0 1 3.2 20V4.3A1.8 1.8 0 0 1 5 2.5Z"/><path class="icon-accent" d="M15.5 2.8v4.5H20zM7 10h10v1.8H7zm0 4h10v1.8H7zm0 4h6v1.8H7z"/>'),
 phone:svgWrap('<path class="icon-fill" d="M7 1.8h10a2.8 2.8 0 0 1 2.8 2.8v14.8a2.8 2.8 0 0 1-2.8 2.8H7a2.8 2.8 0 0 1-2.8-2.8V4.6A2.8 2.8 0 0 1 7 1.8Z"/><path class="icon-accent" d="M7.2 5h9.6v12H7.2z"/><path class="icon-cut" d="M10 19.2h4"/>'),
 users:svgWrap('<path class="icon-fill" d="M8.5 3a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4ZM1.8 20.8c.3-4 2.8-6.4 6.7-6.4s6.4 2.4 6.7 6.4H1.8Z"/><path class="icon-accent" d="M16 3.8a3.8 3.8 0 0 1 0 7.4v-2a1.8 1.8 0 0 0 0-3.4zm1.2 10.4c3.1.6 4.8 2.8 5 6.6h-2.2c-.2-2.4-1.1-3.9-2.8-4.6z"/>'),
 user:svgWrap('<path class="icon-fill" d="M12 2.5a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2Z"/><path class="icon-accent" d="M3 21c.4-4.5 4-7.2 9-7.2s8.6 2.7 9 7.2H3Z"/><path class="icon-cut" d="M8.5 15.2 12 18l3.5-2.8"/>'),
 clock:svgWrap('<path class="icon-fill" d="M12 2.4a9.6 9.6 0 1 0 0 19.2 9.6 9.6 0 0 0 0-19.2Z"/><path class="icon-accent" d="M11 5.8h2v6.1l4.1 2.4-1 1.7-5.1-3V5.8Z"/>'),
 timer:svgWrap('<path class="icon-fill" d="M12 4a8.7 8.7 0 1 0 0 17.4A8.7 8.7 0 0 0 12 4Z"/><path class="icon-accent" d="M10 1.8h4v2h-4zM11 7.5h2v5l3 1.8-1 1.7-4-2.5z"/>'),
 flag:svgWrap('<path class="icon-fill" d="M4 2h2v20H4z"/><path class="icon-accent" d="M6 3h13l-2.2 4.2L19 11H6V3Z"/><path class="icon-cut" d="M8 5h7"/>'),
 doc:svgWrap('<path class="icon-fill" d="M6 2.2h8l5 5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4.2a2 2 0 0 1 2-2Z"/><path class="icon-accent" d="M13 2.8v5h5zM7.5 11h9v1.8h-9zm0 4h9v1.8h-9zm0 4h6v1.8h-6z"/>'),
 sliders:svgWrap('<path class="icon-fill" d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"/><path class="icon-accent" d="M7 3.5h3v5H7zm8 6h3v5h-3zm-5 6h3v5h-3z"/>'),
 bell:svgWrap('<path class="icon-fill" d="M18 9a6 6 0 0 0-12 0c0 6.1-2.2 7.1-3 8.8-.2.5.2 1.2.8 1.2h16.4c.6 0 1-.7.8-1.2-.8-1.7-3-2.7-3-8.8Z"/><path class="icon-accent" d="M9.2 20h5.6a2.8 2.8 0 0 1-5.6 0Z"/>'),
 box:svgWrap('<path class="icon-fill" d="m12 2 9 4.8v10.4L12 22l-9-4.8V6.8L12 2Z"/><path class="icon-accent" d="m12 4.3 6.4 3.4-6.4 3.4-6.4-3.4L12 4.3Zm-7 5 6 3.2v6.5l-6-3.2V9.3Zm14 0-6 3.2v6.5l6-3.2V9.3Z"/>'),
 wallet:svgWrap('<path class="icon-fill" d="M4 4h15a2 2 0 0 1 2 2v2h-9a3 3 0 0 0 0 6h9v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path class="icon-accent" d="M12 9.5h9v5h-9a2.5 2.5 0 0 1 0-5Z"/><path class="icon-cut" d="M16 11.1h2v1.8h-2z"/>'),
 dots:svgWrap('<path class="icon-fill" d="M5 8.5a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"/><path class="icon-accent" d="M12 8.5a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Zm7 0a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"/>')
};
const definitions={
 requests:{title:"الطلبات",description:"مراجعة طلبات الخدمة.",icon:"list",emptyTitle:"لا توجد طلبات",emptyDescription:"تظهر الطلبات الواردة هنا."},
 numbers:{title:"الأرقام",description:"متابعة الأرقام وحالات الحماية.",icon:"phone",emptyTitle:"لا توجد أرقام",emptyDescription:"تظهر الأرقام بعد اعتماد الطلبات."},
 customers:{title:"العملاء",description:"حسابات العملاء وحالاتها.",icon:"users",emptyTitle:"لا يوجد عملاء",emptyDescription:"تظهر حسابات العملاء هنا."},
 tasks:{title:"مهام السداد",description:"مواعيد السداد وتنفيذها.",icon:"clock",emptyTitle:"لا توجد مهام سداد",emptyDescription:"تظهر المهام بعد اعتماد الطلبات."},
 complaints:{title:"البلاغات",description:"مراجعة البلاغات ومتابعتها.",icon:"flag",emptyTitle:"لا توجد بلاغات",emptyDescription:"تظهر البلاغات هنا."},
 reports:{title:"تقارير الإيرادات",description:"العمليات والإيرادات المعتمدة.",icon:"doc",emptyTitle:"لا توجد عمليات معتمدة",emptyDescription:"تظهر الإيرادات بعد اعتماد العمليات."},
 settings:{title:"الشركات والإعدادات",description:"بيانات الشركات والبادئات وإعدادات المهام والتنشيط.",icon:"sliders",emptyTitle:"لم تُضَف شركات بعد",emptyDescription:"أضف الشركات واضبط إعداداتها."},
 notifications:{title:"الإشعارات",description:"عرض الإشعارات وإنشاؤها.",icon:"bell",emptyTitle:"لا توجد إشعارات",emptyDescription:"تظهر الإشعارات هنا."},
 alerts:{title:"تنبيهات الأرقام",description:"تنبيهات الأرقام المرتبطة بالعملاء.",icon:"flag",emptyTitle:"لا توجد تنبيهات",emptyDescription:"تظهر التنبيهات هنا."},
 packages:{title:"باقات الحماية",description:"الباقات حسب الشركة والعملية والمدة والسعر.",icon:"box",emptyTitle:"لم تُضَف باقات بعد",emptyDescription:"أضف الباقات المعتمدة لكل شركة وعملية."},
 payments:{title:"وسائل الدفع",description:"وسائل الدفع وتعليماتها ومرجع الدفع.",icon:"wallet",emptyTitle:"لم تُضَف وسائل دفع بعد",emptyDescription:"أضف وسائل الدفع المعتمدة."},
 content:{title:"المحتوى الثابت",description:"الشروط والأحكام والخصوصية والمساعدة والتواصل.",icon:"doc",emptyTitle:"لا يوجد محتوى محفوظ",emptyDescription:"أضف النصوص المعتمدة."},
 audit:{title:"سجل التدقيق",description:"إجراءات الإدارة المسجلة.",icon:"clock",emptyTitle:"لا توجد سجلات",emptyDescription:"تظهر الإجراءات المسجلة هنا."},
 followup:{title:"نافذة الظهور والمتابعة",description:"المهام المستحقة للتنفيذ أو الجدولة.",icon:"timer",emptyTitle:"لا توجد مهام ضمن النافذة",emptyDescription:"تظهر المهام المستحقة هنا."},
 more:{title:"المزيد",description:"باقي أقسام الإدارة.",icon:"dots",emptyTitle:"",emptyDescription:""},
 account:{title:"الحساب الإداري",description:"بيانات المدير والجلسة.",icon:"user",emptyTitle:"بيانات الحساب غير متاحة",emptyDescription:"تعذر تحميل بيانات المدير."}
};
let current="login",historyStack=[],activeRequestId=null,requestRows=[],detailRecord=null,adminSession=null,loading=false;
/* حارس المصادقة في الواجهة: لا يُعرض أي قسم إداري إلا بعد تأكيد الخادم أن الحساب مدير.
   هذا حارس عرض فقط؛ التحقق الفعلي من الصلاحية يتم في قاعدة البيانات (aman.adm()). */
const authed=()=>!!adminSession&&adminSession.is_admin===true;
const accountBtn=$("admin-account");
const showAccountButton=on=>{accountBtn.style.display=on?"":"none";};
const statusLabel={pending:"قيد المراجعة",approved:"معتمد",rejected:"مرفوض"};
const typeLabel={subscription:"اشتراك",extension:"تمديد الاشتراك",reactivation:"تنشيط"};
function message(node,text,kind="info"){node.textContent=text;node.className=kind==="error"?"notice-error":kind==="success"?"notice-success":"notice-info";}
function addActionIcon(button,name){if(!button)return;button.querySelectorAll(".button-icon").forEach(n=>n.remove());const holder=document.createElement("span");holder.className="button-icon";holder.innerHTML=ICONS[name]||"";if(holder.firstElementChild)button.prepend(holder);button.classList.add("has-icon");}
function text(v,fallback="—"){return v===null||v===undefined||v===""?fallback:String(v);}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const primaryTabs=["dashboard","requests","numbers","customers"];
function setActive(name){const tab=!name?"":primaryTabs.includes(name)?name:"more";tabs.forEach(t=>t.classList.toggle("active",t.dataset.adminTab===tab));}
function renderMore(){const h=$("admin-generic-view");h.replaceChildren();const order=["tasks","followup","complaints","reports","notifications","alerts","settings","packages","payments","content","audit","account"];const wrap=document.createElement("div");wrap.className="admin-shortcuts";order.forEach(k=>{const d=definitions[k];if(!d)return;const b=document.createElement("button");b.type="button";b.className="admin-shortcut";b.dataset.moreSection=k;const i=document.createElement("span");i.className="quick-icon";i.innerHTML=ICONS[d.icon]||"";const t=document.createElement("strong");t.textContent=d.title;b.append(i,t);b.addEventListener("click",()=>navigate(k));wrap.append(b);});h.append(wrap);}
/* إظهار/إخفاء كلمة المرور في شاشة الدخول: تعود دائمًا إلى «مخفية» عند فتح الشاشة وبعد الدخول */
function setPasswordVisible(show){const i=$("admin-password"),b=$("admin-password-toggle");i.type=show?"text":"password";b.setAttribute("aria-pressed",show?"true":"false");b.setAttribute("aria-label",show?"إخفاء كلمة المرور":"إظهار كلمة المرور");}
function showLogin(){adminSession=null;current="login";historyStack=[];activeRequestId=null;detailRecord=null;dashboard.hidden=true;section.hidden=true;login.hidden=false;nav.hidden=true;showAccountButton(false);setActive("");setPasswordVisible(false);}
function showDashboard(){current="dashboard";login.hidden=true;section.hidden=true;dashboard.hidden=false;nav.hidden=false;showAccountButton(true);setActive("dashboard");loadDashboard();}
function navigate(name,{remember=true}={}) {
 if(name==="login"){showLogin();return true;}
 /* لا تنقل إلى أي شاشة إدارية دون جلسة مدير مؤكدة (يشمل أيقونة الحساب وروابط الأقسام) */
 if(!authed()){showLogin();return false;}
 if(name==="dashboard"){if(remember&&current!=="dashboard")historyStack.push(current);showDashboard();return true;}
 const item=definitions[name];if(!item)return false;
 if(remember&&current!==name)historyStack.push(current);
 current=name;login.hidden=true;dashboard.hidden=true;section.hidden=false;nav.hidden=false;showAccountButton(true);
 $("section-title").textContent=item.title;$("section-description").textContent=item.description;
 $("admin-generic-view").classList.toggle("surface",!["numbers","customers"].includes(name));$("admin-generic-view").hidden=name==="requests";$("requests-list-view").hidden=name!=="requests";$("request-detail-view").hidden=true;
 setActive(name);window.scrollTo({top:0,behavior:"smooth"});
 document.dispatchEvent(new CustomEvent("aman:admin-screenchange",{detail:{screen:name}}));
 if(name==="requests")loadRequests();
 if(name==="more")renderMore();
 return true;
}
function back(){if(!authed()){showLogin();return;}if(activeRequestId){activeRequestId=null;detailRecord=null;$("requests-list-view").hidden=false;$("request-detail-view").hidden=true;current="requests";loadRequests();return;}const p=historyStack.pop();if(p==="requests"||p==="more"){navigate(p,{remember:false});return;}showDashboard();}
window.AMANAdminNavigation=Object.freeze({navigate,back,get current(){return current;},refresh(){if(current==="dashboard")return loadDashboard();if(activeRequestId)return Promise.all([openRequest(activeRequestId),loadRequests()]);if(current==="requests")return loadRequests();return Promise.resolve();}});
function stat(id,value){$(id).textContent=text(value,"—");}
async function loadDashboard(){
 const s=service();if(!s||typeof s.getDashboardSummary!=="function"){["stat-pending-requests","stat-protected-numbers","stat-open-reports","stat-due-tasks","stat-customers","stat-revenue"].forEach(id=>stat(id,"—"));return false;}
 try{const r=await s.getDashboardSummary();if(!r||r.success!==true||!r.summary)return false;const x=r.summary;stat("stat-pending-requests",x.pending_requests);stat("stat-protected-numbers",x.protected_numbers);stat("stat-open-reports",x.open_reports);stat("stat-due-tasks",x.due_tasks);stat("stat-customers",x.customers);stat("stat-revenue",x.approved_revenue_yer===undefined?"—":Number(x.approved_revenue_yer).toLocaleString("ar")+" ر.ي");return true;}
 catch{return false;}}
function normalizeList(r){if(Array.isArray(r))return r;if(Array.isArray(r?.items))return r.items;if(Array.isArray(r?.requests))return r.requests;return [];}
function requestCard(r){
 const card=document.createElement("button");card.type="button";card.className="admin-request-card";
 const main=document.createElement("span");main.className="request-card-main";
 const title=document.createElement("strong");title.textContent=text(r.request_number||r.id,"طلب بدون رقم");
 const phone=document.createElement("span");phone.className="request-phone";phone.dir="ltr";phone.textContent=text(r.phone);
 const meta=document.createElement("small");meta.textContent=[typeLabel[r.operation_type]||r.operation_type||"نوع غير محدد",r.company_name||"الشركة غير محددة",r.customer_name||"العميل"].filter(Boolean).join(" • ");
 main.append(title,phone,meta);
 const side=document.createElement("span");side.className="request-card-side";
 const badge=document.createElement("span");badge.className="state "+(r.status==="approved"?"state-active":r.status==="rejected"?"state-expired":"state-wait");badge.textContent=statusLabel[r.status]||"حالة غير معروفة";
 const date=document.createElement("small");date.textContent=text(r.created_at);
 side.append(badge,date);card.append(main,side);card.addEventListener("click",()=>openRequest(r.id));return card;
}
function renderRequests(){
 const host=$("requests-list");host.replaceChildren();
 if(!requestRows.length){const empty=document.createElement("div");empty.className="surface empty-state";const strong=document.createElement("strong");strong.textContent="لا توجد طلبات مطابقة";const p=document.createElement("p");p.textContent="عدّل التصفية أو حدّث القائمة.";empty.append(strong,p);host.append(empty);return;}
 requestRows.forEach(r=>host.append(requestCard(r)));
}
async function loadRequests(){
 const s=service(),host=$("requests-list");if(!s||typeof s.listRequests!=="function"){host.replaceChildren();message(host,"تعذر الوصول إلى الطلبات حاليًا.","error");return false;}
 if(loading)return false;loading=true;host.setAttribute("aria-busy","true");
 if(!requestRows.length){const pending=document.createElement("div");pending.className="empty-state";pending.textContent="جارٍ تحميل الطلبات…";host.replaceChildren(pending);}
 const filters={search:$("request-search").value.trim(),status:$("request-status").value,operation_type:$("request-type").value,company_id:$("request-company").value};
 try{const result=await s.listRequests(filters);if(result?.success!==true)throw Error("not-confirmed");requestRows=normalizeList(result);const companies=Array.isArray(result.companies)?result.companies:[];const select=$("request-company"),selected=select.value;select.replaceChildren(new Option("كل الشركات","all"));companies.forEach(c=>select.add(new Option(c.name,c.id)));if([...select.options].some(o=>o.value===selected))select.value=selected;renderRequests();return true;}
 catch{if(requestRows.length){const note=document.createElement("p");note.className="notice-error";note.textContent="تعذر تحديث القائمة. البيانات المعروضة قد تكون قديمة.";host.append(note);}else{host.replaceChildren();const empty=document.createElement("div");empty.className="empty-state";const title=document.createElement("strong");title.textContent="تعذر تحميل الطلبات";const retry=document.createElement("button");retry.type="button";retry.className="btn btn-outline";retry.textContent="إعادة المحاولة";addActionIcon(retry,"clock");retry.addEventListener("click",loadRequests);empty.append(title,retry);host.append(empty);}return false;}
 finally{loading=false;host.removeAttribute("aria-busy");updateRequestResetVisibility();}
}
 if (window.AMANPullToRefresh) {
  window.AMANPullToRefresh.register("dashboard", loadDashboard);
  window.AMANPullToRefresh.register("requests", loadRequests);
  window.AMANPullToRefresh.register("requests-detail", () => activeRequestId ? openRequest(activeRequestId) : loadRequests());
 }
function detailRow(label,value,dir){const row=document.createElement("div");row.className="admin-detail-row";const l=document.createElement("span");l.textContent=label;const v=document.createElement("strong");v.textContent=text(value);if(dir)v.dir=dir;row.append(l,v);return row;}
function panel(title,rows){const box=document.createElement("section");box.className="surface admin-detail-panel";const h=document.createElement("h2");h.className="surface-title";h.textContent=title;box.append(h);rows.forEach(x=>box.append(detailRow(x[0],x[1],x[2])));return box;}
function openInlineActions(record,host){
 if(record.status!=="pending")return;
 const actions=document.createElement("section");actions.className="surface";
 const h=document.createElement("h2");h.className="surface-title";h.textContent="إجراءات الطلب";actions.append(h);
 const note=document.createElement("p");note.className="surface-desc";note.textContent="يتحقق أمان من الصلاحية والبيانات ومرجع الدفع قبل اعتماد الطلب أو رفضه.";actions.append(note);
 const approve=document.createElement("button");approve.className="btn btn-block";approve.type="button";approve.textContent="مراجعة أثر الاعتماد";addActionIcon(approve,"doc");approve.addEventListener("click",()=>showApprovePreview(record,actions));actions.append(approve);
 const reject=document.createElement("button");reject.className="btn btn-outline btn-block";reject.type="button";reject.style.marginTop="9px";reject.textContent="رفض الطلب";addActionIcon(reject,"flag");reject.addEventListener("click",()=>showRejectForm(record,actions));actions.append(reject);host.append(actions);
}
async function showApprovePreview(record,host){
 const s=service(),box=document.createElement("div");box.className="soft-surface";const h=document.createElement("h3");h.textContent="تأكيد أثر الاعتماد";box.append(h);
 if(!s||typeof s.getApprovalPreview!=="function"){const p=document.createElement("p");p.textContent="معاينة أثر الاعتماد غير متاحة حاليًا.";box.append(p);host.append(box);return;}
 const p=document.createElement("p");p.textContent="جارٍ تحميل الفترة والأثر…";box.append(p);host.append(box);
 try{const r=await s.getApprovalPreview({request_id:record.id});if(r?.success!==true||!r.preview)throw Error();p.textContent="الفترة التي ستنشأ عند التأكيد:";box.append(detailRow("بداية الحماية",r.preview.starts_at),detailRow("نهاية الحماية",r.preview.ends_at),detailRow("أثر الاعتماد",r.preview.effect_description));const confirm=document.createElement("button");confirm.className="btn btn-block";confirm.textContent="تأكيد الاعتماد";addActionIcon(confirm,"flag");confirm.addEventListener("click",()=>performDecision("approve",record.id,{},confirm));box.append(confirm);}
 catch{p.textContent="تعذر جلب معاينة موثوقة. لم يُعتمد الطلب.";}
}
async function showRejectForm(record,host){
 const s=service(),form=document.createElement("form");form.className="soft-surface";const h=document.createElement("h3");h.textContent="تسجيل رفض الطلب";form.append(h);
 const label=document.createElement("label");label.className="field-label";label.textContent="سبب الرفض";const select=document.createElement("select");select.className="field";select.required=true;select.add(new Option("اختر سبب الرفض",""));form.append(label,select);
 const explain=document.createElement("label");explain.className="field-label";explain.style.marginTop="12px";explain.textContent="توضيح إضافي (إن لزم)";const textarea=document.createElement("textarea");textarea.className="field";textarea.rows=3;textarea.maxLength=1000;form.append(explain,textarea);
 const feedback=document.createElement("p");feedback.setAttribute("aria-live","polite");const submit=document.createElement("button");submit.className="btn btn-block";submit.textContent="تأكيد الرفض";addActionIcon(submit,"flag");form.append(feedback,submit);host.append(form);
 if(!s||typeof s.getRejectReasons!=="function"){message(feedback,"قائمة أسباب الرفض غير متاحة حاليًا.","error");submit.disabled=true;return;}
 try{const r=await s.getRejectReasons();const items=Array.isArray(r?.items)?r.items:[];items.forEach(x=>select.add(new Option(x.label,x.code)));if(r?.success!==true||!items.length)throw Error();}catch{message(feedback,"تعذر تحميل أسباب الرفض المعتمدة.","error");submit.disabled=true;}
 form.addEventListener("submit",e=>{e.preventDefault();if(!select.value){message(feedback,"اختر سبب الرفض أولًا.","error");return;}performDecision("reject",record.id,{reason_code:select.value,explanation:textarea.value.trim()},submit,feedback);});
}
async function performDecision(action,id,payload,button,feedback){
 const s=service(),method=action==="approve"?"approveRequest":"rejectRequest";if(!s||typeof s[method]!=="function"){if(feedback)message(feedback,"تعذر تنفيذ القرار حاليًا.","error");return;}
 button.disabled=true;button.textContent="جارٍ تنفيذ القرار…";addActionIcon(button,"clock");
 try{const r=await s[method]({request_id:id,...payload});if(r?.success!==true)throw Error();if(feedback)message(feedback,action==="approve"?"تم اعتماد الطلب.":"تم رفض الطلب.","success");await openRequest(id);await loadRequests();}
 catch{if(feedback)message(feedback,"لم يصل تأكيد موثوق بالقرار. حدّث حالة الطلب قبل إعادة المحاولة.","error");else window.alert("لم يصل تأكيد موثوق بالقرار. حدّث حالة الطلب قبل إعادة المحاولة.");button.disabled=false;button.textContent=action==="approve"?"تأكيد الاعتماد":"تأكيد الرفض";addActionIcon(button,"flag");}
}
async function openRequest(id){
 activeRequestId=id;window.AMANAdminCurrentRequest=null;$("requests-list-view").hidden=true;$("request-detail-view").hidden=false;$("request-detail-content").replaceChildren();current="request-detail";window.scrollTo({top:0,behavior:"smooth"});
 const host=$("request-detail-content"),s=service();const loadingBox=document.createElement("div");loadingBox.className="surface empty-state";loadingBox.textContent="جارٍ تحميل تفاصيل الطلب…";host.append(loadingBox);
 if(!s||typeof s.getRequestDetails!=="function"){loadingBox.textContent="تفاصيل الطلب غير متاحة حاليًا.";return false;}
 try{const r=await s.getRequestDetails({request_id:id});if(r?.success!==true||!r.request)throw Error();detailRecord=r.request;window.AMANAdminCurrentRequest=detailRecord;host.replaceChildren();const q=detailRecord;
 const status=statusLabel[q.status]||"حالة غير معروفة";
 host.append(panel("بيانات الطلب",[["رقم الطلب",q.request_number||q.id],["نوع العملية",typeLabel[q.operation_type]||q.operation_type],["الحالة",status],["تاريخ الطلب",q.created_at],["الرقم",q.phone,"ltr"],["الشركة",q.company_name],["الباقة",q.package_name],["المدة",q.duration_days? q.duration_days+" يوم":null],["السعر",q.price_yer===undefined?null:Number(q.price_yer).toLocaleString("ar")+" ر.ي"],["وسيلة الدفع",q.payment_method_name],["مرجع الدفع",q.payment_reference,"ltr"]]));
 host.append(panel("بيانات العميل",[["اسم العميل",q.customer_name],["تصنيف الحساب",q.customer_type],["حالة الحساب",q.customer_status],["معرّف العميل",q.customer_id]]));
 host.append(panel("حالة الرقم والتحقق",[["حالة الرقم الحالية",q.number_status],["بداية الحماية الحالية",q.current_protection_starts_at],["نهاية الحماية الحالية",q.current_protection_ends_at],["آخر يوم للتنشيط",q.reactivation_deadline]]));
 const warnings=Array.isArray(q.warnings)?q.warnings:[];if(warnings.length){const p=document.createElement("section");p.className="surface";const h=document.createElement("h2");h.className="surface-title";h.textContent="تنبيهات المراجعة";p.append(h);warnings.forEach(w=>{const x=document.createElement("p");x.className="notice-error";x.textContent=String(w);p.append(x);});host.append(p);}
 openInlineActions(q,host);return true;
 }catch{host.replaceChildren();const err=document.createElement("div");err.className="surface empty-state";err.textContent="تعذر تحميل تفاصيل الطلب. تحقق من الاتصال والصلاحيات.";host.append(err);return false;}
}
async function refreshSession(){
 const s=service();if(!s||typeof s.getCurrentAdmin!=="function"){showLogin();return;}
 try{const r=await s.getCurrentAdmin();if(r?.success===true&&r.admin?.is_admin===true){adminSession=r.admin;showDashboard();}else showLogin();}
 catch{showLogin();}
}
$("admin-login-form").addEventListener("submit",async e=>{
 e.preventDefault();
 /* يجب التقاط النموذج قبل أي await: e.currentTarget تصبح null بعد انتهاء توزيع الحدث،
    وكان استدعاء e.currentTarget.reset() بعد نجاح الدخول يرمي TypeError فتظهر رسالة الفشل رغم نجاح المصادقة. */
 const form=e.currentTarget,s=service(),msg=$("admin-login-message"),button=e.submitter||form.querySelector("button[type=submit]");
 if(!s||typeof s.signInAdmin!=="function"){message(msg,"تسجيل الدخول غير متاح حاليًا. لم تُرسل البيانات.","error");return;}
 button.disabled=true;message(msg,"جارٍ التحقق من بيانات الدخول…");
 let ok=false;
 try{const r=await s.signInAdmin({email:$("admin-username").value.trim(),password:$("admin-password").value,remember:$("admin-remember").checked});if(r?.success!==true||r.admin?.is_admin!==true)throw Error();adminSession=r.admin;ok=true;}
 catch{
  adminSession=null;message(msg,"تعذر تسجيل الدخول أو أن الحساب غير مخوّل للإدارة.","error");
  /* لا تُبقِ جلسة سابقة صالحة بعد محاولة دخول فاشلة */
  try{await s.signOutAdmin();}catch{/* لا جلسة لإنهائها */}
 }
 finally{button.disabled=false;}
 if(ok){form.reset();setPasswordVisible(false);message(msg,"تم التحقق من صلاحية الإدارة.","success");showDashboard();}
});
$("admin-password-toggle").addEventListener("click",()=>setPasswordVisible($("admin-password").type==="password"));

accountBtn.addEventListener("click",()=>{if(!authed()){showLogin();return;}navigate("account");});
tabs.forEach(t=>t.addEventListener("click",()=>navigate(t.dataset.adminTab)));
document.querySelectorAll("[data-section]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.section)));
$("admin-back").addEventListener("click",back);$("request-detail-back").addEventListener("click",back);


function updateRequestResetVisibility(){const button=$("requests-reset");if(!button)return;button.hidden=!($("request-search").value.trim()||$("request-status").value!=="pending"||$("request-type").value!=="all"||$("request-company").value!=="all");}
$("requests-reset").addEventListener("click",()=>{$("request-search").value="";$("request-status").value="pending";$("request-type").value="all";$("request-company").value="all";updateRequestResetVisibility();loadRequests();});
["request-status","request-type","request-company"].forEach(id=>$(id).addEventListener("change",()=>{updateRequestResetVisibility();loadRequests();}));
let searchTimer=null;$("request-search").addEventListener("input",()=>{updateRequestResetVisibility();clearTimeout(searchTimer);searchTimer=setTimeout(loadRequests,350);});
updateRequestResetVisibility();
$("admin-login").hidden=false;dashboard.hidden=true;section.hidden=true;nav.hidden=true;showAccountButton(false);
refreshSession();
})();
