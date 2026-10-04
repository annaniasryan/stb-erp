
/* ---------- constants ---------- */
const UNITS=[{k:"TK",name:"TK"},{k:"SD",name:"SD"},{k:"SMP",name:"SMP"},{k:"SMA",name:"SMA"},{k:"YYS",name:"Yayasan"}];
const UNIT_NAME=Object.fromEntries(UNITS.map(u=>[u.k,u.name]));
const KINDS={kegiatan:"Kegiatan",akademik:"Akademik",libur:"Libur"};
const MONTHS=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const DOW=["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const H0=6,H1=21; // facility grid hours
const TAB=Math.random().toString(36).slice(2);

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
function h(tag,attrs,...kids){const el=document.createElement(tag);if(attrs)for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==="class")el.className=v;else if(k==="text")el.textContent=v;else if(k.startsWith("on"))el.addEventListener(k.slice(2),v);else el.setAttribute(k,v===true?"":v)}for(const c of kids.flat()){if(c==null||c===false)continue;el.append(c.nodeType?c:String(c))}return el}
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pIso=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=pIso(s);d.setDate(d.getDate()+n);return iso(d)};
const TODAY=iso(new Date());
const toMin=t=>{if(!t)return 0;const[a,b]=t.split(":").map(Number);return a*60+(b||0)};
const endOf=e=>e.endDate&&e.endDate>e.date?e.endDate:e.date;
const tRange=e=>e.allDay?[0,1440]:[toMin(e.start),toMin(e.end)];
const fmtDay=s=>{const d=pIso(s);return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`};
const fmtShort=s=>{const d=pIso(s);return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}`};
const timeLabel=e=>e.allDay?"Sepanjang hari":`${e.start}–${e.end}`;
function rangeLabel(e){const end=endOf(e);return end===e.date?fmtDay(e.date):`${fmtDay(e.date)} – ${fmtDay(end)}`}
function taLabel(d){const y=d.getFullYear(),m=d.getMonth();return m>=6?`Tahun Ajaran ${y}/${y+1} · Semester Ganjil`:`Tahun Ajaran ${y-1}/${y} · Semester Genap`}
const store={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};

function clash(a,b){
  if(!a.facilityId||a.facilityId!==b.facilityId||a.id===b.id)return false;
  if(a.kind==="libur"||b.kind==="libur")return false;
  if(!(a.date<=endOf(b)&&b.date<=endOf(a)))return false;
  const[a0,a1]=tRange(a),[b0,b1]=tRange(b);return a0<b1&&b0<a1;
}

/* ---------- state ---------- */
const S={
  view:store.get("tb.view")||"kalender",
  month:(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)})(),
  day:TODAY, units:new Set(UNITS.map(u=>u.k)), fac:"all",
  facilities:[], events:[], loadedF:false, loadedE:false,
  db:null, sb:null, me:null, myName:"", role:null, myUnit:null, canWrite:false, canAdmin:false, readOnly:false,
  demo:false, showPast:false, onlyClash:false, onlyDocs:false, error:null
};

/* demo data (in memory only, never saved) */
function demoData(){
  const m=S.month,y=m.getFullYear(),mo=m.getMonth();
  const d=n=>iso(new Date(y,mo,n));
  const f=[{id:"demo-aula",name:"Aula (contoh)",location:"Gedung A"},{id:"demo-futsal",name:"Lapangan Futsal (contoh)",location:"Area belakang"}];
  const basket=(S.facilities.find(x=>/basket/i.test(x.name))||{id:"demo-basket",name:"Lapangan Basket (contoh)"});
  if(basket.id==="demo-basket")f.unshift(basket);
  const e=[
    {id:"x1",unit:"SMP",title:"Class Meeting",kind:"kegiatan",date:d(8),start:"08:00",end:"11:00",facilityId:basket.id,pic:"OSIS SMP",needs:"Bangku 40, sound system, 2 mic wireless",docs:true},
    {id:"x2",unit:"SD",title:"Latihan Porseni",kind:"kegiatan",date:d(8),start:"10:00",end:"12:00",facilityId:basket.id,pic:"Guru PJOK SD"},
    {id:"x3",unit:"TK",title:"Market Day",kind:"kegiatan",date:d(10),start:"07:30",end:"10:30",facilityId:"demo-aula",pic:"Wali kelas TK B",needs:"Meja 20, taplak, audio",docs:true},
    {id:"x4",unit:"SMA",title:"Asesmen Tengah Semester",kind:"akademik",date:d(13),endDate:d(17),allDay:true,facilityId:null},
    {id:"x5",unit:"YYS",title:"Rapat Koordinasi Yayasan",kind:"kegiatan",date:d(15),start:"13:00",end:"15:00",facilityId:"demo-aula"},
    {id:"x6",unit:"SMA",title:"Turnamen Futsal Antarkelas",kind:"kegiatan",date:d(20),start:"14:00",end:"17:00",facilityId:"demo-futsal",pic:"OSIS SMA"},
    {id:"x7",unit:"SD",title:"Pembagian Rapor",kind:"akademik",date:d(24),allDay:true,facilityId:null},
    {id:"x8",unit:"YYS",title:"Libur Nasional",kind:"libur",date:d(27),allDay:true,facilityId:null}
  ];
  return{f,e};
}
const facs=()=>S.demo?[...S.facilities,...demoData().f.filter(x=>!S.facilities.some(r=>r.id===x.id))]:S.facilities;
const evs=()=>S.demo?demoData().e:S.events;
const facById=id=>facs().find(f=>f.id===id);

function conflictMap(list){
  const m=new Map(),by={};
  for(const e of list)if(e.facilityId&&e.kind!=="libur")(by[e.facilityId]??=[]).push(e);
  for(const arr of Object.values(by))for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++)if(clash(arr[i],arr[j])){
    (m.get(arr[i].id)||m.set(arr[i].id,[]).get(arr[i].id)).push(arr[j]);
    (m.get(arr[j].id)||m.set(arr[j].id,[]).get(arr[j].id)).push(arr[i]);
  }
  return m;
}
function visible(){
  return evs().filter(e=>S.units.has(e.unit)&&(S.fac==="all"||e.facilityId===S.fac));
}
const onDay=(list,day)=>list.filter(e=>e.date<=day&&day<=endOf(e)).sort((a,b)=>(b.allDay?1:0)-(a.allDay?1:0)||tRange(a)[0]-tRange(b)[0]);

