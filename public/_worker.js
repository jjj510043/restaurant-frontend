/** Cloudflare Pages advanced-mode Function. No Node.js APIs or dependencies. */
const DEFAULT_UPSTREAM='https://posserver-sigma.vercel.app';
const RESPONSE_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...RESPONSE_HEADERS,...extra}});
const validId=value=>/^[1-9]\d{0,8}$/.test(String(value??''));
const MAX_BODY=131072;
async function readOrder(request){
 const reader=request.body?.getReader();if(!reader)throw new Error('empty');
 const chunks=[];let length=0;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY){await reader.cancel();throw new RangeError('large');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
function cleanOrder(body){
 if(!body||!Array.isArray(body.items)||body.items.length<1||body.items.length>100)return null;
 const items=[];
 for(const line of body.items){
  if(!line||!validId(line.ITEM_ID)||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>99||typeof line.ITEM_PRICE!=='number'||!Number.isFinite(line.ITEM_PRICE)||line.ITEM_PRICE<0||line.ITEM_PRICE>99999999.99)return null;
  if(line.note!==undefined&&typeof line.note!=='string')return null;
  items.push({ITEM_ID:Number(line.ITEM_ID),quantity:line.quantity,ITEM_PRICE:Math.round(line.ITEM_PRICE*100)/100,note:(line.note||'').slice(0,200)});
 }
 if(body.note!==undefined&&typeof body.note!=='string')return null;
 return {items,note:(body.note||'手機自助點餐').slice(0,200)};
}
export function createHandler(fetcher=globalThis.fetch,timeoutMs=20000){
 return async function handle(request,env={}){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  const endpoint=url.pathname.slice(4);
  const readEndpoint=['/ITEM','/SEAT','/EVENT'].includes(endpoint)||/^\/ACTIVE_ORDERS_BY_SEAT\/[1-9]\d{0,8}$/.test(endpoint);
  const writeEndpoint=endpoint==='/PLACE_ORDER';
  if(!readEndpoint&&!writeEndpoint)return reply({error:'Unsupported API route'},404);
  const method=writeEndpoint?'POST':'GET';
  if(request.method!==method)return reply({error:'Method not allowed'},405,{Allow:method});
  if(writeEndpoint&&env.ORDER_WRITES_ENABLED==='false')return reply({error:'此環境暫停正式下單，請使用示範模式。'},403);
  const origin=request.headers.get('Origin');
  if(writeEndpoint&&origin&&origin!==url.origin)return reply({error:'請由本站頁面提交點單。'},403);
  let upstream;
  try{upstream=new URL(env.POS_API_BASE||DEFAULT_UPSTREAM);if(upstream.protocol!=='https:'||upstream.username||upstream.password||upstream.pathname!=='/'||upstream.search||upstream.hash)throw new Error();}
  catch{return reply({error:'點餐服務設定錯誤，請聯絡管理者。'},503);}
  upstream.pathname=endpoint;
  let payload;
  if(writeEndpoint){
   const seat=url.searchParams.get('SEAT_ID');
   if(!validId(seat))return reply({error:'請先設定有效桌號。'},400);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'請使用 JSON 提交點單。'},415);
   if(Number(request.headers.get('Content-Length'))>MAX_BODY)return reply({error:'點單內容過長。'},413);
   try{payload=cleanOrder(await readOrder(request));}catch(error){return reply({error:error instanceof RangeError?'點單內容過長。':'點單內容格式不正確。'},error instanceof RangeError?413:400);}
   if(!payload)return reply({error:'請確認商品、數量、價格與備註內容。'},400);
   upstream.searchParams.set('SEAT_ID',seat);
  }else if(endpoint==='/ITEM'&&url.searchParams.has('is_active')){
   const value=url.searchParams.get('is_active');if(!['0','1'].includes(value))return reply({error:'Invalid item filter'},400);upstream.searchParams.set('is_active',value);
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   // Writes are sent once only. Cookies, tokens and arbitrary URLs are not forwarded.
   const result=await fetcher(upstream.href,{method,headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:controller.signal,redirect:'error',cache:'no-store'});
   if(!result.ok){const status=result.status>=500?502:(result.status>=400&&result.status<500?result.status:502);return reply({error:status>=500?'點餐服務暫時無法回應，請先洽店員確認訂單結果。':'點餐要求未被接受，請確認內容或洽店員。'},status);}
   let data;try{data=await result.json();}catch{return reply({error:'點餐服務回應不完整，請洽店員確認。'},502);}
   if(writeEndpoint){if(!validId(data?.ORDER_ID)||Number(data.SEAT_ID)!==Number(url.searchParams.get('SEAT_ID')))return reply({error:'未取得完整訂單確認，請洽店員。'},502);return reply({ORDER_ID:data.ORDER_ID,SEAT_ID:data.SEAT_ID,message:'訂單已建立'},201);}
   if(!Array.isArray(data))return reply({error:'點餐資料格式不正確。'},502);
   return reply(data);
  }catch{return reply({error:'點餐服務連線中斷或逾時。若已送出點單，請先洽店員確認，避免重複。'},502);}
  finally{clearTimeout(timer);}
 };
}
export default {fetch:createHandler()};
