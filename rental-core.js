/* Integer-cent calculations for the BBCOR rental ledger. */
(()=>{
'use strict';
const cents=value=>Math.round(Number(value||0)*100);
const dateOk=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s)))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s};
const active=(lease,date)=>lease.status==='Active'&&lease.startDate<=date&&(!lease.endDate||lease.endDate>=date);
function monthlyCharge(lease,month,prorate=true){
 if(!dateOk(month+'-01')||lease.status!=='Active')return null;
 const [year,m]=month.split('-').map(Number),days=new Date(Date.UTC(year,m,0)).getUTCDate();
 const first=month+'-01',last=month+'-'+String(days).padStart(2,'0');
 const from=lease.startDate>first?lease.startDate:first,to=lease.endDate&&lease.endDate<last?lease.endDate:last;
 if(from>to)return null;
 const occupiedDays=Math.round((new Date(to+'T12:00:00Z')-new Date(from+'T12:00:00Z'))/86400000)+1;
 const amountCents=prorate?Math.round(Number(lease.rentCents||0)*occupiedDays/days):Number(lease.rentCents||0);
 const due=month+'-'+String(Math.min(days,Math.max(1,Number(lease.dueDay)||1))).padStart(2,'0');
 return {amountCents,dueDate:from>due?from:due,period:month,occupiedDays,days};
}
function leaseBalance(leaseId,charges,payments,asOf){
 const rows=charges.filter(r=>r.leaseId===leaseId&&!r.voided&&r.dueDate<=asOf);
 const billed=rows.reduce((s,r)=>s+(r.kind==='Credit'?-1:1)*Number(r.amountCents||0),0);
 const paid=payments.filter(r=>r.leaseId===leaseId&&!r.voided&&r.date<=asOf).reduce((s,r)=>s+(r.kind==='Rent payment'?1:r.kind==='Rent refund'?-1:0)*Number(r.amountCents||0),0);
 const overdue=rows.filter(r=>r.dueDate<asOf).reduce((s,r)=>s+(r.kind==='Credit'?-1:1)*Number(r.amountCents||0),0);
 const balanceCents=billed-paid;
 return {billedCents:billed,paidCents:paid,balanceCents,pastDueCents:Math.max(0,overdue-paid)};
}
function deposits(leaseId,payments,asOf){return payments.filter(r=>r.leaseId===leaseId&&!r.voided&&r.date<=asOf).reduce((s,r)=>s+(r.kind==='Deposit received'?1:r.kind==='Deposit refund'?-1:0)*Number(r.amountCents||0),0)}
function cashflow(payments,expenses,start,end,propertyId=''){
 const included=r=>!r.voided&&r.date>=start&&r.date<=end&&(!propertyId||r.propertyId===propertyId);
 const incomeCents=payments.filter(included).reduce((s,r)=>s+(r.kind==='Rent payment'?1:r.kind==='Rent refund'?-1:0)*Number(r.amountCents||0),0);
 const expenseCents=expenses.filter(included).reduce((s,r)=>s+Number(r.amountCents||0),0);
 return {incomeCents,expenseCents,netCents:incomeCents-expenseCents};
}
window.BBCORRentalCore={cents,dateOk,active,monthlyCharge,leaseBalance,deposits,cashflow};
})();