/* ---------- render ---------- */
function render(){
  $("#ta-label").textContent=taLabel(S.view==="fasilitas"?pIso(S.day):S.month);
  document.querySelectorAll(".seg button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.view===S.view)));
  // chips
  const chips=$("#unit-chips");chips.replaceChildren(...UNITS.map(u=>h("button",{type:"button",class:`chip u-${u.k}`,"aria-pressed":String(S.units.has(u.k)),onclick(){S.units.has(u.k)?S.units.delete(u.k):S.units.add(u.k);if(!S.units.size)UNITS.forEach(x=>S.units.add(x.k));render()}},h("span",{class:"dot"}),u.name)));
  // facility filter
  const sel=$("#fac-filter");sel.replaceChildren(h("option",{value:"all"},"Semua fasilitas"),...facs().map(f=>h("option",{value:f.id},f.name)));
  if(S.fac!=="all"&&!facById(S.fac))S.fac="all";sel.value=S.fac;
  // conflicts
  const cm=conflictMap(evs());const upcoming=[...cm.keys()].map(id=>evs().find(e=>e.id===id)).filter(e=>endOf(e)>=TODAY);
  const pill=$("#clash-pill");pill.hidden=!upcoming.length;pill.textContent=`${upcoming.length} jadwal bentrok`;
  // buttons
  const can=S.db&&!S.readOnly&&S.canWrite!==false;
  $("#btn-add").hidden=!can||S.demo;$("#btn-import").hidden=!can||S.demo;$("#btn-fac").hidden=!(S.db&&S.canAdmin)||S.demo;
  renderBanner();
  const v=$("#view");
  v.replaceChildren(S.view==="kalender"?viewMonth(cm):S.view==="fasilitas"?viewFac(cm):viewAgenda(cm));
  $("#legend").replaceChildren(...UNITS.map(u=>h("span",{class:`u-${u.k}`},h("i"),u.k==="YYS"?"Yayasan / semua unit":u.name)),h("span",null,h("span",{class:"bang"},"!"),"Bentrok: fasilitas dipakai di jam yang sama"));
}

function renderBanner(){
  const b=$("#banner");b.replaceChildren();
  if(S.demo){b.append(h("div",{class:"banner demo"},h("div",null,h("b",null,"Mode contoh. "),"Kegiatan di bawah hanya ilustrasi dan tidak tersimpan. Lihat tanggal 8: dua unit memakai lapangan basket di jam yang sama."),h("button",{class:"btn",type:"button",onclick(){S.demo=false;render()}},"Tutup contoh")));return}
  if(S.error){b.append(h("div",{class:"banner"},h("div",null,h("b",null,"Data belum bisa dimuat. "),S.error),h("button",{class:"btn",type:"button",onclick(){S.demo=true;render()}},"Lihat contoh")));return}
  if(S.db&&S.loadedE&&!S.events.length){
    b.append(h("div",{class:"banner"},h("div",null,h("b",null,"Belum ada kegiatan. "),"Mulai dengan menempelkan kalender pendidikan unit dari Excel, atau tambahkan booking fasilitas pertama."),
      h("div",{class:"actions"},h("button",{class:"btn",type:"button",onclick(){S.demo=true;render()}},"Lihat contoh"),S.canWrite!==false&&!S.readOnly?h("button",{class:"btn primary",type:"button",onclick:openImport},"Impor dari Excel"):null)));
  }
  if(S.readOnly)b.append(h("div",{class:"banner"},h("div",null,h("b",null,"Hanya lihat. "),"Akun Anda bisa melihat semua jadwal, tapi belum bisa menambah. Minta admin kalender mengubah peran Anda menjadi editor.")));
}

function evChip(e,cm,full){
  const f=facById(e.facilityId);const isC=cm.has(e.id);
  return h("div",{class:`ev u-${e.unit}${e.kind==="libur"?" libur":""}${isC?" clash":""}`,title:`${UNIT_NAME[e.unit]} · ${e.title}${f?" · "+f.name:""} · ${timeLabel(e)}`,onclick(ev){ev.stopPropagation();openDetail(e)}},
    isC?h("span",{class:"bang"},"!"):null,
    !e.allDay?h("span",{class:"t"},e.start):null,
    h("b",null,UNIT_NAME[e.unit]+" "),e.title,
    full&&f?h("span",{class:"t"}," · "+f.name):null);
}

function viewMonth(cm){
  const m=S.month,y=m.getFullYear(),mo=m.getMonth();
  const first=new Date(y,mo,1);const startOff=(first.getDay()+6)%7;
  let cur=iso(new Date(y,mo,1-startOff));const last=iso(new Date(y,mo+1,0));
  const list=visible();const cells=[];
  do{for(let i=0;i<7;i++){const d=pIso(cur);const day=cur;const items=onDay(list,day);const out=d.getMonth()!==mo;
    const wk=d.getDay()===0;
    cells.push(h("div",{class:`day${out?" out":""}${day===TODAY?" today":""}${wk?" weekend":""}`,tabindex:"0",role:"button","aria-label":fmtDay(day),onclick(){openDay(day)},onkeydown(ev){if(ev.key==="Enter")openDay(day)}},
      h("div",{class:"dnum tnum"},h("span",null,d.getDate()),items.some(e=>cm.has(e.id))?h("span",{class:"bang",title:"Ada bentrok"},"!"):null),
      ...items.slice(0,3).map(e=>evChip(e,cm)),
      items.length>3?h("div",{class:"more"},`+${items.length-3} lagi`):null,
      h("div",{class:"dots"},...items.slice(0,6).map(e=>h("i",{class:`u-${e.unit}${cm.has(e.id)?" clash":""}`})))));
    cur=addDays(cur,1)}}while(cur<=last);
  return h("div",{style:"display:flex;flex-direction:column;gap:10px"},
    h("div",{class:"vhead"},
      h("button",{class:"btn navbtn",type:"button","aria-label":"Bulan sebelumnya",onclick(){S.month=new Date(y,mo-1,1);if(S.demo)S.demo=true;render()}},"‹"),
      h("h2",null,`${MONTHS[mo]} ${y}`),
      h("button",{class:"btn navbtn",type:"button","aria-label":"Bulan berikutnya",onclick(){S.month=new Date(y,mo+1,1);render()}},"›"),
      h("button",{class:"btn ghost",type:"button",onclick(){const t=new Date();S.month=new Date(t.getFullYear(),t.getMonth(),1);render()}},"Hari ini"),
      h("span",{class:"sub"},"Klik tanggal untuk melihat pemakaian fasilitas hari itu.")),
    h("div",{class:"month"},h("div",{class:"dow"},...["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map(d=>h("div",null,d))),h("div",{class:"weeks"},...cells)));
}

function lanes(items){const ends=[];return items.map(e=>{const[s,t]=tRange(e);let i=ends.findIndex(x=>x<=s);if(i<0){i=ends.length;ends.push(t)}else ends[i]=t;return{e,lane:i}})}

function viewFac(cm){
  const day=S.day;const list=onDay(visible(),day);
  const fl=facs().filter(f=>S.fac==="all"||f.id===S.fac);
  const hw=68;const span=(H1-H0)*60;
  const pos=m=>((Math.max(H0*60,Math.min(H1*60,m))-H0*60)/60)*hw;
  const head=h("div",{class:"frow fhead"},h("div",{class:"flabel"},h("span",{class:"eyebrow"},"Fasilitas")),h("div",{class:"ftrack"},...Array.from({length:H1-H0},(_,i)=>h("span",{class:"hr",style:`left:${i*hw}px`},pad(H0+i)+".00"))));
  const nowM=new Date().getHours()*60+new Date().getMinutes();
  const rows=fl.map(f=>{
    const items=list.filter(e=>e.facilityId===f.id).sort((a,b)=>tRange(a)[0]-tRange(b)[0]);
    const L=lanes(items);const n=Math.max(1,...L.map(x=>x.lane+1));
    const track=h("div",{class:"ftrack",style:`height:${n*32+12}px`,title:"Klik area kosong untuk booking",onclick(ev){if(ev.target!==track)return;if(!canAdd())return;const r=track.getBoundingClientRect();const hr=Math.floor((ev.clientX-r.left)/hw)+H0;openForm(null,{date:day,facilityId:f.id,start:pad(hr)+":00",end:pad(Math.min(hr+1,23))+":00"})}},
      day===TODAY&&nowM>H0*60&&nowM<H1*60?h("div",{class:"nowline",style:`left:${pos(nowM)}px`}):null,
      ...L.map(({e,lane})=>{const[s,t]=tRange(e);const l=pos(s),w=Math.max(28,pos(t)-l-2);
        return h("div",{class:`bar u-${e.unit}${cm.has(e.id)?" clash":""}`,style:`left:${l+1}px;width:${w}px;top:${6+lane*32}px`,title:`${UNIT_NAME[e.unit]} · ${e.title} · ${timeLabel(e)}`,onclick(ev){ev.stopPropagation();openDetail(e)}},h("b",null,UNIT_NAME[e.unit]),e.allDay?"":e.start+" ",e.title)}));
    return h("div",{class:"frow"},h("div",{class:"flabel"},f.name,f.location?h("small",null,f.location):null),track);
  });
  const noFac=list.filter(e=>!e.facilityId);
  const grid=fl.length?h("div",{class:"fgrid-wrap"},h("div",{class:"fgrid",style:`--hw:${hw}px`},head,...rows)):h("div",{class:"banner"},h("div",null,h("b",null,"Belum ada fasilitas. "),S.canAdmin?"Tambahkan lewat tombol Kelola fasilitas.":"Admin perlu menambahkan daftar fasilitas."));
  return h("div",{style:"display:flex;flex-direction:column;gap:10px"},
    h("div",{class:"vhead"},
      h("button",{class:"btn navbtn",type:"button","aria-label":"Hari sebelumnya",onclick(){S.day=addDays(S.day,-1);render()}},"‹"),
      h("h2",null,fmtDay(day)),
      h("button",{class:"btn navbtn",type:"button","aria-label":"Hari berikutnya",onclick(){S.day=addDays(S.day,1);render()}},"›"),
      h("input",{type:"date",id:"fac-date",value:day,"aria-label":"Pilih tanggal",style:"border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:6px 8px",onchange(ev){if(ev.target.value){S.day=ev.target.value;render()}}}),
      h("button",{class:"btn ghost",type:"button",onclick(){S.day=TODAY;render()}},"Hari ini")),
    noFac.length?h("div",{class:"allday-strip",style:"background:var(--surface);border:1px solid var(--line);border-radius:var(--r)"},h("span",{class:"lbl"},"Agenda unit hari ini"),...noFac.map(e=>evChip(e,cm))):null,
    grid,
    fl.length&&canAdd()?h("div",{class:"hint"},"Klik area kosong di baris fasilitas untuk langsung membuat booking di jam itu. Garis putus-putus merah berarti bentrok."):null);
}

function viewAgenda(cm){
  let list=visible().slice().sort((a,b)=>a.date.localeCompare(b.date)||tRange(a)[0]-tRange(b)[0]);
  if(!S.showPast)list=list.filter(e=>endOf(e)>=TODAY);
  if(S.onlyClash)list=list.filter(e=>cm.has(e.id));
  if(S.onlyDocs)list=list.filter(e=>e.docs);
  const groups={};for(const e of list){const k=e.date.slice(0,7);(groups[k]??=[]).push(e)}
  const head=h("div",{class:"vhead"},h("h2",null,S.onlyClash?"Jadwal bentrok":"Agenda"),
    h("label",{class:"check"},h("input",{type:"checkbox",id:"ag-past",checked:S.showPast,onchange(ev){S.showPast=ev.target.checked;render()}}),"Tampilkan yang sudah lewat"),
    h("label",{class:"check"},h("input",{type:"checkbox",id:"ag-docs",checked:S.onlyDocs,onchange(ev){S.onlyDocs=ev.target.checked;render()}}),"Hanya yang perlu dokumentasi DM"),
    S.onlyClash?h("button",{class:"btn",type:"button",onclick(){S.onlyClash=false;render()}},"Tampilkan semua"):null);
  if(!list.length)return h("div",{class:"agenda"},head,h("div",{class:"banner"},S.onlyClash?"Tidak ada jadwal bentrok. Semua fasilitas aman.":S.onlyDocs?"Belum ada kegiatan yang meminta dokumentasi Digital Marketing.":"Tidak ada kegiatan untuk filter ini."));
  return h("div",{class:"agenda"},head,...Object.entries(groups).map(([k,arr])=>{const[y,m]=k.split("-").map(Number);
    return h("section",{class:"agroup"},h("h3",null,`${MONTHS[m-1]} ${y}`),h("div",{class:"alist"},...arr.map(e=>{const d=pIso(e.date);const f=facById(e.facilityId);const end=endOf(e);
      return h("div",{class:"arow",tabindex:"0",role:"button",onclick(){openDetail(e)},onkeydown(ev){if(ev.key==="Enter")openDetail(e)}},
        h("div",{class:"adate tnum"},`${DOW[d.getDay()]} ${d.getDate()}`,h("small",null,end!==e.date?`s.d. ${fmtShort(end)}`:MONTHS[d.getMonth()].slice(0,3))),
        h("div",{style:"min-width:0"},h("div",{class:"atitle"},h("span",{class:`ubadge u-${e.unit}`},UNIT_NAME[e.unit]),e.title,e.docs?[" ",h("span",{class:"tag-doc"},"Dokumentasi DM")]:null),
          h("div",{class:"ameta"},h("span",{class:"mono"},timeLabel(e)),f?h("span",null,f.name):e.facilityId?h("span",null,"Fasilitas dihapus"):null,e.pic?h("span",null,"PJ: "+e.pic):null),
          e.needs?h("div",{class:"needs"},h("b",null,"Kebutuhan: "),e.needs):null),
        cm.has(e.id)?h("span",{class:"kind clash"},"Bentrok"):h("span",{class:"kind"},KINDS[e.kind]||"Kegiatan"));
    })))}));
}

/* ---------- sheets ---------- */
function closeSheet(){$("#layer").replaceChildren()}
function sheet(...kids){const sc=h("div",{class:"scrim",onclick(ev){if(ev.target===sc)closeSheet()}},h("div",{class:"sheet",role:"dialog","aria-modal":"true"},...kids));$("#layer").replaceChildren(sc);const f=sc.querySelector("input,select,textarea,button");f&&f.focus()}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});
const shead=t=>h("div",{class:"shead"},h("h2",null,t),h("button",{class:"btn ghost",type:"button","aria-label":"Tutup",onclick:closeSheet},"✕"));
function toast(t){const el=h("div",{class:"toast",role:"status"},t);document.body.append(el);setTimeout(()=>el.remove(),2600)}
const canAdd=()=>!!S.db&&!S.readOnly&&S.canWrite!==false&&!S.demo;

function openDay(day){
  const cm=conflictMap(evs());const items=onDay(visible(),day);
  sheet(shead(fmtDay(day)),
    items.length?h("div",{class:"daylist"},...items.map(e=>evChip(e,cm,true))):h("div",{class:"hint"},"Belum ada kegiatan di tanggal ini."),
    h("div",{class:"sfoot"},
      h("button",{class:"btn",type:"button",onclick(){S.view="fasilitas";S.day=day;store.set("tb.view",S.view);closeSheet();render()}},"Lihat jadwal fasilitas"),
      canAdd()?h("button",{class:"btn primary",type:"button",onclick(){openForm(null,{date:day})}},"+ Tambah di tanggal ini"):null));
}

async function openDetail(e){
  const f=facById(e.facilityId);const cm=conflictMap(evs());const others=cm.get(e.id)||[];
  const mine=S.me&&e.createdBy===S.me;const editable=canAdd()&&(mine||S.canAdmin);
  const who=h("dd",null,e.createdByName||"—");
  const del=h("button",{class:"btn danger",type:"button",onclick:async()=>{
    if(del.dataset.arm!=="1"){del.dataset.arm="1";del.textContent="Klik lagi untuk menghapus";return}
    try{await api.deleteEvent(e.id);closeSheet();toast("Kegiatan dihapus")}catch(err){toast(errText(err))}}},"Hapus");
  sheet(shead(e.title),
    h("div",null,h("span",{class:`ubadge u-${e.unit}`},UNIT_NAME[e.unit]),h("span",{class:"kind"},KINDS[e.kind]||"Kegiatan")),
    others.length?h("div",{class:"conflict bad"},h("b",null,"Bentrok dengan:"),h("ul",null,...others.map(o=>h("li",null,`${UNIT_NAME[o.unit]} · ${o.title} (${timeLabel(o)}, ${fmtShort(o.date)})`)))):null,
    h("dl",{class:"dl"},
      h("dt",null,"Tanggal"),h("dd",null,rangeLabel(e)),
      h("dt",null,"Waktu"),h("dd",{class:"mono"},timeLabel(e)),
      h("dt",null,"Fasilitas"),h("dd",null,f?f.name+(f.location?` (${f.location})`:""):e.facilityId?"Fasilitas sudah dihapus":"Tidak memakai fasilitas"),
      e.pic?[h("dt",null,"Penanggung jawab"),h("dd",null,e.pic)]:null,
      h("dt",null,"Kebutuhan"),h("dd",null,e.needs||"—"),
      h("dt",null,"Dokumentasi"),h("dd",null,e.docs?h("span",{class:"tag-doc"},"Perlu dokumentasi Digital Marketing"):"Tidak perlu"),
      e.notes?[h("dt",null,"Catatan"),h("dd",null,e.notes)]:null,
      e.createdByName?[h("dt",null,"Diinput oleh"),who]:null),
    S.demo?h("div",{class:"hint"},"Ini contoh, tidak tersimpan."):null,
    editable&&!S.demo?h("div",{class:"sfoot"},h("button",{class:"btn primary",type:"button",onclick(){openForm(e)}},"Ubah"),del):
    canAdd()&&!S.demo?h("div",{class:"hint"},"Hanya yang menginput kegiatan ini atau admin yang bisa mengubahnya."):null);
}

function errText(err){const c=err&&err.code;if(c==="42501"||c==="PGRST301"||c==="noperm")return"Akun Anda tidak punya izin untuk ini. Hubungi admin kalender.";if(c==="23514")return"Data belum lengkap atau tidak valid. Periksa tanggal dan jam.";if(c==="401"||/JWT/i.test(err&&err.message||""))return"Sesi habis. Muat ulang halaman lalu masuk lagi.";return"Gagal menyimpan. Periksa koneksi lalu coba lagi."}

function openForm(ev,preset={}){
  const e=ev||{unit:S.myUnit||store.get("tb.unit")||"SD",kind:"kegiatan",date:preset.date||S.day||TODAY,start:preset.start||"07:30",end:preset.end||"09:00",allDay:false,facilityId:preset.facilityId||"",title:"",pic:"",notes:""};
  const F=(id,label,input)=>h("div",{class:"field"},h("label",{for:id},label),input);
  const unit=h("select",{id:"f-unit"},...UNITS.map(u=>h("option",{value:u.k},u.k==="YYS"?"Yayasan / semua unit":u.name)));unit.value=e.unit;
  const title=h("input",{id:"f-title",type:"text",value:e.title||"",placeholder:"mis. Class Meeting, Latihan Paskibra",maxlength:"120",required:true});
  const kind=h("select",{id:"f-kind"},...Object.entries(KINDS).map(([k,v])=>h("option",{value:k},v)));kind.value=e.kind||"kegiatan";
  const date=h("input",{id:"f-date",type:"date",value:e.date});
  const endD=h("input",{id:"f-enddate",type:"date",value:endOf(e)});
  const all=h("input",{id:"f-allday",type:"checkbox",checked:!!e.allDay});
  const st=h("input",{id:"f-start",type:"time",step:"900",value:e.start||"07:30"});
  const en=h("input",{id:"f-end",type:"time",step:"900",value:e.end||"09:00"});
  const fac=h("select",{id:"f-fac"},h("option",{value:""},"Tidak memakai fasilitas"),...S.facilities.map(f=>h("option",{value:f.id},f.name)));fac.value=e.facilityId||"";
  const needs=h("textarea",{id:"f-needs",maxlength:"500",style:"min-height:56px",placeholder:"mis. Bangku 40, sound system, 2 mic, proyektor"},e.needs||"");
  const docs=h("input",{id:"f-docs",type:"checkbox",checked:!!e.docs});
  const pic=h("input",{id:"f-pic",type:"text",value:e.pic||"",placeholder:"Nama guru / panitia",maxlength:"80"});
  const notes=h("textarea",{id:"f-notes",maxlength:"500",placeholder:"Opsional"},e.notes||"");
  const box=h("div",{"aria-live":"polite"});const err=h("div",{class:"err"});
  const times=h("div",{class:"row2"},F("f-start","Jam mulai",st),F("f-end","Jam selesai",en));
  const save=h("button",{class:"btn primary",type:"submit"},ev?"Simpan perubahan":"Simpan");
  function read(){return{unit:unit.value,title:title.value.trim(),kind:kind.value,date:date.value,endDate:endD.value&&endD.value>date.value?endD.value:date.value,allDay:all.checked,start:all.checked?null:st.value,end:all.checked?null:en.value,facilityId:fac.value||null,needs:needs.value.trim(),docs:docs.checked,pic:pic.value.trim(),notes:notes.value.trim()}}
  function check(){
    times.hidden=all.checked;const d=read();box.replaceChildren();box.className="";
    if(!d.facilityId){save.disabled=false;return[]}
    const hits=S.events.filter(o=>clash({...d,id:ev?ev.id:"__new"},o));
    const fname=(facById(d.facilityId)||{}).name;
    if(hits.length){box.className="conflict bad";box.append(h("b",null,`${fname} sudah dipakai di waktu itu:`),h("ul",null,...hits.map(o=>h("li",null,`${UNIT_NAME[o.unit]} · ${o.title} · ${fmtShort(o.date)} ${timeLabel(o)}${o.pic?" · PJ "+o.pic:""}`))),h("div",{style:"margin-top:6px"},"Pilih jam atau fasilitas lain, atau koordinasikan dengan unit tersebut."));save.disabled=true}
    else if(d.date&&(d.allDay||d.start<d.end)){box.className="conflict good";box.textContent=`${fname} tersedia di waktu ini.`;save.disabled=false}
    return hits;
  }
  const form=h("form",{style:"display:flex;flex-direction:column;gap:12px",onsubmit:async(x)=>{x.preventDefault();err.textContent="";
    const d=read();
    if(!d.title)return err.textContent="Isi nama kegiatan.";
    if(!d.date)return err.textContent="Pilih tanggal.";
    if(!d.allDay&&!(d.start<d.end))return err.textContent="Jam selesai harus setelah jam mulai.";
    if(check().length)return;
    save.disabled=true;save.textContent="Menyimpan…";
    try{await saveEvent(d,ev);store.set("tb.unit",d.unit);closeSheet();toast(ev?"Perubahan disimpan":"Tersimpan. Semua unit sekarang bisa melihatnya.")}
    catch(e2){err.textContent=e2&&e2.clashWith?`Baru saja dibooking oleh ${UNIT_NAME[e2.clashWith.unit]} (${e2.clashWith.title}, ${timeLabel(e2.clashWith)}). Pilih waktu lain.`:errText(e2);save.disabled=false;save.textContent=ev?"Simpan perubahan":"Simpan";check()}
  }},
    h("div",{class:"row2"},F("f-unit","Unit",unit),F("f-kind","Jenis",kind)),
    F("f-title","Nama kegiatan",title),
    h("div",{class:"row2"},F("f-date","Tanggal mulai",date),F("f-enddate","Sampai tanggal",endD)),
    h("label",{class:"check"},all,"Sepanjang hari"),
    times,
    F("f-fac","Fasilitas yang dipakai",fac),
    box,
    F("f-needs","Kebutuhan kegiatan",needs),
    h("label",{class:"docopt",for:"f-docs"},docs,h("span",null,h("b",null,"Perlu dokumentasi dari Digital Marketing"),h("small",null,"Tim DM bisa melihat semua permintaan lewat Agenda."))),
    F("f-pic","Penanggung jawab",pic),
    F("f-notes","Catatan",notes),
    err,
    h("div",{class:"sfoot"},save,h("button",{class:"btn",type:"button",onclick:closeSheet},"Batal")));
  form.addEventListener("input",check);form.addEventListener("change",()=>{if(endD.value<date.value)endD.value=date.value;check()});
  sheet(shead(ev?"Ubah kegiatan":"Kegiatan / booking baru"),form);check();setTimeout(()=>title.focus(),0);
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function saveEvent(d,ev){await api.saveEvent(d,ev)}

/* ---------- facilities ---------- */
function openFacilities(){
  const list=h("div",{style:"display:flex;flex-direction:column;gap:8px"});
  function draw(){list.replaceChildren(...S.facilities.map(f=>{
    const n=h("input",{type:"text",value:f.name,"aria-label":"Nama fasilitas",id:"fn-"+f.id});
    const l=h("input",{type:"text",value:f.location||"",placeholder:"Lokasi","aria-label":"Lokasi",id:"fl-"+f.id,style:"max-width:130px"});
    const used=S.events.filter(e=>e.facilityId===f.id).length;
    const del=h("button",{class:"btn ghost",type:"button","aria-label":"Hapus "+f.name,onclick:async()=>{if(del.dataset.arm!=="1"){del.dataset.arm="1";del.textContent=used?`Hapus? (${used} booking)`:"Hapus?";return}try{await api.deleteFacility(f.id)}catch(e){toast(errText(e))}}},"✕");
    const commit=async()=>{const nv=n.value.trim(),lv=l.value.trim();if(!nv||(nv===f.name&&lv===(f.location||"")))return;try{await api.updateFacility(f.id,{name:nv,location:lv});toast("Fasilitas diperbarui")}catch(e){toast(errText(e))}};
    n.addEventListener("change",commit);l.addEventListener("change",commit);
    return h("div",{class:"facitem"},n,l,del)}))}
  const nn=h("input",{type:"text",id:"fac-new",placeholder:"mis. Aula, Lapangan Futsal, Lab Komputer",maxlength:"60"});
  const nl=h("input",{type:"text",id:"fac-new-loc",placeholder:"Lokasi (opsional)",maxlength:"60",style:"max-width:150px"});
  const add=h("form",{class:"facitem",onsubmit:async x=>{x.preventDefault();const v=nn.value.trim();if(!v)return;try{await api.addFacility({name:v,location:nl.value.trim()});nn.value="";nl.value="";nn.focus()}catch(e){toast(errText(e))}}},nn,nl,h("button",{class:"btn primary",type:"submit"},"Tambah"));
  sheet(shead("Kelola fasilitas"),h("div",{class:"hint"},"Fasilitas bersama yang bisa dibooking semua unit. Hanya admin yang bisa mengubah daftar ini."),list,h("div",{class:"flab"},"Tambah fasilitas"),add);
  draw();S._facDraw=draw;
}

/* ---------- import ---------- */
const MON={jan:1,januari:1,january:1,feb:2,februari:2,pebruari:2,february:2,mar:3,maret:3,march:3,apr:4,april:4,mei:5,may:5,jun:6,juni:6,june:6,jul:7,juli:7,july:7,agu:8,agt:8,ags:8,agus:8,agustus:8,aug:8,august:8,sep:9,sept:9,september:9,okt:10,oktober:10,oct:10,october:10,nov:11,nop:11,nopember:11,november:11,des:12,desember:12,dec:12,december:12};
function mk(y,m,d){const dt=new Date(y,m-1,d);return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?iso(dt):null}
function pDate(s){s=String(s||"").trim().toLowerCase().replace(/^(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)\s*,?\s*/,"");let m;
  if(m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))return mk(+m[1],+m[2],+m[3]);
  if(m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)){let y=+m[3];if(y<100)y+=2000;return mk(y,+m[2],+m[1])}
  if(m=s.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/)){const mo=MON[m[2]];if(mo)return mk(+m[3],mo,+m[1])}
  return null}
function pCell(s){s=String(s||"").trim();if(!s)return null;
  const parts=s.split(/\s+(?:-|–|—|s\.?\s?d\.?|s\/d|sampai|hingga)\s+/i);
  if(parts.length===2){const b=pDate(parts[1]);let a=pDate(parts[0]);
    if(!a&&b&&/^\d{1,2}$/.test(parts[0].trim())){const bd=pIso(b);a=mk(bd.getFullYear(),bd.getMonth()+1,+parts[0])}
    if(!a&&b){const m=parts[0].trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]+)$/);if(m&&MON[m[2]]){const bd=pIso(b);let y=bd.getFullYear();a=mk(y,MON[m[2]],+m[1]);if(a&&a>b)a=mk(y-1,MON[m[2]],+m[1])}}
    if(a&&b)return{a,b}}
  let m=s.toLowerCase().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/);
  if(m&&MON[m[3]]){const a=mk(+m[4],MON[m[3]],+m[1]),b=mk(+m[4],MON[m[3]],+m[2]);if(a&&b)return{a,b}}
  const one=pDate(s);return one?{a:one,b:one}:null}
