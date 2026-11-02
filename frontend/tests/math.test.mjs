import test from 'node:test';
import assert from 'node:assert/strict';
import { apportion, apportionOpen, apportionWhole, monthlyBudget } from '../src/math.ts';

test('aumento de janeiro exige compensar em outros meses sem aumentar o anual',()=>{
  const values=Array(12).fill(1_000_000);
  values[0]=1_200_000;
  assert.deepEqual(monthlyBudget(12_000_000,values,100),{total:12_200_000,balance:-200_000,valid:false});
  values[1]=800_000;
  assert.deepEqual(monthlyBudget(12_000_000,values,100),{total:12_000_000,balance:0,valid:true});
  values[1]=700_000;
  assert.deepEqual(monthlyBudget(12_000_000,values,100),{total:11_900_000,balance:100_000,valid:true});
});

test('limite mensal conserva centavos e impede frações de unidade',()=>{
  assert.equal(monthlyBudget(.3,[.1,.2,...Array(10).fill(0)],100).valid,true);
  assert.equal(monthlyBudget(.3,[.1,.21,...Array(10).fill(0)],100).valid,false);
  assert.equal(monthlyBudget(12,[1.5,...Array(11).fill(0)],1).valid,false);
  assert.equal(monthlyBudget(0,[1,...Array(11).fill(0)],1).valid,false);
});

test('conserva centavos nos totais pequenos',()=>{
  for(const total of [0,1,2,3,7,13,100,101]){
    const values=apportion(total,[3333,3333,3334]);
    assert.equal(values.reduce((a,b)=>a+b,0),total);
    assert.ok(values.every(v=>Number.isInteger(v)&&v>=0));
  }
});
test('todos os restos são distribuídos uma única vez',()=>{
  assert.deepEqual(apportion(7,[1,1,1,1,1,1,1,1,1,1,1,1]),[1,1,1,1,1,1,1,0,0,0,0,0]);
});
test('pesos de 12 meses fecham em 100%',()=>{
  const values=apportion(10000,Array(12).fill(1));
  assert.equal(values.reduce((a,b)=>a+b),10000);
  assert.equal(values.filter(v=>v===834).length,4);
});
test('valores grandes mantêm precisão na multiplicação',()=>{
  const total=8_999_999_999_999_999;
  const values=apportion(total,[3333,3333,3334]);
  assert.equal(values.reduce((a,b)=>a+b),total);
  assert.equal(BigInt(values[0])+BigInt(values[1])+BigInt(values[2]),BigInt(total));
});
test('carteiras com peso zero não recebem valores',()=>{
  assert.deepEqual(apportion(101,[0,2000,0,8000,0]),[0,20,0,81,0]);
  assert.deepEqual(apportion(101,[0,0]),[0,0]);
});
test('rejeita valores incompatíveis com a precisão de entrada',()=>{
  assert.throws(()=>apportion(1.5,[100]));
  assert.throws(()=>apportion(100,[-1]));
  assert.throws(()=>apportion(100,[NaN]));
});

test('total negativo é distribuído pelo valor absoluto e conserva o total',()=>{
  assert.deepEqual(apportion(-7,Array(12).fill(1)),[-1,-1,-1,-1,-1,-1,-1,0,0,0,0,0]);
  assert.deepEqual(apportion(-101,[0,2000,0,8000,0]),[0,-20,0,-81,0]);
  assert.equal(apportion(-1,[100])[0],-1);
});

test('orçamento mensal com meta negativa limita pelo módulo e aceita meses negativos',()=>{
  const months=Array(12).fill(-10);
  assert.deepEqual({...monthlyBudget(-120,months,1000)},{total:-120,balance:0,valid:true});
  assert.equal(monthlyBudget(-120,[-11,...Array(11).fill(-10)],1000).valid,false);
  assert.equal(monthlyBudget(-120,[-9,...Array(11).fill(-10)],1000).balance,1);
  assert.equal(monthlyBudget(120,[-5,...Array(11).fill(10)],1000).balance,15);
  assert.equal(monthlyBudget(100,[0.0005,...Array(11).fill(0)],1000).valid,false);
});

