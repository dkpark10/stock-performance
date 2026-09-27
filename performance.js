/**
 * 추가납입이 있는 계좌의 투자 성과 계산 (외부 패키지 없음)
 *
 * CSV 컬럼:
 *   date             날짜 (YYYY-MM-DD)
 *   deposit          그날 입금액 (출금이면 음수, 마지막 행은 0)
 *   value_before     그날 입금 '직전' 평가금 (첫 행은 0, 마지막 행은 현재 평가금)
 *   benchmark_close  그날 벤치마크 지수(또는 ETF) 종가
 *
 * 사용법: node performance.js [csv경로]
 */
const fs = require('fs');

const DAY = 24 * 60 * 60 * 1000;

function load(path) {
  const [header, ...lines] = fs.readFileSync(path, 'utf-8').trim().split('\n');
  const keys = header.split(',');
  return lines.map((line) => {
    const r = Object.fromEntries(line.split(',').map((v, i) => [keys[i], v]));
    return {
      date: new Date(r.date),
      deposit: Number(r.deposit),
      valueBefore: Number(r.value_before),
      benchmarkClose: Number(r.benchmark_close),
    };
  });
}

/** flows: [{date, amount}]. 입금은 음수, 최종 평가금은 양수. 연환산 수익률. */
function xirr(flows) {
  const d0 = flows[0].date;
  const npv = (rate) =>
    flows.reduce((sum, { date, amount }) => sum + amount / (1 + rate) ** ((date - d0) / DAY / 365), 0);

  let lo = -0.99;
  let hi = 10;
  let mid;
  for (let i = 0; i < 200; i++) {
    // 이분법: npv는 rate에 대해 단조감소
    mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return mid;
}

/** 구간별 수익률을 곱해 이어붙인 시간가중수익률 (누적). */
function twr(rows) {
  let growth = 1;
  for (let i = 1; i < rows.length; i++) {
    const start = rows[i - 1].valueBefore + rows[i - 1].deposit;
    growth *= rows[i].valueBefore / start;
  }
  return growth - 1;
}

function investorFlows(rows, finalValue) {
  const flows = rows.filter((r) => r.deposit).map((r) => ({ date: r.date, amount: -r.deposit }));
  flows.push({ date: rows.at(-1).date, amount: finalValue });
  return flows;
}

/** 같은 날 같은 금액을 벤치마크에 넣었다면 지금 얼마인가. */
function benchmarkFinalValue(rows) {
  const units = rows.reduce((sum, r) => sum + r.deposit / r.benchmarkClose, 0);
  return units * rows.at(-1).benchmarkClose;
}

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const ymd = (d) => d.toISOString().slice(0, 10);

function main() {
  const rows = load(process.argv[2] ?? 'sample.csv');
  const first = rows[0];
  const last = rows.at(-1);

  const totalIn = rows.reduce((sum, r) => sum + r.deposit, 0);
  const final = last.valueBefore;
  const benchFinal = benchmarkFinalValue(rows);
  const years = (last.date - first.date) / DAY / 365;

  const myTwr = twr(rows);
  const benchTwr = last.benchmarkClose / first.benchmarkClose - 1;
  const annualize = (r) => (1 + r) ** (1 / years) - 1;

  console.log(`기간          ${ymd(first.date)} ~ ${ymd(last.date)} (${years.toFixed(2)}년)`);
  console.log(`총 납입       ${won(totalIn)}`);
  console.log(`현재 평가금   ${won(final)}`);
  console.log(`단순 수익률   ${pct(final / totalIn - 1)}   (참고용, 납입 타이밍 무시)`);
  console.log();
  console.table({
    'XIRR (연)': {
      '내 계좌': pct(xirr(investorFlows(rows, final))),
      벤치마크: pct(xirr(investorFlows(rows, benchFinal))),
    },
    'TWR (누적)': { '내 계좌': pct(myTwr), 벤치마크: pct(benchTwr) },
    'TWR (연환산)': { '내 계좌': pct(annualize(myTwr)), 벤치마크: pct(annualize(benchTwr)) },
  });
  const diff = final - benchFinal;
  console.log(`벤치마크에 똑같이 넣었다면 ${won(benchFinal)} → 차이 ${diff >= 0 ? '+' : ''}${won(diff)}`);
}

main();