function guessKind(t){if(/libur|cuti bersama|hari raya|idul|natal|nyepi|waisak|imlek|tahun baru/i.test(t))return"libur";if(/ujian|asesmen|\bats\b|\baas\b|\bpts\b|\bpas\b|\buts\b|\buas\b|rapor|raport|mpls|anbk|\bakm\b|\btka\b|remedial|kelulusan|ppdb|spmb/i.test(t))return"akademik";return"kegiatan"}
function parsePaste(txt){
  const out=[];for(const raw of txt.split(/\r?\n/)){if(!raw.trim())continue;
    let cols=raw.split("\t");if(cols.length===1)cols=raw.split(";");cols=cols.map(c=>c.trim());
    if(cols.length>2&&/^\d+\.?$/.test(cols[0]))cols.shift();
    const r=pCell(cols[0]);if(!r)continue;let rest=cols.slice(1);
    if(rest.length&&pCell(rest[0])){const r2=pCell(rest[0]);r.b=r2.b;rest=rest.slice(1)}
    rest=rest.filter(Boolean);if(!rest.length)continue;
    if(r.b<r.a)r.b=r.a;
    out.push({date:r.a,endDate:r.b,title:rest[0].slice(0,120),notes:rest.slice(1).join(" · ").slice(0,500),kind:guessKind(rest.join(" "))})}
  return out}

