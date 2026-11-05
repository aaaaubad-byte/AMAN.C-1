(() => {
"use strict";
const $ = id => document.getElementById(id);
const service = () => window.AMANAdminServices || null;
const labels = { protected: "محمي", inactive: "غير نشط", expired_confiscated: "منتهي / مصادَر" };
let numberRows = [], activeNumberId = null, currentScreen = "";
const safe = value => value === null || value === undefined || value === "" ? "—" : String(value);
const el = (tag, cls, value) => { const n=document.createElement(tag); if(cls)n.className=cls; if(value!==undefined)n.textContent=safe(value); return n; };
function panel(title, rows) {
 const box=el("section","surface admin-detail-panel"), h=el("h2","surface-title",title); box.append(h);
 rows.forEach(([k,v,dir])=>{const row=el("div","admin-detail-row"),a=el("span","",k),b=el("strong","",v);if(dir)b.dir=dir;row.append(a,b);box.append(row);});
 return box;
}
function renderNumbersShell(){
 const host=$("admin-generic-view");host.replaceChildren();delete host.dataset.pullScreen;delete host.dataset.noPullRefresh;
 const wrap=el("div","admin-numbers-view"), filters=el("div","admin-filter-grid");
 const searchWrap=el("div"), searchLabel=el("label","field-label","بحث عن الرقم");searchLabel.htmlFor="number-search";
 const search=el("input","field");search.id="number-search";search.placeholder="أدخل الرقم أو اسم الشركة";searchWrap.append(searchLabel,search);
 const statusWrap=el("div"),statusLabel=el("label","field-label","حالة الحماية");statusLabel.htmlFor="number-status";
 const status=el("select","field");status.id="number-status";
 [["all","كل الحالات"],["protected","محمي"],["inactive","غير نشط"],["expired_confiscated","منتهي / مصادَر"]].forEach(([v,t])=>status.add(new Option(t,v)));
 statusWrap.append(statusLabel,status);filters.append(searchWrap,statusWrap);
 const list=el("div","");list.id="numbers-list";wrap.append(filters,list);host.append(wrap);
 search.addEventListener("input",()=>renderNumbers());status.addEventListener("change",()=>renderNumbers());
}
function renderNumbers(){
 const host=$("numbers-list");if(!host)return;host.replaceChildren();
 const term=$("number-search").value.trim().toLowerCase(),status=$("number-status").value;
 const rows=numberRows.filter(n=>(status==="all"||n.protection_status===status)&&[n.phone,n.number,n.company_name].some(v=>String(v||"").toLowerCase().includes(term)));
 if(!rows.length){host.append(panel("قائمة الأرقام",[["النتيجة","لا توجد أرقام مطابقة"]]));return;}
 rows.forEach(n=>{
  const card=el("button","admin-request-card"),main=el("span","request-card-main"),phone=el("strong","",n.phone||n.number);
  phone.dir="ltr";const meta=el("small","",[n.company_name,safe(n.protection_status_label||labels[n.protection_status]),n.customer_count===undefined?null:"العملاء المرتبطون: "+n.customer_count].filter(Boolean).join(" • "));
  const side=el("span","request-card-side"),badge=el("span","state state-off",n.protection_status_label||labels[n.protection_status]||"حالة غير محددة");
  side.append(badge);main.append(phone,meta);card.append(main,side);card.type="button";card.addEventListener("click",()=>openNumber(n.id));host.append(card);
 });
}
async function loadNumbers(){
 const host=$("numbers-list"),s=service();if(!host)return false;
 if(!s||typeof s.listNumbers!=="function"){host.replaceChildren(el("p","notice-error","تعذر الوصول إلى الأرقام حاليًا."));return false;}
 host.setAttribute("aria-busy","true");
 if(!numberRows.length)host.replaceChildren(el("div","empty-state","جارٍ تحميل الأرقام…"));
 try{const r=await s.listNumbers({search:$("number-search").value.trim(),status:$("number-status").value});if(r?.success!==true||!Array.isArray(r.numbers))throw Error();numberRows=r.numbers;renderNumbers();return true;}
 catch{if(numberRows.length){host.append(el("p","notice-error","تعذر تحديث القائمة. البيانات المعروضة قد تكون قديمة."));}else{host.replaceChildren(el("p","notice-error","تعذر تحميل الأرقام. تحقق من الاتصال والصلاحيات ثم أعد المحاولة."));}return false;}
 finally{host.removeAttribute("aria-busy");}
}
async function openNumber(id){
 activeNumberId=id;const generic=$("admin-generic-view");generic.replaceChildren();generic.dataset.pullScreen="numbers-detail";
 const back=el("button","btn btn-outline","العودة إلى الأرقام");back.type="button";back.addEventListener("click",()=>{activeNumberId=null;renderNumbersShell();loadNumbers();});
 generic.append(back);const loading=el("div","surface empty-state","جارٍ تحميل تفاصيل الرقم…");generic.append(loading);
 const s=service();if(!s||typeof s.getNumberDetails!=="function"){loading.textContent="تفاصيل الرقم غير متاحة حاليًا.";return false;}
 try{
  const r=await s.getNumberDetails({number_id:id});if(r?.success!==true||!r.number)throw Error();const n=r.number;generic.replaceChildren(back);
  generic.append(panel("بيانات الرقم", [["الرقم",n.phone||n.number,"ltr"],["الشركة",n.company_name],["حالة الحماية",n.protection_status_label||labels[n.protection_status]],["تاريخ الإضافة",n.created_at],["موعد المصادرة المتوقع",n.expected_confiscation_at],["آخر يوم للتنشيط",n.reactivation_deadline]]));
  if(n.current_protection)generic.append(panel("فترة الحماية الحالية",[["بداية الحماية",n.current_protection.starts_at],["نهاية الحماية",n.current_protection.ends_at],["اسم الباقة",n.current_protection.package_name],["إجمالي الأيام",n.current_protection.total_days]]));
  const groups=[["سجل الفترات",n.protection_periods],["سجل الأحداث",n.events],["العملاء المرتبطون",n.customers],["الطلبات المرتبطة",n.requests],["البلاغات",n.reports],["التنبيهات",n.alerts],["مهام السداد",n.tasks]];
  groups.forEach(([title,items])=>{const box=el("section","surface admin-detail-panel"),h=el("h2","surface-title",title);box.append(h);if(!Array.isArray(items)||!items.length){box.append(el("p","surface-desc","لا توجد سجلات متاحة."));}else items.forEach(item=>{const line=el("div","admin-detail-row");line.append(el("span","",item.label||item.type||item.customer_name||item.request_number||item.title||"سجل"),el("strong","",item.summary||item.status_label||item.created_at||item.due_at||item.phone||"—"));box.append(line);});generic.append(box);});
  generic.append(el("p","surface-desc","هذه الشاشة للقراءة فقط. لا تتضمن إجراءات اشتراك أو تمديد أو تنشيط أو إضافة رقم."));return true;
 }catch{loading.textContent="تعذر تحميل تفاصيل الرقم.";return false;}
}
function dialogBase(title){
 const dialog=document.createElement("dialog");dialog.className="admin-decision-dialog";const box=el("div","surface"),h=el("h2","surface-title",title),body=el("div","decision-body");box.append(h,body);dialog.append(box);document.body.append(dialog);return {dialog,body};
}
function closeDialog(dialog){dialog.close();dialog.remove();}
async function openApprovalDialog(){
 const record=window.AMANAdminCurrentRequest;
 const host=dialogBase("تأكيد الاعتماد"),{dialog,body}=host,s=service();
 if(!record?.id){body.append(el("p","notice-error","بيانات الطلب الحالية غير متاحة. أعد فتح تفاصيل الطلب."));}
 else if(record.status!=="pending"){body.append(el("p","notice-error","لا يمكن اعتماد طلب لم يعد قيد المراجعة."));}
 else if(!s||typeof s.getApprovalPreview!=="function"){body.append(el("p","notice-error","تعذر عرض معاينة الاعتماد حاليًا."));}
 else {
  body.append(el("p","surface-desc","جارٍ التحقق من أثر الاعتماد…"));
  try{const r=await s.getApprovalPreview({request_id:record.id});if(r?.success!==true||!r.preview)throw Error();body.replaceChildren();
   body.append(panel("الأثر المتوقع",[["بداية الحماية",r.preview.starts_at],["نهاية الحماية",r.preview.ends_at],["الأثر",r.preview.effect_description]]));
   const confirm=el("button","btn btn-block","تأكيد الاعتماد");confirm.type="button";confirm.addEventListener("click",async()=>{confirm.disabled=true;confirm.textContent="جارٍ التأكيد…";try{const out=await s.approveRequest({request_id:record.id});if(out?.success!==true)throw Error();const closeOk=el("button","btn btn-block","إغلاق");closeOk.type="button";closeOk.addEventListener("click",()=>closeDialog(dialog));body.replaceChildren(el("p","notice-success","أكد الخادم اعتماد الطلب."),closeOk);window.AMANAdminNavigation?.refresh?.();}catch{confirm.disabled=false;confirm.textContent="تأكيد الاعتماد";body.append(el("p","notice-error","لم يصل تأكيد موثوق. حدّث تفاصيل الطلب قبل إعادة المحاولة."));}});body.append(confirm);
  }catch{body.replaceChildren(el("p","notice-error","تعذر جلب معاينة موثوقة؛ لم يُنفذ الاعتماد."));}
 }
 const cancel=el("button","btn btn-outline btn-block","إلغاء");cancel.type="button";cancel.addEventListener("click",()=>closeDialog(dialog));body.append(cancel);dialog.showModal();
}
async function openRejectDialog(){
 const record=window.AMANAdminCurrentRequest,host=dialogBase("رفض الطلب"),{dialog,body}=host,s=service();
 if(!record?.id||record.status!=="pending"){body.append(el("p","notice-error","الطلب غير متاح للرفض أو لم يعد قيد المراجعة."));}
 else if(!s||typeof s.getRejectReasons!=="function"){body.append(el("p","notice-error","تعذر عرض قائمة أسباب الرفض حاليًا."));}
 else {
  const form=el("form","");const label=el("label","field-label","سبب الرفض");const select=el("select","field");select.required=true;select.add(new Option("اختر سبب الرفض",""));const noteLabel=el("label","field-label","توضيح إضافي (اختياري)"),note=el("textarea","field");note.rows=3;note.maxLength=1000;const feedback=el("p","");const submit=el("button","btn btn-block","تأكيد الرفض");submit.type="submit";form.append(label,select,noteLabel,note,feedback,submit);body.append(form);
  try{const r=await s.getRejectReasons();if(r?.success!==true||!Array.isArray(r.items)||!r.items.length)throw Error();r.items.forEach(x=>select.add(new Option(x.label,x.code)));}catch{setNotice(feedback,"تعذر تحميل أسباب الرفض المعتمدة.",true);submit.disabled=true;}
  form.addEventListener("submit",async e=>{e.preventDefault();if(!select.value){setNotice(feedback,"اختر سبب الرفض أولًا.",true);return;}submit.disabled=true;try{const out=await s.rejectRequest({request_id:record.id,reason_code:select.value,explanation:note.value.trim()});if(out?.success!==true)throw Error();setNotice(feedback,"أكد الخادم رفض الطلب.");const refresh=$("request-detail-refresh");if(refresh)refresh.click();const listRefresh=$("requests-refresh");if(listRefresh)listRefresh.click();}catch{setNotice(feedback,"لم يصل تأكيد موثوق. حدّث تفاصيل الطلب قبل إعادة المحاولة.",true);submit.disabled=false;}});
 }
 const cancel=el("button","btn btn-outline btn-block","إلغاء");cancel.type="button";cancel.addEventListener("click",()=>closeDialog(dialog));body.append(cancel);dialog.showModal();
}
if (window.AMANPullToRefresh) { window.AMANPullToRefresh.register("numbers", loadNumbers); window.AMANPullToRefresh.register("numbers-detail", () => activeNumberId ? openNumber(activeNumberId) : loadNumbers()); }
document.addEventListener("aman:admin-screenchange",e=>{
 currentScreen=e.detail?.screen||"";
 if(currentScreen==="numbers"){renderNumbersShell();loadNumbers();}
});
document.addEventListener("click",e=>{
 const target=e.target.closest("button[data-admin-action]");
 if(!target)return;
 const action=target.dataset.adminAction;
 if(action==="approve"){e.preventDefault();openApprovalDialog();}
 else if(action==="reject"){e.preventDefault();openRejectDialog();}
},true);
})();
