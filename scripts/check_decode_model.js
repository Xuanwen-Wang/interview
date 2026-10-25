'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Evaluate the browser file without a DOM: accounting must not need rendering.
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../web/decode-explorer.js'),'utf8'),context);
const model=vm.runInContext('DecodeDataflowModel',context);
const plain=value=>JSON.parse(JSON.stringify(value));

// Independent integer oracle: explicit K and V allocations, then per-head dots.
function attentionOracle(batch,tokens,kvHeads) {
  let cache=0,write=0,flops=0;
  for(let request=0;request<batch;request++) {
    for(let head=0;head<kvHeads;head++) {
      cache+=tokens*256; // K: 128 BF16 elements per position.
      cache+=tokens*256; // V has a separate allocation.
      write+=256+256;
    }
    for(let q=0;q<32;q++) flops+=tokens*(256+256); // QK and PV, two FLOPs per dimension.
  }
  return {cache,write,flops};
}
for(const batch of [1,4,16,32])for(const tokens of [1024,4096,8192,32768]) {
  const result=model.attention({batch,context:tokens});
  for(const s of result.scenarios) {
    const expected=attentionOracle(batch,tokens,s.kvHeads);
    assert.equal(s.cacheBytes,expected.cache);
    assert.equal(s.logicalScanBytes,expected.cache);
    assert.equal(s.newKvBytes,expected.write);
    assert.equal(s.allLayersCacheBytes,expected.cache*36);
    assert.equal(s.allLayersNewKvBytes,expected.write*36);
    assert.equal(s.qkPvFlops,expected.flops);
    assert.deepEqual(plain(s.queryShape),[batch,32,1,128]);
    assert.deepEqual(plain(s.kvShape),[batch,s.kvHeads,tokens,128]);
    assert.equal(s.queriesPerKv*s.kvHeads,32);
  }
  const [mha,gqa,mqa]=result.scenarios;
  assert.equal(mha.cacheBytes,4*gqa.cacheBytes);
  assert.equal(mha.newKvBytes,4*gqa.newKvBytes);
  assert.equal(gqa.cacheBytes,8*mqa.cacheBytes);
  assert.equal(mha.qkPvFlops,gqa.qkPvFlops);
  assert.equal(gqa.qkPvFlops,mqa.qkPvFlops);
  assert.equal(result.blocks*result.blockSize,tokens);
}
const base=model.attention({batch:1,context:1024}).scenarios[1];
const longer=model.attention({batch:1,context:4096}).scenarios[1];
const wider=model.attention({batch:4,context:1024}).scenarios[1];
assert.equal(longer.cacheBytes,base.cacheBytes*4);
assert.equal(longer.qkPvFlops,base.qkPvFlops*4);
assert.equal(longer.newKvBytes,base.newKvBytes);
assert.equal(wider.cacheBytes,base.cacheBytes*4);
assert.equal(wider.newKvBytes,base.newKvBytes*4);
assert.equal(wider.qkPvFlops,base.qkPvFlops*4);
const defaultGqa=model.attention().scenarios[1];
assert.equal(defaultGqa.cacheBytes,16*1048576);
assert.equal(defaultGqa.allLayersCacheBytes,576*1048576);
assert.equal(defaultGqa.newKvBytes,4096);
assert.equal(defaultGqa.qkPvFlops,67108864);

// Reconstruct each matrix by rows, independently of the model formula.
let gateElements=0,upElements=0,downElements=0;
for(let row=0;row<4096;row++){gateElements+=12288;upElements+=12288;}
for(let row=0;row<12288;row++)downElements+=4096;
const matrixElements=gateElements+upElements+downElements;
for(const batch of [1,4,16,32]) {
  const f=model.ffn({batch});
  assert.equal(f.weightBytes,301989888);
  assert.equal(f.weightBytes,matrixElements*2);
  assert.equal(f.matrixBytes,96*1048576);
  assert.equal(f.matmulFlops,matrixElements*2*batch);
  assert.equal(f.weightBytesPerToken*batch,f.weightBytes);
  assert.deepEqual(plain(f.inputShape),[batch,4096]);
  assert.deepEqual(plain(f.middleShape),[batch,12288]);
  assert.deepEqual(plain(f.gateShape),[4096,12288]);
  assert.deepEqual(plain(f.downShape),[12288,4096]);
  assert.equal(f.inputBytes,batch*8192);
  assert.equal(f.middleBytes,batch*24576);
  assert.equal(f.outputBytes,f.inputBytes);
}
assert.equal(model.ffn({batch:32}).weightBytes,model.ffn({batch:1}).weightBytes);
assert.equal(model.ffn({batch:32}).matmulFlops,32*model.ffn({batch:1}).matmulFlops);
assert.equal(model.ffn().matmulFlops,301989888);
for(const batch of [0,-1,2,1.5,Infinity,NaN,'4',null]) {
  assert.throws(()=>model.attention({batch}),{name:'RangeError'});
  assert.throws(()=>model.ffn({batch}),{name:'RangeError'});
}
for(const tokens of [0,-1,8191,1.5,Infinity,NaN,'8192',null])assert.throws(()=>model.attention({context:tokens}),{name:'RangeError'});
assert.throws(()=>model.attention(null),{name:'TypeError'});
assert.throws(()=>model.ffn(null),{name:'TypeError'});
console.log('Decode model: all B/N combinations, independent integer byte/FLOP oracle, GQA sharing, batch/context scaling, FFN weights and invalid inputs passed. Logical accounting only; no device performance prediction.');