function openImport(){
  const unit=h("select",{id:"imp-unit"},...UNITS.map(u=>h("option",{value:u.k},u.k==="YYS"?"Yayasan / semua unit":u.name)));unit.value=S.myUnit||store.get("tb.unit")||"SD";
  const ta=h("textarea",{id:"imp-text",style:"min-height:150px;font-family:var(--mono);font-size:12px",placeholder:"14/07/2026\t\tHari pertama masuk sekolah (MPLS)\n14 - 16 Juli 2026\tMPLS\n21/09/2026\t25/09/2026\tAsesmen Tengah Semester"});
  const prev=h("div");const go=h("button",{class:"btn primary",type:"button",disabled:true},"Impor");const err=h("div",{class:"err"});
  let rows=[];
  function upd(){rows=parsePaste(ta.value);prev.replaceChildren();go.disabled=!rows.length;go.textContent=rows.length?`Impor ${rows.length} kegiatan`:"Impor";
    const lines=ta.value.split(/\r?\n/).filter(x=>x.trim()).length;
    if(!ta.value.trim())return;
    prev.append(h("div",{class:"hint",style:"margin-bottom:6px"},`${rows.length} dari ${lines} baris terbaca.${lines>rows.length?" Baris tanpa tanggal (mis. judul tabel) dilewati.":""}`),
      rows.length?h("div",{class:"prev-wrap"},h("table",{class:"prev"},h("thead",null,h("tr",null,h("th",null,"Tanggal"),h("th",null,"Kegiatan"),h("th",null,"Jenis"))),h("tbody",null,...rows.map(r=>h("tr",null,h("td",{class:"tnum",style:"white-space:nowrap"},r.endDate!==r.date?`${fmtShort(r.date)} – ${fmtShort(r.endDate)} ${r.endDate.slice(0,4)}`:`${fmtShort(r.date)} ${r.date.slice(0,4)}`),h("td",null,r.title),h("td",null,KINDS[r.kind])))))):null)}
  ta.addEventListener("input",upd);
  go.addEventListener("click",async()=>{go.disabled=true;err.textContent="";let n=0;
    try{const res=await api.importRows(rows,unit.value,k=>{n=k;go.textContent=`Mengimpor… ${n}/${rows.length}`});n=res;
      store.set("tb.unit",unit.value);closeSheet();toast(`${n} kegiatan ${UNIT_NAME[unit.value]} diimpor`);S.month=new Date(pIso(rows[0].date).getFullYear(),pIso(rows[0].date).getMonth(),1);render()}
    catch(e){err.textContent=`${n} tersimpan, sisanya gagal. ${errText(e)}`;go.disabled=false}});
  sheet(shead("Impor kalender pendidikan"),
    h("div",{class:"hint"},"Di Excel atau Google Sheets, blok kolom tanggal dan nama kegiatan, salin, lalu tempel di sini. Format tanggal yang dikenali: 14/07/2026, 2026-07-14, 14 Juli 2026, dan rentang seperti 14 - 18 Juli 2026. Kalau ada kolom tanggal selesai, letakkan tepat setelah tanggal mulai."),
    h("div",{class:"field"},h("label",{for:"imp-unit"},"Kalender unit"),unit),
    h("div",{class:"field"},h("label",{for:"imp-text"},"Tempel dari Excel"),ta),
    prev,err,h("div",{class:"sfoot"},go,h("button",{class:"btn",type:"button",onclick:closeSheet},"Batal")));
}