test('fechamento reserva janeiro e março e distribui o saldo apenas nos abertos',()=>{
  const original=[101,20,203,0,0,0,0,0,0,0,0,0];
  const result=apportionOpen(1001,Array(12).fill(1),original,new Set([1,3]));
  assert.equal(result[0],101);
  assert.equal(result[2],203);
  assert.equal(result.reduce((a,b)=>a+b),1001);
  assert.equal(result[1],70);
  assert.equal(result[11],69);
});

test('total anual negativo pode deixar saldo negativo nos meses abertos',()=>{
  const original=[10,...Array(11).fill(0)];
  const result=apportionOpen(-20,Array(12).fill(1),original,new Set([1]));
  assert.equal(result[0],10);
  assert.equal(result.reduce((a,b)=>a+b),-20);
  assert.ok(result.slice(1).every(v=>v<0));
});

test('prévia rejeita total abaixo do fechado, pesos abertos zerados e ano fechado',()=>{
  const original=[101,...Array(11).fill(0)];
  assert.equal(apportionOpen(100,Array(12).fill(1),original,new Set([1])),null);
  assert.equal(apportionOpen(102,[1,...Array(11).fill(0)],original,new Set([1])),null);
  assert.equal(apportionOpen(101,Array(12).fill(1),original,new Set(Array.from({length:12},(_,i)=>i+1))),null);
  assert.deepEqual(apportionOpen(101,[1,...Array(11).fill(0)],original,new Set([1])),original);
});

test('divisão em reais cheios: meses inteiros, soma igual ao total e sobra do real no último mês aberto',()=>{
  const none=Array(12).fill(0), equal=Array(12).fill(1);
  const eight=apportionOpen(8_000_000_000,equal,none,new Set(),1000);
  assert.deepEqual(eight,[...Array(8).fill(666_667_000),...Array(4).fill(666_666_000)]);
  const decimals=apportionOpen(150_600,equal,none,new Set(),1000);
  assert.equal(decimals.reduce((a,b)=>a+b),150_600);
  assert.ok(decimals.slice(0,11).every(v=>v%1000===0));
  assert.equal(decimals[11]%1000,600);
  const closed=apportionOpen(9_000_000_000,equal,[1_000_500,...Array(11).fill(0)],new Set([1]),1000);
  assert.equal(closed[0],1_000_500);
  assert.equal(closed.reduce((a,b)=>a+b),9_000_000_000);
  assert.ok(closed.slice(1,11).every(v=>v%1000===0));
  assert.equal(closed[11]%1000,500);
  assert.deepEqual(apportionOpen(500,equal,none,new Set(),1000)?.reduce((a,b)=>a+b),500);
  assert.equal(apportionOpen(5000,equal,none,new Set()).every(v=>v===416||v===417),true);
  const negative=apportionOpen(-8_000_000_000,equal,none,new Set(),1000);
  assert.equal(negative.reduce((a,b)=>a+b),-8_000_000_000);
  assert.ok(negative.every(v=>v%1000===0&&v<0));
});

test('carteiras em reais cheios: soma igual ao mês, sobra do real no maior peso e mesmo resultado da API',()=>{
  const weights=[1500,1800,2200,2000,2500];
  const month=apportionWhole(666_667_000,weights,1000);
  assert.deepEqual(month,[100_000_000,120_000_000,146_667_000,133_333_000,166_667_000]);
  assert.equal(month.reduce((a,b)=>a+b),666_667_000);
  assert.ok(month.every(v=>v%1000===0));
  const decimals=apportionWhole(12_600,weights,1000);
  assert.equal(decimals.reduce((a,b)=>a+b),12_600);
  assert.equal(decimals[4]%1000,600);
  assert.ok(decimals.slice(0,4).every(v=>v%1000===0));
  assert.deepEqual(apportionWhole(-8_000,[1,1],1000),[-4000,-4000]);
  assert.deepEqual(apportionWhole(5,[1,1],1),apportion(5,[1,1]));
  assert.deepEqual(apportionWhole(900,[0,0],1000),[0,0]);
});
