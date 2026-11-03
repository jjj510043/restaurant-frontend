// Only imported for the explicitly requested ?demo=1 mode. No network writes.
const items=[
 [1,'Gin & Tonic',180,'CLASSIC','琴酒、通寧水、柑橘\n清爽 · 草本 · 微苦','img/kinobi.png'],
 [2,'Old Fashioned',220,'CLASSIC','威士忌、方糖、苦精\n木質 · 濃郁 · 經典','img/BalvenieDoubleWood.png'],
 [3,'柚見月光',200,'SIGNATURE','琴酒、柚子、烏龍茶\n清新柚香，輕柔茶韻。','img/kinotea.png'],
 [4,'春日花園',200,'SIGNATURE','琴酒、接骨木花、檸檬\n花香與柑橘的溫柔平衡。','img/sakurao.png'],
 [5,'Sparkling Citrus',160,'SPARKLING','柑橘、氣泡、琴酒\n明亮酸甜，輕盈開場。',''],
 [6,'KI NO BI (15ml)',120,'TASTING_GIN','abv:45.7%\n京都乾琴酒，柚子、山椒與綠茶。','img/kinobi.png'],
 [7,'KI NO BI (30ml)',220,'TASTING_GIN','abv:45.7%\n京都乾琴酒，柚子、山椒與綠茶。','img/kinobi.png'],
 [8,'Balvenie Double Wood 30ml',240,'TASTING_WHISKEY','abv:40%\n蜂蜜、香草與柔和的橡木尾韻。','img/BalvenieDoubleWood.png'],
 [9,'青檸氣泡',100,'OTHER','無酒精 · 青檸 · 氣泡水\n清爽不負擔。','']
].map(([ITEM_ID,ITEM_NAME,ITEM_PRICE,Type,Description,PICTURE_URL])=>({ITEM_ID,ITEM_NAME,ITEM_PRICE,Type,Description,PICTURE_URL,is_active:1}));
let sequence=1000; const history=[];
export async function demoRequest(path,options={}) {
 await new Promise(r=>setTimeout(r,180));
 if(path.startsWith('/ITEM')) return structuredClone(items);
 if(path==='/SEAT') return [{SEAT_ID:1,SEAT_NAME:'示範 A1'},{SEAT_ID:2,SEAT_NAME:'示範 A2'}];
 if(path==='/EVENT') return [{EVENT_ID:1,EVENT_START_DATE:'2026-01-01',EVENT_END_DATE:'2099-12-31',EVENT_CONTANT:'今晚的好心情，從一杯開始。',EVENT_NOTE:'這是示範資料，不會連接正式點餐服務。'}];
 if(path.startsWith('/PLACE_ORDER')) {
  const seatId=Number(new URLSearchParams(path.split('?')[1]).get('SEAT_ID'));
  const orderId=++sequence;
  for(const line of options.body.items) history.push({ORDER_ID:orderId,SEAT_ID:seatId,ORDER_DATE:new Date().toISOString(),ITEM_NAME:items.find(i=>i.ITEM_ID===line.ITEM_ID)?.ITEM_NAME,QUANTITY:line.quantity,PRICE_AT_SALE:line.ITEM_PRICE,ITEM_NOTE:line.note});
  return {ORDER_ID:orderId,SEAT_ID:seatId};
 }
 if(path.startsWith('/ACTIVE_ORDERS_BY_SEAT/')) return structuredClone(history.filter(o=>o.SEAT_ID===Number(path.split('/').pop())));
 throw new Error('不支援的示範操作。');
}