/* ---------- wiring ---------- */
document.querySelectorAll(".seg button").forEach(b=>b.addEventListener("click",()=>{S.view=b.dataset.view;S.onlyClash=false;store.set("tb.view",S.view);render()}));
$("#fac-filter").addEventListener("change",e=>{S.fac=e.target.value;render()});
$("#clash-pill").addEventListener("click",()=>{S.view="agenda";S.onlyClash=true;render()});
$("#btn-add").addEventListener("click",()=>openForm(null,{date:S.view==="fasilitas"?S.day:(S.month.getMonth()===new Date().getMonth()?TODAY:iso(S.month))}));
$("#btn-import").addEventListener("click",openImport);
$("#btn-fac").addEventListener("click",openFacilities);
render();


/* ---------- Supabase data layer ---------- */
const CFG=window.APP_CONFIG||{};
const fromRow=r=>({id:r.id,unit:r.unit,title:r.title,kind:r.kind,date:r.date,endDate:r.end_date,allDay:r.all_day,
  start:r.start_time?r.start_time.slice(0,5):null,end:r.end_time?r.end_time.slice(0,5):null,facilityId:r.facility_id,
  needs:r.needs||"",docs:!!r.docs,pic:r.pic||"",notes:r.notes||"",createdBy:r.created_by,createdByName:r.created_by_name||""});
