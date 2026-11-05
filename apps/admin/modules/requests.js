(() => {
"use strict";
const $ = id => document.getElementById(id);
const service = () => window.AMANAdminServices || null;
const safe = value => value === null || value === undefined || value === "" ? "—" : String(value);
const el = (tag, cls, value) => { const n=document.createElement(tag); if(cls)n.className=cls; if(value!==undefined)n.textContent=safe(value); return n; };
function panel(title, rows) {
 const box=el("section","surface admin-detail-panel"), h=el("h2","surface-title",title); box.append(h);
 rows.forEach(([k,v,dir])=>{const row=el("div","admin-detail-row"),a=el("span","",k),b=el("strong","",v);if(dir)b.dir=dir;row.append(a,b);box.append(row);});
 return box;
}
function setNotice(node,value,error=false){node.textContent=value;node.className=error?"notice-error":"notice-info";}
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

document.addEventListener("click",e=>{
 const target=e.target.closest("button[data-admin-action]") || e.target.closest("button");
 if(!target)return;
 const action=target.dataset.adminAction || (target.textContent.trim()==="مراجعة أثر الاعتماد"?"approve":target.textContent.trim()==="رفض الطلب"?"reject":"");
 if(action==="approve"){e.preventDefault();e.stopImmediatePropagation();openApprovalDialog();}
 else if(action==="reject"){e.preventDefault();e.stopImmediatePropagation();openRejectDialog();}
},true);
})();
