const {Equipment}=require('./equipment.js'),assert=require('node:assert/strict');
const storageData=new Map();
const storage={getItem:k=>storageData.get(k)||null,setItem:(k,v)=>{storageData.set(k,v);}};
const e=new Equipment({storage,key:'test',backpackInFrontRows:[0,2,4,6],weaponAfterShieldRows:[1,3,5,7]});
const add=(id,slot,hp)=>e.addItem({id,name:id,slot,folder:slot,stats:{hp}});
add('a','torse',10);add('b','torse',20);add('c','cape',3);add('w','weapon',5);add('o','offhand',7);
e.equip('a');e.equip('b');
assert.deepEqual(e.snapshot().inventory.map(i=>i.id).sort(),['a','c','o','w']);
assert.equal(e.snapshot().equipped.chest.id,'b');
assert.equal(e.getStats().hp,20);
e.unequip('torse');
assert.equal(e.snapshot().equipped.chest,undefined);
e.equip('a');e.equip('c');e.equip('w');e.equip('o');
assert.equal(e.getStats().hp,25);
assert.throws(()=>add('a','torse',1));
for(let r=0;r<8;r++){
  const slots=e.getLayers(r).map(l=>l.slot);
  if([0,2,4,6].includes(r))assert.deepEqual(slots,['body','chest','weapon','offhand','backpack']);
  else assert.deepEqual(slots,['backpack','body','chest','offhand','weapon']);
}
assert.equal(e.save().ok,true);
const e2=new Equipment({storage,key:'test',backpackInFrontRows:[0,2,4,6],weaponAfterShieldRows:[1,3,5,7]});
assert.equal(e2.load().ok,true);
assert.deepEqual(e2.snapshot(),e.snapshot());
storageData.set('test','{bad');
const snap=e.snapshot();
assert.equal(e.load().ok,false);
assert.deepEqual(e.snapshot(),snap);
assert.equal(e.save().ok,false);
const badStorage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
const e3=new Equipment({storage:badStorage,key:'x'});
assert.equal(e3.save().ok,false);
const e4=new Equipment({storage:null,key:'x'});
assert.equal(e4.save().ok,false);
console.log('Node smoke tests passed: swap/stats/aliases/8rows/storage/corruption/quota');



const mutators=[c=>c.equipped.unknown={},c=>c.inventory.push(c.equipped.chest),c=>c.equipped.chest.slot='head',c=>c.equipped.chest.stats.hp=null];for(const m of mutators){const c=JSON.parse(JSON.stringify(snap));m(c);storageData.set('test',JSON.stringify(c));assert.equal(e.load().ok,false,'load should fail');assert.deepEqual(e.snapshot(),snap,'state mutated');}for(const value of [NaN,Infinity,-Infinity]) assert.throws(()=>e.addItem({id:'invalid',name:'Invalid',slot:'gloves',folder:'Gloves',stats:{hp:value}}));console.log('schema tests passed');
