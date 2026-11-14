'use strict';

// Normal KC, FP8, dual hub, complete 128 x 128 blocks, no UScale.
// This enumerates addresses and accepted work; it is not a timing simulator.
const PEMemoryModel = (() => {
  const BLOCK = 128;
  const BLOCK_BYTES = 16384;
  const ROW_WORDS = 128;
  const scenarios = Object.freeze({
    main: Object.freeze({sourceC:4096, tileC:4096, logicalC:4096, co:512,
      label:'CI4096 · dense 全矩阵', scope:'完整 W[512,4096]', candidate:false}),
    wide: Object.freeze({sourceC:8192, tileC:8192, logicalC:8192, co:512,
      label:'CI8192 · dense 全矩阵', scope:'完整 W[512,8192]，教学形状对照', candidate:true}),
    narrow: Object.freeze({sourceC:8192, tileC:2048, logicalC:8192, co:512,
      label:'CI8192 · 只把计算 TC 缩为2048', scope:'dense W[512,8192] 的第一个 CI2048 计算子块', candidate:true}),
    blocked: Object.freeze({sourceC:2048, tileC:2048, logicalC:8192, co:512,
      label:'CI8192 · 物理拆成4个CI2048块', scope:'4个独立打包子块中的第一个 W_block[512,2048]', candidate:true})
  });

  function integer(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(label);
  }

  function config(input = {}) {
    const name = input.scenario === undefined ? 'main' : input.scenario;
    if (!Object.prototype.hasOwnProperty.call(scenarios, name)) throw new RangeError('Unknown scenario');
    const result = {...scenarios[name], scenario:name, w:4, mtc:8, mtk:2, base:0, ...input};
    // Source geometry is defined by the named scenario, never by UI overrides.
    Object.assign(result, scenarios[name]);
    integer(result.w, 1, 16, 'Invalid W length');
    integer(result.mtc, 1, 64, 'Invalid MTC length');
    integer(result.mtk, 1, 16, 'Invalid MTK length');
    integer(result.base, 0, 0x100000, 'Base is outside this low-address teaching domain');
    if (result.base % BLOCK_BYTES || result.w * result.mtc > 64 || result.w * result.mtk > 16) {
      throw new RangeError('Require 16 KiB base alignment, w*c <= 64 and w*k <= 16');
    }
    return result;
  }

  function mcAddress(word) {
    // splicing=1, bank-map=e4, low bank. The examples do not reach bank remapping.
    integer(word, 0, 32767, 'MC word is outside the supported low-bank domain');
    return {word, row:Math.floor(word / ROW_WORDS), column:word % ROW_WORDS, bytes:32};
  }

  function enumerate(input = {}) {
    const c = config(input);
    const sourceUnits = c.sourceC / BLOCK, cUnits = c.tileC / BLOCK, kUnits = c.co / BLOCK;
    const blocks = [];
    for (let kg = 0; kg < kUnits; kg += c.mtk) {
      for (let cg = 0; cg < cUnits; cg += c.mtc) {
        const actualC = Math.min(c.mtc, cUnits - cg), actualK = Math.min(c.mtk, kUnits - kg);
        for (let cb = cg; cb < cg + actualC; cb++) {
          for (let kb = kg; kb < kg + actualK; kb++) {
            const index = kb * sourceUnits + cb;
            const word = c.base / 8192 + 2 * index;
            blocks.push({ordinal:blocks.length, kb, cb, kg, cg, actualC, actualK,
              cLocal:cb-cg, kLocal:kb-kg, tile:Math.floor(kg/c.mtk)*Math.ceil(cUnits/c.mtc)+Math.floor(cg/c.mtc),
              index, byteAddress:c.base+index*BLOCK_BYTES, requests:[mcAddress(word), mcAddress(word+1)]});
          }
        }
      }
    }
    const rows = blocks.flatMap(block => block.requests.map(request => request.row));
    const rowSwitches = rows.reduce((n, row, i) => n + Number(i > 0 && row !== rows[i-1]), 0);
    return {config:c, blocks, sourceUnits, cUnits, kUnits, rowSwitches,
      blockCount:blocks.length, acceptedBeats:blocks.length*c.w,
      weightBytes:blocks.length*BLOCK_BYTES, macs:c.w*c.tileC*c.co,
      fullMatrixMacs:c.w*c.logicalC*c.co,
      kStrideBytes:c.sourceC*BLOCK, requestsPerMc:blocks.length*2};
  }

  function eventAt(sequence, acceptedIndex) {
    integer(acceptedIndex, 0, sequence.acceptedBeats-1, 'Accepted event index outside sequence');
    const {config:c} = sequence;
    const block = sequence.blocks[Math.floor(acceptedIndex/c.w)], wLocal = acceptedIndex%c.w;
    // Each PE stores W-major activation words; K reuses the same word.
    const al1Word = wLocal*block.actualC+block.cLocal;
    const ol1Slot = block.kLocal*c.w+wLocal;
    return {block, acceptedIndex, wLocal, al1Word, ol1Slot,
      al1Words:block.actualC*c.w, ol1Slots:block.actualK*c.w,
      newWeight:wLocal === 0, releaseWeight:wLocal === c.w-1,
      // Follow PE4 / ALU5 / group2, as in the chapter's CO37 example.
      group:2, pe:4, alu:5, hub:1, mc:6,
      outputColumn:block.kb*BLOCK+37,
      ciFirst:block.cb*BLOCK+64, ciLast:block.cb*BLOCK+79,
      partialTerms:(block.cb+1)*16,
      completesC:block.cb === sequence.cUnits-1,
      outputTileComplete:block.cb === sequence.cUnits-1 && block.kLocal === block.actualK-1 && wLocal === c.w-1,
      fullOutput:sequence.config.tileC === sequence.config.logicalC};
  }

  function creditWindow({credits=15, rtt=23, cycles=64} = {}) {
    integer(credits, 1, 32, 'Invalid credit count');
    integer(rtt, 1, 128, 'Invalid effective credit round trip');
    integer(cycles, 1, 4096, 'Invalid timeline length');
    const events=[];
    let inFlight=0;
    for(let cycle=0;cycle<cycles;cycle++) {
      // R includes the edge at which a returned credit can be reused.
      const returned=cycle>=rtt && events[cycle-rtt].issued;
      if(returned) inFlight--;
      const issued=inFlight<credits;
      if(issued) inFlight++;
      events.push({cycle, issued, returned:Boolean(returned), inFlight});
    }
    const rate=Math.min(1,credits/rtt);
    return {credits,rtt,events,rate,cyclesPerMiniblock:2/rate,bytesPerCycle:256*32*rate};
  }

  return Object.freeze({BLOCK, BLOCK_BYTES, scenarios, config, mcAddress, enumerate, eventAt, creditWindow});
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PEMemoryModel;