const toRow=d=>({unit:d.unit,title:d.title,kind:d.kind,date:d.date,end_date:d.endDate||d.date,all_day:!!d.allDay,
  start_time:d.allDay?null:d.start,end_time:d.allDay?null:d.end,facility_id:d.facilityId||null,
  needs:d.needs||"",docs:!!d.docs,pic:d.pic||"",notes:d.notes||""});
function fail(error){
  if(error&&error.code==="23P01"){let c={};try{c=JSON.parse(error.details||"{}")}catch{}
    const e=new Error("clash");e.clashWith={unit:c.unit,title:c.title,date:c.date,allDay:c.all_day,start:c.start,end:c.end,pic:c.pic};throw e}
  throw error||new Error("unknown")}

const api={
  async loadFacilities(){const{data,error}=await S.sb.from("facilities").select("*").order("sort").order("created_at");if(error)fail(error);
    S.facilities=data.map(f=>({id:f.id,name:f.name,location:f.location||""}));S.loadedF=true},
  async loadEvents(){const out=[];for(let from=0;;from+=1000){
      const{data,error}=await S.sb.from("events").select("*").order("date",{ascending:false}).range(from,from+999);if(error)fail(error);
      out.push(...data);if(data.length<1000)break}
    S.events=out.map(fromRow);S.loadedE=true;if(S.events.length)S.demo=false},
  async reload(){await Promise.all([api.loadFacilities(),api.loadEvents()]);render();
    if(S._facDraw&&document.querySelector(".sheet .facitem"))S._facDraw()},
  async saveEvent(d,ev){
    const q=ev?S.sb.from("events").update(toRow(d)).eq("id",ev.id).select("id"):S.sb.from("events").insert(toRow(d)).select("id");
    const{data,error}=await q;if(error)fail(error);if(!data||!data.length)fail({code:"noperm"});await api.reload()},
  async deleteEvent(id){const{data,error}=await S.sb.from("events").delete().eq("id",id).select("id");if(error)fail(error);if(!data.length)fail({code:"noperm"});await api.reload()},
  async addFacility(f){const{error}=await S.sb.from("facilities").insert({name:f.name,location:f.location||"",sort:S.facilities.length+1});if(error)fail(error);await api.reload()},
  async updateFacility(id,f){const{error}=await S.sb.from("facilities").update(f).eq("id",id);if(error)fail(error);await api.reload()},
  async deleteFacility(id){const{error}=await S.sb.from("facilities").delete().eq("id",id);if(error)fail(error);await api.reload()},
  async importRows(rows,unit,progress){let n=0;
    for(let i=0;i<rows.length;i+=50){const chunk=rows.slice(i,i+50).map(r=>({...toRow({unit,title:r.title,kind:r.kind,date:r.date,endDate:r.endDate,allDay:true,notes:r.notes}),source:"impor"}));
      const{error}=await S.sb.from("events").insert(chunk);if(error){await api.reload();fail(error)}n+=chunk.length;progress&&progress(n)}
    await api.reload();return n}
};
S.db=api;

