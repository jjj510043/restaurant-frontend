import {VERSION,MAX_QUANTITY,validSeat,normalizeItems,groupItems,sanitizeCart,reconcileCart,total,orderPayload,requestJSON,imageURL,ApiError} from './core.mjs';
const $=id=>document.getElementById(id);
const cfg={brand:"TENDER'S BAR",subtitle:'長庚大學飲料調製研究社',apiBase:'/api',allowSeatSelection:false,seatTTLHours:12,catalogCacheMinutes:15,historyRefreshSeconds:30,...window.POS_CONFIG};
const demo=new URLSearchParams(location.search).get('demo')==='1';
const prefix=`tenders.front.v1.${demo?'demo':'live'}.`;
let storageAvailable=true;
const disk={get(key,fallback=null){try{const raw=localStorage.getItem(prefix+key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem(prefix+key,JSON.stringify(value));return true;}catch{storageAvailable=false;return false;}},remove(key){try{localStorage.removeItem(prefix+key);}catch{storageAvailable=false;}}};
const params=new URLSearchParams(location.search),remembered=disk.get('seat');
const fromURL=params.has('SEAT_ID');
const candidate=fromURL?validSeat(params.get('SEAT_ID')):(remembered&&Number(remembered.expires)>Date.now()?validSeat(remembered.id):null);
// An invalid explicit URL never falls back to a previously remembered table.
if(fromURL&&!candidate) disk.remove('seat');
const state={items:[],seats:[],seat:null,candidate,category:'ALL',query:'',cart:[],note:'',catalogReady:false,cached:false,busy:false,posting:false,historyBusy:false,pending:null,attemptKey:null,seatError:'',catalogError:'',loadVersion:0};
let toastTimer,historyTimer,request;
if(demo){const mod=await import('./demo.mjs');request=mod.demoRequest;$('demo-banner').hidden=false;}else{request=(path,options={})=>requestJSON(path,{base:cfg.apiBase,...options});}
const labels={ALL:'全部酒單',SIGNATURE:'原創特調',CLASSIC:'經典調酒',SPARKLING:'氣泡系列',SHOTS:'一口酒',GATHERING_DRINKS:'聚會飲品',TASTING_MENU:'品味組合',TASTING_GIN:'琴酒',TASTING_WHISKEY:'威士忌',TASTING_RUM:'蘭姆酒',TASTING_VODKA:'伏特加',TASTING_TEQUILA:'龍舌蘭',TASTING_BRANDY:'白蘭地',TASTING_OTHER:'其他品飲',OTHER:'其他飲品'};
const enLabels={SIGNATURE:'SIGNATURE',CLASSIC:'THE CLASSICS',SPARKLING:'SPARKLING',SHOTS:'SHOTS',TASTING_GIN:'GIN SELECTION',TASTING_WHISKEY:'WHISKEY SELECTION'};
const money=value=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:value%100?2:0}).format(value/100).replace(/^\$/,'NT$');
const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
function button(text,className,handler){const node=el('button',className,text);node.type='button';node.addEventListener('click',handler);return node;}
function draftKey(){return `draft.${state.candidate||'unassigned'}`;}
function pendingKey(){return `pending.${state.candidate||'unassigned'}`;}
function restoreDraft(){const saved=disk.get(draftKey(),{});const draft=saved&&typeof saved==='object'?saved:{};state.cart=sanitizeCart(draft.cart);state.note=String(draft.note||'').slice(0,200);state.pending=disk.get(pendingKey());$('order-note').value=state.note;}
function saveDraft(){disk.set(draftKey(),{cart:state.cart,note:state.note,savedAt:Date.now()});}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
function notice(message,action){const node=$('notice');node.replaceChildren(document.createTextNode(message));node.hidden=!message;if(action)node.append(button(action.label,'',action.run));}
function feedback(message){const node=$('cart-feedback');node.textContent=message;node.hidden=!message;}
function openDialog(id){const node=$(id);if(!node.open)node.showModal();if(id==='history-dialog'){clearInterval(historyTimer);historyTimer=setInterval(()=>{if(!document.hidden&&node.open)loadHistory();},Math.max(15,cfg.historyRefreshSeconds)*1000);}}
function closeDialog(id){$(id).close();}
for(const node of document.querySelectorAll('[data-close]'))node.addEventListener('click',()=>{if(!state.posting)closeDialog(node.dataset.close);});
for(const node of document.querySelectorAll('dialog')){
 node.addEventListener('cancel',event=>{if(state.posting)event.preventDefault();});
 node.addEventListener('click',event=>{if(event.target===node&&!state.posting){const rect=node.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)node.close();}});
}
$('brand-name').textContent=cfg.brand;$('brand-subtitle').textContent=cfg.subtitle;document.title=`${cfg.brand}｜桌邊點餐`;
$('brand-name').closest('a').href=demo?'/?demo=1':'/';
restoreDraft();
function normalSeats(data){if(!Array.isArray(data))throw new Error('桌位資料格式不正確。');return data.flatMap(row=>{const id=validSeat(row.SEAT_ID);return id?[{id,name:String(row.SEAT_NAME||`桌號 ${id}`)}]:[];});}
function setVerifiedSeat(){state.seat=state.seats.find(s=>s.id===state.candidate)||null;if(state.seat){disk.set('seat',{id:state.seat.id,expires:Date.now()+cfg.seatTTLHours*3600000});state.seatError='';}else if(state.candidate&&!state.seatError){state.seatError='找不到這個桌號，請重新掃描桌上 QR Code 或洽店員。';}renderSeat();}
function renderSeat(){
 $('seat-label').textContent=state.seat?state.seat.name:'尚未設定桌號';
 $('cart-seat').textContent=state.seat?`本次送至：${state.seat.name}`:'請先掃描桌上 QR Code 設定桌號，才能送出點單。';
 $('seat-explanation').textContent=state.seat?`目前點餐桌位為「${state.seat.name}」。若與所在桌位不符，請重新掃描該桌 QR Code。`:(state.seatError||'請掃描桌上的 QR Code 進入酒單。你仍可瀏覽與選購，設定桌號後即可送出。');
 const options=$('seat-options');options.replaceChildren();
 if(cfg.allowSeatSelection||demo){const select=el('select');select.id='seat-select';select.setAttribute('aria-label','選擇點餐桌位');const first=el('option','', '請選擇桌號');first.value='';select.append(first);for(const seat of state.seats){const opt=el('option','',seat.name);opt.value=String(seat.id);select.append(opt);}select.value=state.seat?String(state.seat.id):'';options.append(select,button('使用此桌號','primary-button',()=>chooseSeat(validSeat(select.value))));}
 $('forget-seat').hidden=!state.candidate;
 renderCartBadge();
}
function chooseSeat(id){
 if(!state.seats.some(seat=>seat.id===id)){toast('請先選擇有效桌號。');return;}
 if(id===state.candidate){closeDialog('seat-dialog');return;}
 if(state.posting||state.pending){toast('目前有待確認的訂單，請先與店員確認。');return;}
 if(state.cart.length&&!confirm('切換桌號會切換到該桌的購物車，目前選購內容會保留在原桌。確定切換？'))return;
 saveDraft();state.candidate=id;state.seatError='';restoreDraft();setVerifiedSeat();renderCart();const url=new URL(location.href);url.searchParams.set('SEAT_ID',id);history.replaceState({},'',url);closeDialog('seat-dialog');toast(`已切換至 ${state.seat.name}`);
}
$('seat-button').addEventListener('click',()=>{renderSeat();openDialog('seat-dialog');});
$('forget-seat').addEventListener('click',()=>{
 if(state.pending||state.posting){toast('請先處理待確認的訂單，再清除桌號。');return;}
 if(!confirm('清除桌號後需重新掃碼才能下單。原桌的購物車仍會保留。是否清除？'))return;
 saveDraft();disk.remove('seat');state.candidate=null;state.seat=null;state.seatError='';restoreDraft();const url=new URL(location.href);url.searchParams.delete('SEAT_ID');history.replaceState({},'',url);renderSeat();renderCart();
});
$('retry-seat').addEventListener('click',async()=>{const btn=$('retry-seat');btn.disabled=true;try{state.seats=normalSeats(await request('/SEAT'));state.seatError='';setVerifiedSeat();}catch(error){state.seat=null;state.seatError=error.message;renderSeat();}finally{btn.disabled=false;}});
function renderCategories(){const types=[...new Set(state.items.map(i=>i.type))];types.sort((a,b)=>{const list=Object.keys(labels);const ai=list.indexOf(a),bi=list.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b);});if(state.category!=='ALL'&&!types.includes(state.category))state.category='ALL';$('categories').replaceChildren(...['ALL',...types].map(type=>{const node=button(labels[type]||type,`category${state.category===type?' active':''}`,()=>{state.category=type;renderCategories();renderCatalog();});node.setAttribute('aria-pressed',String(state.category===type));return node;}));}
function renderCatalog(){
 const target=$('catalog');target.replaceChildren();
 if(!state.catalogReady){const box=el('div','empty');box.append(el('h3','',state.catalogError?'暫時無法讀取酒單':'正在準備你的酒單'),el('p','',state.catalogError||'請稍候片刻。'));if(state.catalogError)box.append(button('重新載入','primary-button',()=>loadData()));else box.prepend(el('span','spinner'));target.append(box);$('result-count').textContent=state.catalogError?'酒單尚未載入':'正在準備酒單…';return;}
 const q=state.query.trim().toLocaleLowerCase();
 const groups=groupItems(state.items.filter(item=>(state.category==='ALL'||item.type===state.category)&&(!q||`${item.name} ${item.description} ${labels[item.type]||item.type}`.toLocaleLowerCase().includes(q))));
 $('result-count').textContent=`${groups.length} 款飲品${state.cached?' · 暫存酒單':''}`;
 if(!groups.length){const box=el('div','empty');box.append(el('h3','',q?'沒有找到符合的飲品':'目前沒有上架飲品'),el('p','',q?'試試不同酒名、風味，或切換其他分類。':'請稍後更新酒單，或直接詢問店員。'));if(q)box.append(button('清除搜尋','primary-button',()=>{state.query='';$('search').value='';renderCatalog();}));target.append(box);return;}
 for(const group of groups){
  const card=el('article','product'),top=el('div','product-top');top.append(el('span','product-type',enLabels[group.type]||labels[group.type]||group.type));const abv=group.description.match(/abv[:：\s]*(\d+(?:\.\d+)?)\s*%/i);if(abv)top.append(el('span','abv',`${abv[1]}% ABV`));
  const body=el('div','product-body'),info=el('div','product-info');
  if(group.image){const image=el('img','product-image');image.src=imageURL(group.image);image.alt=group.name;image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>{image.src='/assets/bottle.svg';},{once:true});body.append(image);}
  const title=el('h3','',group.name),description=el('p','product-description',group.description.replace(/abv[:：\s]*\d+(?:\.\d+)?\s*%/i,'').trim());info.append(title,description);if(description.textContent.length>70)info.append(button('展開介紹','description-toggle',event=>{const expanded=description.classList.toggle('expanded');event.currentTarget.textContent=expanded?'收合介紹':'展開介紹';}));body.append(info);
  const bottom=el('div','product-bottom');
  for(const variant of group.variants){const add=button('','add-button',()=>addItem(variant));const price=el('span');if(variant.size)price.append(el('span','size',variant.size));price.append(document.createTextNode(money(variant.price)));add.append(price,el('span','plus','+'));add.setAttribute('aria-label',`加入 ${variant.name}，${money(variant.price)}`);bottom.append(add);}
  card.append(top,body,bottom);target.append(card);
 }
}
function applyLegacyRoute(){if(location.pathname==='/classic')state.category='CLASSIC';if(location.pathname==='/special')state.category='SIGNATURE';const match=location.pathname.match(/^\/spirits\/([^/]+)/);if(match)state.category=decodeURIComponent(match[1]).toUpperCase();}
function renderEvent(rows){
 const node=$('event');node.replaceChildren();node.hidden=true;if(!Array.isArray(rows))return;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
 const events=rows.filter(row=>{const start=String(row.EVENT_START_DATE||'').slice(0,10),end=String(row.EVENT_END_DATE||'').slice(0,10);return row.EVENT_CONTANT&&(!/^\d{4}-\d{2}-\d{2}$/.test(start)||start<=today)&&(!/^\d{4}-\d{2}-\d{2}$/.test(end)||end>=today);}).sort((a,b)=>String(b.EVENT_START_DATE||'').localeCompare(String(a.EVENT_START_DATE||''))||Number(b.EVENT_ID)-Number(a.EVENT_ID));
 if(events.length){node.hidden=false;const event=events[0],copy=el('div');copy.append(el('p','',event.EVENT_CONTANT));if(event.EVENT_NOTE)copy.append(el('small','',event.EVENT_NOTE));node.append(el('span','event-label','WHAT’S ON · 本期活動'),copy);}
}
async function loadData(){
 const version=++state.loadVersion;state.busy=true;$('refresh-button').disabled=true;
 const results=await Promise.allSettled([request('/ITEM?is_active=1').then(normalizeItems),request('/SEAT').then(normalSeats),request('/EVENT')]);
 if(version!==state.loadVersion)return;
 const [catalog,seats,events]=results;
 if(catalog.status==='fulfilled'){state.items=catalog.value;state.catalogReady=true;state.cached=false;state.catalogError='';disk.set('catalog',{items:state.items,at:Date.now()});}
 else{state.catalogError=catalog.reason.message;const cached=disk.get('catalog');if(cached&&Date.now()-cached.at<cfg.catalogCacheMinutes*60000&&Array.isArray(cached.items)){state.items=cached.items;state.catalogReady=true;state.cached=true;}else{state.catalogReady=false;state.items=[];}}
 if(seats.status==='fulfilled'){state.seats=seats.value;state.seatError='';}else{state.seats=[];state.seat=null;state.seatError='桌位確認失敗，請檢查網路並重新確認。';}
 setVerifiedSeat();if(events.status==='fulfilled')renderEvent(events.value);
 renderCategories();renderCatalog();renderCart();
 if(catalog.status==='rejected')notice(state.cached?'目前顯示暫存酒單；送出前會再次確認最新價格與供應狀態。':'目前無法連接點餐服務，請重新載入或洽店員。',{label:'重試',run:()=>loadData()});else notice('');
 if(!storageAvailable)notice('瀏覽器未允許保存資料，關閉或重新整理頁面可能遺失購物車。');
 state.busy=false;$('refresh-button').disabled=false;
}
$('search').addEventListener('input',event=>{state.query=event.target.value;renderCatalog();});$('refresh-button').addEventListener('click',()=>loadData());
document.addEventListener('keydown',event=>{if(event.key==='/'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('search').focus();}});
function addItem(item){
 if(state.posting||state.pending){toast('請先確認上一筆點單結果。');return;}
 let line=state.cart.find(line=>line.id===item.id&&!line.note);
 if(line){if(line.quantity>=MAX_QUANTITY){toast('單項最多 99 份，其他需求請洽店員。');return;}line.quantity++;}
 else{if(state.cart.length>=100){toast('本次品項已達上限，請分次點單。');return;}state.cart.push({key:uid(),id:item.id,name:item.name,price:item.price,quantity:1,note:''});}
 saveDraft();renderCartBadge();const badge=$('cart-toggle');badge.classList.remove('pulse');void badge.offsetWidth;badge.classList.add('pulse');toast(`已加入 ${item.name}`);
}
function renderCartBadge(){const count=state.cart.reduce((sum,line)=>sum+line.quantity,0);$('cart-count').textContent=count;$('cart-total').textContent=money(total(state.cart));$('drawer-total').textContent=money(total(state.cart));$('checkout').disabled=state.posting||!state.cart.length;$('checkout').textContent=state.pending?'先確認上一筆點單結果':state.seat?'確認品項，下一步 →':'請先設定桌號 →';}
function editable(){if(state.posting||state.pending){toast('請先確認上一筆點單結果。');return false;}return true;}
function renderPending(){
 const box=$('cart-feedback');box.replaceChildren();
 if(!state.pending){box.hidden=true;return;}
 box.hidden=false;box.append(el('strong','','上一筆點單結果待確認'),el('p','','送出時未取得明確結果，系統已暫停再次下單。請查看本桌已點品項，並請店員確認，避免重複製作。'));
 box.append(button('查看已點品項','primary-button',openHistory),button('店員已確認未成立，解除暫停','plain-button',()=>{
  if(!confirm('請先請店員確認上一筆訂單「沒有成立」。僅因清單暫時沒有顯示，不能保證未成立。確定已確認未成立？'))return;
  disk.remove(pendingKey());state.pending=null;renderCart();toast('已解除暫停，請重新確認後下單。');
 }));
}
function renderCart(){
 const target=$('cart-lines');target.replaceChildren();$('order-note').value=state.note;
 if(!state.cart.length){const empty=el('div','empty');empty.append(el('h3','','還沒選到心儀的那杯？'),el('p','','把喜歡的飲品加入點單，再一起送出。'));target.append(empty);}
 for(const line of state.cart){
  const row=el('div','cart-line'),top=el('div','line-top');top.append(el('h3','line-name',line.name),el('span','line-price',money(line.price*line.quantity)));
  const actions=el('div','line-actions'),quantity=el('div','quantity');
  const change=delta=>{if(!editable())return;const next=line.quantity+delta;if(next<1)return;if(next>MAX_QUANTITY){toast('單項最多 99 份。');return;}line.quantity=next;saveDraft();renderCart();};
  const minus=button('−','',()=>change(-1));minus.setAttribute('aria-label',`減少 ${line.name}`);minus.disabled=line.quantity<=1||!!state.pending||state.posting;
  const plus=button('+','',()=>change(1));plus.setAttribute('aria-label',`增加 ${line.name}`);plus.disabled=!!state.pending||state.posting;
  quantity.append(minus,el('span','',line.quantity),plus);
  const right=el('div');right.append(button('另列需求','split-line',()=>{if(!editable())return;if(state.cart.length>=100){toast('本次最多 100 列。');return;}if(line.quantity>1)line.quantity--;state.cart.push({...line,key:uid(),quantity:1,note:''});saveDraft();renderCart();toast('已另列一項，可分別填寫備註。');}),button('移除','remove-line',()=>{if(!editable())return;state.cart=state.cart.filter(x=>x.key!==line.key);saveDraft();renderCart();}));actions.append(quantity,right);
  const input=el('input','line-note');input.placeholder='這杯的需求，例如：少冰、不要糖';input.value=line.note;input.maxLength=200;input.disabled=!!state.pending||state.posting;input.setAttribute('aria-label',`${line.name} 的備註`);input.addEventListener('input',()=>{line.note=input.value;saveDraft();});
  row.append(top,actions,input);target.append(row);
 }
 $('order-note').disabled=!!state.pending||state.posting;renderSeat();renderPending();renderCartBadge();
}
$('order-note').addEventListener('input',event=>{if(!editable())return;state.note=event.target.value;saveDraft();});
$('cart-toggle').addEventListener('click',()=>{renderCart();openDialog('cart-dialog');});
$('clear-cart').addEventListener('click',()=>{if(!editable()||!state.cart.length)return;if(confirm('確定清空尚未送出的本次點單？')){state.cart=[];state.note='';saveDraft();renderCart();}});
function pendingFromOtherTab(){const pending=disk.get(pendingKey());if(pending){state.pending=pending;renderCart();return true;}return false;}
async function checkout(){
 if(state.busy||state.posting)return;
 if(state.pending||pendingFromOtherTab()){renderPending();return;}
 if(!state.seat){renderSeat();openDialog('seat-dialog');return;}
 if(!state.cart.length)return;
 const btn=$('checkout');btn.disabled=true;btn.textContent='正在確認價格與桌號…';state.busy=true;feedback('');
 try{
  const [items,seats]=await Promise.all([request('/ITEM?is_active=1').then(normalizeItems),request('/SEAT').then(normalSeats)]);
  state.items=items;state.seats=seats;state.cached=false;setVerifiedSeat();
  if(!state.seat)throw new Error('桌號已失效，請重新掃碼或洽店員。');
  const result=reconcileCart(state.cart,items);state.cart=result.cart;saveDraft();renderCategories();renderCatalog();renderCart();
  if(result.changed){feedback(result.removed.length?`部分品項已下架，已從點單移除：${result.removed.join('、')}。請重新確認內容及總額。`:'商品價格或名稱有更新，已更新你的點單。請再次確認總額後繼續。');return;}
  renderConfirmation();openDialog('confirm-dialog');
 }catch(error){feedback(error.message||'無法確認最新酒單，請稍候再試。');}
 finally{state.busy=false;renderCartBadge();}
}
$('checkout').addEventListener('click',checkout);
function renderConfirmation(){
 const target=$('confirm-content');target.replaceChildren(el('div','confirm-seat',`${state.seat.name}${demo?' · 示範點單':''}`));
 const list=el('ul','confirm-list');for(const line of state.cart){const li=el('li'),name=el('span','',`${line.name} × ${line.quantity}`);if(line.note)name.append(el('small','',line.note));li.append(name,el('span','',money(line.price*line.quantity)));list.append(li);}target.append(list);
 if(state.note)target.append(el('p','muted',`整單備註：${state.note}`));target.append(el('div','confirm-total',`合計 ${money(total(state.cart))}`),el('p','muted','送出後請稍候，請勿重複點擊或重新整理頁面。'));
 $('confirm-error').hidden=true;$('submit-order').disabled=false;$('submit-order').textContent=demo?'模擬下單（不建立正式訂單）':'確認下單';
}
async function sendOrder(){
 if(state.posting||!state.seat||!state.cart.length)return;
 state.posting=true;$('submit-order').disabled=true;$('submit-order').textContent='正在送出…';$('confirm-error').hidden=true;
 const perform=async lock=>{
  if(lock===null){throw new ApiError('另一個視窗正在送出點單，請稍候。');}
  if(state.pending||pendingFromOtherTab())throw new ApiError('有一筆點單正在等待確認，請先洽店員。');
  const seatId=state.seat.id;
  const attempt={id:uid(),seatId,at:Date.now(),items:structuredClone(state.cart),note:state.note};
  state.pending=attempt;disk.set(pendingKey(),attempt);
  let result;
  try{result=await request(`/PLACE_ORDER?SEAT_ID=${seatId}`,{method:'POST',body:orderPayload(state.cart,state.note)});}
  catch(error){if(!error.uncertain){disk.remove(pendingKey());state.pending=null;}throw error;}
  if(!validSeat(result?.ORDER_ID)||Number(result.SEAT_ID)!==seatId)throw new ApiError('未取得完整的訂單確認資料。',{uncertain:true});
  disk.remove(pendingKey());state.pending=null;state.cart=[];state.note='';saveDraft();
  closeDialog('confirm-dialog');closeDialog('cart-dialog');
  $('success-title').textContent=demo?'示範點單已完成':'點單已送出';$('success-content').textContent=`${state.seat.name} · 單號 #${result.ORDER_ID}\n${demo?'這是操作示範，沒有建立正式訂單。':'我們已收到你的選擇，請稍候店員確認與製作。'}`;openDialog('success-dialog');renderCart();
 };
 try{if(navigator.locks?.request)await navigator.locks.request(prefix+'submit',{ifAvailable:true},perform);else await perform({});}
 catch(error){const node=$('confirm-error');node.hidden=false;node.textContent=error.uncertain?'尚未取得明確結果，訂單可能已成立。已暫停重送，請關閉此視窗後查看已點品項，並請店員確認。':error.message;if(state.pending)renderPending();}
 finally{state.posting=false;$('submit-order').disabled=!!state.pending;$('submit-order').textContent=state.pending?'結果待確認，請洽店員':'確認下單';renderCartBadge();}
}
$('submit-order').addEventListener('click',sendOrder);
function formatTime(value){const text=String(value||'');const date=new Date(text);return Number.isNaN(date.getTime())?text:new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);}
async function openHistory(){if(!state.seat){renderSeat();openDialog('seat-dialog');return;}openDialog('history-dialog');await loadHistory();}
async function loadHistory(){
 if(state.historyBusy||!state.seat||!$('history-dialog').open)return;
 state.historyBusy=true;$('refresh-history').disabled=true;const target=$('history-content');target.replaceChildren(el('p','muted','正在讀取本桌已點品項…'));const seatId=state.seat.id;
 try{const rows=await request(`/ACTIVE_ORDERS_BY_SEAT/${seatId}`);if(!Array.isArray(rows))throw new Error('訂單回應格式異常，請洽店員。');if(state.seat?.id!==seatId)return;
  target.replaceChildren();if(!rows.length){target.append(el('div','empty','本桌目前沒有尚未結帳的品項。'));if(state.pending)target.append(el('p','muted','上一筆點單結果仍待確認，請由店員核對後再操作。'));return;}
  const groups=new Map();for(const row of rows){const key=String(row.ORDER_ID);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  for(const [id,lines] of groups){const box=el('section','history-order'),heading=el('h3','',`單號 #${id}`);heading.append(el('small','',formatTime(lines[0].ORDER_DATE)));const list=el('ul','confirm-list');for(const line of lines){const li=el('li'),name=el('span','',`${line.ITEM_NAME} × ${line.QUANTITY}`);if(line.ITEM_NOTE)name.append(el('small','',line.ITEM_NOTE));li.append(name);list.append(li);}box.append(heading,list);target.append(box);}
 }catch(error){target.replaceChildren(el('div','feedback',error.message));}
 finally{state.historyBusy=false;$('refresh-history').disabled=false;}
}
$('history-button').addEventListener('click',openHistory);$('refresh-history').addEventListener('click',loadHistory);$('success-history').addEventListener('click',()=>{closeDialog('success-dialog');openHistory();});
$('history-dialog').addEventListener('close',()=>clearInterval(historyTimer));
window.addEventListener('storage',event=>{if(event.key===prefix+pendingKey()){state.pending=disk.get(pendingKey());renderPending();renderCartBadge();}if(event.key===prefix+draftKey()&&!state.posting&&!$('confirm-dialog').open){restoreDraft();renderCart();}});
window.addEventListener('offline',()=>notice('目前沒有網路連線。已選內容保留在此瀏覽器，恢復連線後再送出。'));window.addEventListener('online',()=>loadData());
window.addEventListener('beforeunload',event=>{if(state.posting){event.preventDefault();event.returnValue='';}});
applyLegacyRoute();renderSeat();renderCartBadge();loadData();
