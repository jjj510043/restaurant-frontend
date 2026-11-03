export const VERSION = '1.1.0';
export const MAX_QUANTITY = 99;
export function validSeat(value) {
  const str = String(value ?? '').trim();
  return /^[1-9]\d{0,8}$/.test(str) ? Number(str) : null;
}
export function cents(value) {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  return Math.round(Number(value) * 100);
}
export function active(value) { return value === 1 || value === true || value === '1' || value === 'true'; }
export function normalizeItems(data) {
  if (!Array.isArray(data)) throw new Error('商品資料格式不正確，請稍後重新載入。');
  const unique = new Map();
  for (const row of data) {
    const id = validSeat(row.ITEM_ID), price = cents(row.ITEM_PRICE);
    if (!id || price === null || !active(row.is_active) || !String(row.ITEM_NAME || '').trim()) continue;
    unique.set(id, {id, name:String(row.ITEM_NAME).trim(), price, type:String(row.Type || 'OTHER').toUpperCase(), description:String(row.Description || '').replace(/\{&lt;br\/&gt;\}|\{br\}|<br\s*\/?>/gi, '\n'), image:String(row.PICTURE_URL || '')});
  }
  return [...unique.values()];
}
export function groupItems(items) {
  const groups = new Map();
  for (const item of items) {
    const size = item.name.match(/(?:\(|（)?\s*(\d+(?:\.\d+)?)\s*ml\s*(?:\)|）)?/i);
    const spirit = item.type.startsWith('TASTING_') && item.type !== 'TASTING_MENU';
    const base = spirit && size ? item.name.replace(size[0], '').trim() : item.name;
    const key = spirit && size ? `${item.type}:${base}` : `item:${item.id}`;
    if (!groups.has(key)) groups.set(key, {...item, name:base, variants:[]});
    groups.get(key).variants.push({...item, size:size && spirit ? `${size[1]}ml` : ''});
  }
  return [...groups.values()].map(group => ({...group,variants:group.variants.sort((a,b)=>a.price-b.price)}));
}
export function sanitizeCart(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0,100).flatMap(row => {
    const id=validSeat(row.id), quantity=Number(row.quantity), price=Number(row.price);
    if (!id || !Number.isInteger(quantity) || quantity<1 || quantity>MAX_QUANTITY || !Number.isSafeInteger(price) || price<0) return [];
    return [{key:String(row.key || `${id}-${Math.random()}`),id,name:String(row.name || '').slice(0,200),price,quantity,note:String(row.note || '').slice(0,200)}];
  });
}
export function reconcileCart(cart, items) {
  const lookup = new Map(items.map(i=>[i.id,i]));
  let changed = false;
  const removed=[];
  const next=cart.flatMap(line=>{
    const item=lookup.get(line.id);
    if (!item) { changed=true; removed.push(line.name); return []; }
    if (line.price !== item.price || line.name !== item.name) changed=true;
    return [{...line,price:item.price,name:item.name}];
  });
  return {cart:next,changed,removed};
}
export function total(cart) { return cart.reduce((sum,line)=>sum+line.price*line.quantity,0); }
export function orderPayload(cart, note='') {
  if (!cart.length || sanitizeCart(cart).length !== cart.length) throw new Error('請確認購物車內容。');
  return {items:cart.map(line=>({ITEM_ID:line.id,quantity:line.quantity,ITEM_PRICE:line.price/100,note:line.note})),note:String(note).trim().slice(0,200) || '手機自助點餐'};
}
export class ApiError extends Error {
  constructor(message, options={}) { super(message); Object.assign(this,options); }
}
export async function requestJSON(path, {method='GET',body,fetcher=globalThis.fetch,base='/api',timeout=22000}={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetcher(`${base}${path}`,{method,signal:controller.signal,cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    let data;
    try { data=await response.json(); } catch { throw new ApiError('服務回應格式異常，請稍後再試。',{uncertain:method!=='GET'}); }
    if (!response.ok) throw new ApiError(response.status>=500?'點餐服務暫時忙碌，請洽店員確認。':'無法完成要求，請檢查桌號或洽店員。',{status:response.status,uncertain:method!=='GET'&&response.status>=500});
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.name==='AbortError'?'連線逾時，請檢查網路。':'連線失敗，請檢查網路或稍後再試。',{uncertain:method!=='GET'});
  } finally {clearTimeout(timer);}
}
export function imageURL(value) {
  const raw=String(value||'').trim();
  if (!raw) return '/assets/bottle.svg';
  if (/^\/?(?:img|images)\//i.test(raw) && !raw.includes('..')) return '/img/'+raw.replace(/^\/?(?:img|images)\//i,'');
  try {
    const url=new URL(raw);
    if(url.protocol!=='https:') return '/assets/bottle.svg';
    if(url.hostname==='posfront-psi.vercel.app' && url.pathname.startsWith('/img/')) return url.pathname;
    if(url.hostname==='drive.google.com') {
      const id=url.pathname.match(/\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
      return id&&/^[a-zA-Z0-9_-]+$/.test(id)?`https://lh3.googleusercontent.com/d/${id}`:'/assets/bottle.svg';
    }
    return url.href;
  } catch {return '/assets/bottle.svg';}
}