/* ---------- sign-in & boot ---------- */
function gate(msg,actions){$("#app").hidden=true;$("#gate").hidden=false;if(msg)$("#gate-msg").textContent=msg;
  if(actions)$("#gate-actions").replaceChildren(...actions)}
function loginBtn(label){return h("button",{class:"btn primary",type:"button",onclick:signIn},label||"Masuk dengan Google")}
async function signIn(){const opts={redirectTo:location.origin+location.pathname};
  if(CFG.GOOGLE_DOMAIN)opts.queryParams={hd:CFG.GOOGLE_DOMAIN,prompt:"select_account"};else opts.queryParams={prompt:"select_account"};
  const{error}=await S.sb.auth.signInWithOAuth({provider:"google",options:opts});if(error)gate("Gagal membuka login Google: "+error.message)}
async function signOut(){await S.sb.auth.signOut();location.reload()}

let booted=false,reloadT=null;
async function enter(session){
  if(booted)return;booted=true;
  const md=session.user.user_metadata||{};S.me=session.user.id;S.myName=md.full_name||md.name||session.user.email;
  const{data:prof,error}=await S.sb.rpc("my_profile");
  if(error){booted=false;gate("Tidak bisa memeriksa akses akun ("+(error.message||"error")+"). Coba muat ulang.",[loginBtn("Coba lagi")]);return}
  if(!prof||!prof.role){booted=false;
    const dom=prof&&prof.allowed_domain;
    gate(`Akun ${session.user.email} belum terdaftar.${dom?` Gunakan akun @${dom}, atau minta admin menambahkan email Anda.`:" Minta admin kalender menambahkan email Anda."}`,
      [h("button",{class:"btn primary",type:"button",onclick:async()=>{await S.sb.auth.signOut();signIn()}},"Ganti akun"),h("button",{class:"btn",type:"button",onclick:signOut},"Keluar")]);return}
  S.role=prof.role;S.myUnit=prof.unit||null;S.canAdmin=S.role==="admin";S.canWrite=S.role!=="viewer";S.readOnly=!S.canWrite;
  $("#gate").hidden=true;$("#app").hidden=false;
  $("#btn-user").replaceChildren(S.myName,h("span",{class:"role"},S.role==="admin"?"admin":S.role==="viewer"?"lihat":"editor"));
  $("#btn-user").title=`${session.user.email} · klik untuk keluar`;
  render();
  try{await api.reload()}catch(e){S.error=errText(e);render()}
  S.sb.channel("kalender").on("postgres_changes",{event:"*",schema:"public",table:"events"},queue)
    .on("postgres_changes",{event:"*",schema:"public",table:"facilities"},queue).subscribe();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)queue()});
}
function queue(){clearTimeout(reloadT);reloadT=setTimeout(()=>api.reload().catch(()=>{}),400)}

