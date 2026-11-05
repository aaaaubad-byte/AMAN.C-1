(() => {
"use strict";
const $=id=>document.getElementById(id),S=()=>window.AMANAdminServices||{};
const el=(tag,cls="",value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
const button=(label,fn,cls="btn btn-outline")=>{const b=el("button",cls,label);b.type="button";b.addEventListener("click",fn);return b;};
/* أيقونات SVG ثابتة داخلية لاختصارات الأقسام (ليست من بيانات المستخدم) */
const svgIcon=d=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const SHORTCUT_ICONS={
 packages:svgIcon('<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>'),
 payments:svgIcon('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'),
 content:svgIcon('<path d="M7 3h10l3 3v15H4V3zM8 10h8M8 14h8M8 18h5"/>'),
 audit:svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
 account:svgIcon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')
};
let fieldSeq=0;const field=(label,type="text",value="")=>{const w=el("div"),l=el("label","field-label",label),i=el("input","field");i.type=type;i.value=value;i.id="f"+(++fieldSeq);l.htmlFor=i.id;w.append(l,i);return {wrap:w,input:i};};
const area=(label,value="")=>{const w=el("div"),l=el("label","field-label",label),i=el("textarea","field");i.rows=5;i.maxLength=20000;i.value=value;i.id="a"+(++fieldSeq);l.htmlFor=i.id;w.append(l,i);return {wrap:w,input:i};};
const select=(label,opts,value)=>{const w=el("div"),l=el("label","field-label",label),i=el("select","field");opts.forEach(([v,t])=>i.add(new Option(t,v)));i.value=value??opts[0]?.[0];i.id="s"+(++fieldSeq);l.htmlFor=i.id;w.append(l,i);return {wrap:w,input:i};};
const panel=(title,children)=>{const p=el("section","surface"),h=el("h2","surface-title",title);p.append(h,...children);return p;};
const host=()=>{const h=$("admin-generic-view");h.replaceChildren();delete h.dataset.pullScreen;delete h.dataset.noPullRefresh;return h;};
const msg=(h,t,bad=false)=>h.append(el("p",bad?"notice-error":"notice-info",t));
const list=(title,items,open,meta)=>{const h=host();h.append(button("إضافة جديد",()=>open(null)));if(!items.length)msg(h,"لم تُضَف بيانات بعد.");items.forEach(x=>h.append(panel(title(x),[el("p","",meta(x)),button("تعديل",()=>open(x))])));};
async function packages(){const h=host();try{const r=await S().listPackages();if(!r?.success)throw Error();h.append(button("إضافة باقة",()=>editPackage(null)));if(!r.items.length)msg(h,"لم تُضَف باقات بعد.");r.items.forEach(p=>h.append(panel(p.name,[el("p","",p.company_name+" • "+p.operation_label+" • "+p.days+" يوم • "+p.price_yer+" ر.ي • "+(p.active?"فعالة":"معطلة")),button("تعديل الباقة",()=>editPackage(p))])));return true;}catch{msg(h,"تعذر تحميل الباقات.",true);return false;}}
async function editPackage(p){const h=host();h.dataset.noPullRefresh="true";let companies=[];try{companies=(await S().listCompanies()).companies||[];}catch{}const company=select("الشركة",companies.map(c=>[c.id,c.name]),p?.company_id),op=select("نوع العملية",[["activation","اشتراك"],["extension","تمديد الاشتراك"],["reactivation","تنشيط"]],p?.operation_type),name=field("اسم الباقة","text",p?.name||""),days=field("المدة بالأيام","number",String(p?.days??365)),price=field("السعر بالريال اليمني","number",String(p?.price_yer??1000)),active=select("الحالة",[["true","فعالة"],["false","معطلة"]],String(p?.active??true)),feedback=el("p");h.append(panel(p?"تعديل الباقة":"إضافة باقة",[company.wrap,op.wrap,name.wrap,days.wrap,price.wrap,active.wrap,feedback,button("حفظ الباقة",async()=>{const v={id:p?.id,company_id:company.input.value,operation_type:op.input.value,name:name.input.value.trim(),days:Number(days.input.value),price_yer:Number(price.input.value),active:active.input.value==="true"};if(!v.company_id||!v.name||!Number.isInteger(v.days)||v.days<1||!Number.isInteger(v.price_yer)||v.price_yer<1){feedback.textContent="أدخل شركة واسمًا ومدة وسعرًا صحيحًا.";return;}try{const r=await S().savePackage(v);if(!r?.success)throw Error();packages();}catch{feedback.textContent="تعذر حفظ الباقة.";}},"btn btn-block"),button("إلغاء",packages)]));}
async function payments(){const h=host();try{const r=await S().listPaymentMethods();if(!r?.success)throw Error();h.append(button("إضافة وسيلة دفع",()=>editPayment(null)));if(!r.items.length)msg(h,"لم تُضَف وسائل دفع بعد.");r.items.forEach(p=>h.append(panel(p.name,[el("p","",p.summary||""),el("p","",p.account_number?"رقم الحساب: "+p.account_number:"لا يوجد رقم حساب"),el("p","",p.instructions),el("p","",p.reference_required===false?"مرجع الدفع غير مطلوب":"مرجع الدفع مطلوب"),el("p","",p.active?"فعالة":"معطلة"),button("تعديل",()=>editPayment(p))])));return true;}catch{msg(h,"تعذر تحميل وسائل الدفع.",true);return false;}}
async function editPayment(p){const h=host();h.dataset.noPullRefresh="true";const name=field("اسم الوسيلة","text",p?.name||""),summary=field("ملخص الوسيلة","text",p?.summary||""),account=field("رقم الحساب","text",p?.account_number||""),instructions=area("تعليمات الدفع",p?.instructions||""),required=select("اشتراط مرجع الدفع",[["true","مطلوب"],["false","غير مطلوب"]],String(p?.reference_required??true)),pattern=field("صيغة المرجع (إن عُرفت)","text",p?.reference_pattern||""),active=select("الحالة",[["true","فعالة"],["false","معطلة"]],String(p?.active??true)),feedback=el("p");h.append(panel(p?"تعديل وسيلة الدفع":"إضافة وسيلة دفع",[name.wrap,summary.wrap,account.wrap,instructions.wrap,required.wrap,pattern.wrap,active.wrap,el("p","notice-info","لا تُرفع صور أو مرفقات إيصالات."),feedback,button("حفظ وسيلة الدفع",async()=>{const v={id:p?.id,name:name.input.value.trim(),summary:summary.input.value.trim(),account_number:account.input.value.trim(),instructions:instructions.input.value.trim(),reference_required:required.input.value==="true",reference_pattern:pattern.input.value.trim()||null,active:active.input.value==="true"};if(!v.name||!v.instructions){feedback.textContent="الاسم والتعليمات مطلوبان.";return;}try{const r=await S().savePaymentMethod(v);if(!r?.success)throw Error();payments();}catch{feedback.textContent="تعذر الحفظ.";}},"btn btn-block"),button("إلغاء",payments)]));}
async function content(){const h=host();h.dataset.noPullRefresh="true";try{const r=await S().getAppContent();if(!r?.success)throw Error();const labels={terms:"الشروط والأحكام",privacy:"سياسة الخصوصية",contact:"التواصل",help:"المساعدة والدعم"};Object.entries(labels).forEach(([key,label])=>{const f=area(label,r.items[key]||"");h.append(panel(label,[f.wrap,button("حفظ النص",async()=>{if(!confirm("تأكيد حفظ نص "+label+"؟"))return;try{const q=await S().saveAppContent({key,body:f.input.value});if(!q?.success)throw Error();msg(h,"تم حفظ "+label+".");}catch{msg(h,"تعذر الحفظ؛ احتفظ بالنص وانسخه قبل إعادة المحاولة.",true);}},"btn btn-block") ]));});return true;}catch{msg(h,"تعذر تحميل المحتوى الثابت.",true);return false;}}
async function audit(){
 const h=host();
 try{
  const r=await S().listAuditLog();
  if(!r?.success)throw Error();
  const items=Array.isArray(r.items)?r.items:[];
  const action=select("الإجراء", [["all","كل الإجراءات"],...(r.actions||[]).map(x=>[x,x])]);
  const entity=select("نوع الكيان", [["all","كل الكيانات"],...(r.entities||[]).map(x=>[x,x])]);
  const search=field("بحث في السجلات","search");
  const rows=el("div"),detail=el("div");
  const showDetail=x=>{
   const values=[
    ["الإجراء",x.action],["الملخص",x.summary],["نوع الكيان",x.entity_type],
    ["معرّف الكيان",x.entity_id],["المنفذ",x.actor_name||x.admin_name||"غير مسجل"],
    ["السبب",x.reason],["التاريخ والوقت",x.created_at]
   ];
   detail.replaceChildren(panel("تفاصيل سجل التدقيق",[
    ...values.filter(([,v])=>v!==undefined&&v!==null&&v!=="").map(([k,v])=>el("p","admin-detail-row",k+" : "+String(v))),
    button("إغلاق التفاصيل",()=>detail.replaceChildren())
   ]));
  };
  const render=()=>{
   rows.replaceChildren();
   const q=search.input.value.trim().toLocaleLowerCase();
   const filtered=items.filter(x=>
    (action.input.value==="all"||x.action===action.input.value)&&
    (entity.input.value==="all"||(x.entity_type||"غير محدد")===entity.input.value)&&
    (!q||[x.action,x.summary,x.entity_type,x.entity_id,x.actor_name,x.admin_name,x.reason,x.created_at].some(v=>String(v??"").toLocaleLowerCase().includes(q)))
   );
   if(!filtered.length){msg(rows,"لا توجد سجلات مطابقة.");return;}
   filtered.forEach(x=>rows.append(panel(x.summary||x.action,[
    el("p","",x.action||"إجراء غير محدد"),
    el("small","",[(x.entity_type||"غير محدد"),(x.entity_id||""),(x.created_at||"")].filter(Boolean).join(" • ")),
    button("عرض التفاصيل",()=>showDetail(x))
   ])));
  };
  action.input.addEventListener("change",render);
  entity.input.addEventListener("change",render);
  search.input.addEventListener("input",render);
  const toolbar=el("div","admin-filter-grid");toolbar.append(search.wrap,action.wrap,entity.wrap);
  h.append(panel("بحث ومرشحات سجل التدقيق",[toolbar]),detail,rows);
  render();
  return true;
 }catch{msg(h,"تعذر تحميل سجل التدقيق.",true);return false;}
}
async function account(){const h=host();try{const r=await S().getCurrentAdmin();if(!r?.success)throw Error();const a=r.admin;const appearance=select("سمة العرض",[["system","حسب الجهاز (افتراضي)"],["light","فاتح"],["dark","داكن"]],window.AMANTheme?.getPreference?.()||"system");appearance.input.dataset.themeSetting="";h.append(panel("الحساب الإداري",[el("p","", "الاسم: "+(a.full_name||"—")),el("p","", "البريد: "+(a.email||"—")),el("p","", "الدور: مدير النظام")]));h.append(panel("إعدادات العرض",[el("p","surface-desc","اختر مظهر التطبيق. خيار «حسب الجهاز» يتبع إعداد المظهر في جهازك."),appearance.wrap]));h.append(panel("جلسة الحساب",[button("تسجيل الخروج",async()=>{if(!confirm("هل تريد تسجيل الخروج من حساب الإدارة؟"))return;const q=await S().signOutAdmin();if(!q?.success){msg(h,"تعذر تأكيد تسجيل الخروج.",true);return;}location.reload();},"btn btn-block")]));return true;}catch{msg(h,"تعذر تحميل بيانات الحساب الإداري.",true);return false;}}
if (window.AMANPullToRefresh) { window.AMANPullToRefresh.register("packages", packages); window.AMANPullToRefresh.register("payments", payments); window.AMANPullToRefresh.register("content", content); window.AMANPullToRefresh.register("audit", audit); window.AMANPullToRefresh.register("account", account); }
document.addEventListener("aman:admin-screenchange",e=>{const s=e.detail?.screen;if(s==="packages")packages();if(s==="payments")payments();if(s==="content")content();if(s==="audit")audit();if(s==="account")account();});
document.addEventListener("click",e=>{const b=e.target.closest("[data-section]");if(b&&["packages","payments","content","audit","account"].includes(b.dataset.section)){e.preventDefault();window.AMANAdminNavigation?.navigate(b.dataset.section);}});
document.addEventListener("DOMContentLoaded",()=>{const shortcuts=document.querySelector(".admin-shortcuts");if(shortcuts){const items=[["packages","باقات الحماية"],["payments","وسائل الدفع"],["content","المحتوى الثابت"],["audit","سجل التدقيق"],["account","الحساب الإداري"]];items.forEach(([id,title])=>{const b=el("button","admin-shortcut");b.dataset.section=id;const icon=el("span","quick-icon");icon.innerHTML=SHORTCUT_ICONS[id]||"";b.append(icon,el("strong","",title));shortcuts.append(b);});}});
})();