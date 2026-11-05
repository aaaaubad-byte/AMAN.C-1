(() => {
"use strict";
const $=id=>document.getElementById(id), service=()=>window.AMANAdminServices||null;
const labels={active:"فعّال",disabled:"معطّل",user:"مستخدم",customer:"عميل",planned:"مخططة",due:"مستحقة",executed:"منفذة"};
let customers=[],tasks=[],selectedCustomer=null,filters={search:"",type:"all",status:"all"};
const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
const panel=(title,rows)=>{const box=node("section","surface admin-detail-panel"),h=node("h2","surface-title",title);box.append(h);rows.forEach(([k,v])=>{const row=node("div","admin-detail-row"),a=node("span","",k),b=node("strong","",v??"—");row.append(a,b);box.append(row);});return box;};
const notice=(host,msg,error=false)=>{const p=node("p",error?"notice-error":"notice-info",msg);host.append(p);};
function shell(){const host=$("admin-generic-view");host.replaceChildren();delete host.dataset.pullScreen;delete host.dataset.noPullRefresh;return host;}
function customerList(host){
 const wrap=node("div","admin-customers-view"),grid=node("div","admin-filter-grid");
 const search=node("input","field");search.placeholder="اسم العميل أو البريد أو الهاتف";search.value=filters.search;
 const type=node("select","field");[["all","كل التصنيفات"],["user","مستخدمون"],["customer","عملاء"]].forEach(([v,t])=>type.add(new Option(t,v)));type.value=filters.type;
 const status=node("select","field");[["all","كل الحالات"],["active","فعّال"],["disabled","معطّل"]].forEach(([v,t])=>status.add(new Option(t,v)));status.value=filters.status;
 [["البحث",search],["تصنيف الحساب",type],["حالة الحساب",status]].forEach(([label,input])=>{const box=node("div",""),l=node("label","field-label",label);box.append(l,input);grid.append(box);});
 const list=node("div","");list.id="customers-list";wrap.append(grid,list);host.append(wrap);
 [search,type,status].forEach(input=>input.addEventListener(input===search?"input":"change",()=>{filters={search:search.value.trim(),type:type.value,status:status.value};renderCustomers();}));
}
function renderCustomers(){
 const host=$("customers-list");if(!host)return;host.replaceChildren();
 const q=filters.search.toLowerCase(),rows=customers.filter(c=>(filters.type==="all"||c.customer_type===filters.type)&&(filters.status==="all"||c.status===filters.status)&&[c.full_name,c.email,c.phone].some(v=>String(v||"").toLowerCase().includes(q)));
 if(!rows.length){host.append(node("div","surface empty-state","لا يوجد عملاء مطابقون للبحث والتصفية."));return;}
 rows.forEach(c=>{const card=node("button","admin-request-card"),main=node("span","request-card-main"),name=node("strong","",c.full_name||c.email),meta=node("small","",[c.email,labels[c.customer_type]||"—"].filter(Boolean).join(" • ")),side=node("span","request-card-side"),badge=node("span","state "+(c.status==="active"?"state-active":"state-off"),labels[c.status]||"غير محدد");card.type="button";side.append(badge);main.append(name,meta);card.append(main,side);card.addEventListener("click",()=>openCustomer(c.id));host.append(card);});
}
async function loadCustomers(){
 const host=$("customers-list"),s=service();if(!host)return false;
 if(!s||typeof s.listCustomers!=="function"){host.replaceChildren(node("p","notice-error","تعذر الوصول إلى العملاء حاليًا."));return false;}
 host.setAttribute("aria-busy","true");
 if(!customers.length)host.replaceChildren(node("div","empty-state","جارٍ تحميل العملاء…"));
 try{const r=await s.listCustomers(filters);if(r?.success!==true||!Array.isArray(r.customers))throw Error();customers=r.customers;renderCustomers();return true;}
 catch{if(customers.length){host.append(node("p","notice-error","تعذر تحديث القائمة. البيانات المعروضة قد تكون قديمة."));}else{host.replaceChildren(node("p","notice-error","تعذر تحميل العملاء. تحقق من الاتصال والصلاحيات ثم أعد المحاولة."));}return false;}
 finally{host.removeAttribute("aria-busy");}
}
async function openCustomer(id){
 selectedCustomer=id;const host=shell();host.dataset.pullScreen="customers-detail";const back=node("button","btn btn-outline","العودة إلى العملاء");back.type="button";back.addEventListener("click",()=>{selectedCustomer=null;renderCustomerScreen();loadCustomers();});host.append(back);
 const loading=node("div","surface empty-state","جارٍ تحميل تفاصيل العميل…");host.append(loading);const s=service();
 if(!s||typeof s.getCustomerDetails!=="function"){loading.textContent="تفاصيل العميل غير متاحة حاليًا.";return false;}
 try{const r=await s.getCustomerDetails({customer_id:id});if(r?.success!==true||!r.customer)throw Error();const c=r.customer;host.replaceChildren(back);
 host.append(panel("بيانات الحساب",[["الاسم",c.full_name],["البريد الإلكتروني",c.email],["تصنيف الحساب",labels[c.customer_type]||c.customer_type],["حالة الحساب",labels[c.status]||c.status],["تاريخ الإنشاء",c.created_at],["سبب التعطيل",c.disabled_reason]]));
 const action=node("section","surface"),h=node("h2","surface-title","إدارة حالة الحساب"),desc=node("p","surface-desc",c.is_admin?"لا يمكن تغيير حالة حساب المدير.":c.status==="active"?"يمكن تعطيل حساب العميل بعد تأكيد الإجراء.":"يمكن إعادة تفعيل الحساب بعد تأكيد الإجراء.");
 action.append(h,desc);
 if(!c.is_admin){const btn=node("button",c.status==="active"?"btn btn-outline btn-block":"btn btn-block",c.status==="active"?"تعطيل الحساب":"إعادة تفعيل الحساب");btn.type="button";btn.addEventListener("click",()=>confirmStatusChange(c));action.append(btn);}
 host.append(action);
 const numbers=Array.isArray(c.numbers)?c.numbers:[];host.append(panel("الأرقام المرتبطة",numbers.map(n=>[n.phone,n.protection_status_label||labels[n.protection_status]||n.status||"—"])));
 const requests=Array.isArray(c.requests)?c.requests:[];host.append(panel("الطلبات",requests.map(x=>[x.request_number||x.id,[x.operation_type,x.status,x.created_at].filter(Boolean).join(" • ")])));
 const history=Array.isArray(c.status_history)?c.status_history:[];host.append(panel("سجل التعطيل والتفعيل",history.map(x=>[labels[x.status]||x.status,[x.reason,x.changed_at].filter(Boolean).join(" • ")])));return true;
 }catch{loading.textContent="تعذر تحميل تفاصيل العميل.";return false;}
}
function confirmStatusChange(c){
 const s=service(),dialog=document.createElement("dialog");dialog.className="admin-decision-dialog";const box=node("div","surface"),title=node("h2","surface-title",c.status==="active"?"تأكيد تعطيل الحساب":"تأكيد إعادة تفعيل الحساب"),body=node("div","decision-body");box.append(title,body);dialog.append(box);document.body.append(dialog);
 const verb=c.status==="active"?"تعطيل":"إعادة تفعيل";body.append(node("p","surface-desc",c.status==="active"?"سيُمنع الحساب من استخدام الخدمات التي تتطلب حسابًا فعّالًا. لا يؤدي التعطيل إلى حذف بياناته أو نقل أرقامه.":"ستُعاد حالة الحساب إلى فعّال."));
 let reason=null;if(c.status==="active"){const label=node("label","field-label","سبب التعطيل (اختياري)");reason=node("textarea","field");reason.rows=3;reason.maxLength=500;body.append(label,reason);}
 const feedback=node("p","");const confirm=node("button","btn btn-block","تأكيد "+verb);confirm.type="button";confirm.addEventListener("click",async()=>{if(!s||typeof s.updateCustomerStatus!=="function"){feedback.textContent="تعذر تغيير حالة الحساب حاليًا.";feedback.className="notice-error";return;}confirm.disabled=true;try{const out=await s.updateCustomerStatus({customer_id:c.id,status:c.status==="active"?"disabled":"active",reason:reason?.value.trim()||""});if(out?.success!==true)throw Error();feedback.textContent="تم تحديث حالة الحساب.";feedback.className="notice-success";setTimeout(()=>{dialog.close();dialog.remove();openCustomer(c.id);},250);}catch{feedback.textContent="لم يصل تأكيد موثوق. حدّث تفاصيل الحساب قبل إعادة المحاولة.";feedback.className="notice-error";confirm.disabled=false;}});body.append(feedback,confirm);
 const cancel=node("button","btn btn-outline btn-block","إلغاء");cancel.type="button";cancel.addEventListener("click",()=>{dialog.close();dialog.remove();});body.append(cancel);document.body.append(dialog);dialog.showModal();
}
function renderCustomerScreen(){const host=shell();customerList(host);}
if (window.AMANPullToRefresh) { window.AMANPullToRefresh.register("customers", loadCustomers); window.AMANPullToRefresh.register("customers-detail", () => selectedCustomer ? openCustomer(selectedCustomer) : loadCustomers()); }
document.addEventListener("aman:admin-screenchange",e=>{const screen=e.detail?.screen;if(screen==="customers"){renderCustomerScreen();loadCustomers();}});
})();