$("#btn-login").addEventListener("click",signIn);
$("#btn-user").addEventListener("click",()=>{const b=$("#btn-user");if(b.dataset.arm==="1")return signOut();b.dataset.arm="1";const old=[...b.childNodes];b.textContent="Klik lagi untuk keluar";setTimeout(()=>{b.dataset.arm="";b.replaceChildren(...old)},3000)});

(async()=>{
  if(!window.supabase||!CFG.SUPABASE_URL||/YOUR-/.test(CFG.SUPABASE_URL+CFG.SUPABASE_ANON_KEY)){
    gate("Aplikasi belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di config.js.",[]);return}
  S.sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const q=new URLSearchParams(location.search+"&"+location.hash.replace(/^#/,""));
  const urlErr=q.get("error_description")||q.get("error");
  const{data:{session},error:sErr}=await S.sb.auth.getSession();
  if(session)enter(session);
  else if(urlErr||sErr){const msg=(urlErr||sErr.message||"").replace(/\+/g," ");
    console.error("Login error:",msg,q.get("error_code")||"");
    history.replaceState(null,"",location.pathname);
    gate("Login gagal: "+msg+". Screenshot pesan ini dan kirim ke admin kalender.",[loginBtn("Coba lagi")]);}
  else gate();
  S.sb.auth.onAuthStateChange((ev,sess)=>{if(sess&&!booted)enter(sess);if(ev==="SIGNED_OUT"){booted=false;gate()}});
})();
