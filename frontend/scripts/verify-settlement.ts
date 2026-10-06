import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { db } from '../src/utils/db'
import {
  batchSettleMonth,
  currentMonth,
  evaluateRunsGroup,
  loadBundle,
  reconcileSettlement,
  refreshStaleSettlements,
  syncTasksForPeriod,
} from '../src/utils/settlementEngine'
import type { SheetRun } from '../src/types/sheet-run'

let pass = 0
const ok = (name: string, cond: boolean) => {
  assert.equal(cond, true, name)
  pass += 1
  console.log(`  ✓ ${name}`)
}

async function resetDb() {
  await db.delete()
  await db.open()
}

async function main() {
  await resetDb()
  const period = currentMonth()

  // ---------- 1. 批量结案：当前月 3 张帘全部合格 ----------
  const result = await batchSettleMonth(period)
  ok(`批量结案封存 ${result.settled} 组（期望 3）`, result.settled === 3)
  ok(`跳过 ${result.skipped.length} 组（期望 0）`, result.skipped.length === 0)

  const tasks = await db.settlementTasks.where('period').equals(period).toArray()
  ok('本月生成 3 个批组任务', tasks.length === 3)
  ok('所有任务均 done', tasks.every((task) => task.status === 'done'))

  let settlements = await db.settlements.where('period').equals(period).toArray()
  ok('生成 3 张结算单', settlements.length === 3)
  ok('结算单初始状态均为 sealed', settlements.every((s) => s.status === 'sealed'))

  const dl01 = settlements.find((s) => s.mouldNo === 'DL-01')!
  ok('DL-01 封存 2 槽工序', dl01.runSnapshots.length === 2)
  ok('DL-01 封存 2 份样本', dl01.sampleSnapshots.length === 2)
  ok('DL-01 封存 2 个料批', dl01.batchSnapshots.length === 2)
  ok('DL-01 封存帘纹标准 1.10 mm', dl01.mouldSnapshot.stripeGap === 1.1)
  const run1 = dl01.runSnapshots.find((r) => r.runNo === 'CB-260701')!
  ok('封存偏差按当时标准算出 -0.02', run1.deviation === -0.02 && run1.standardGap === 1.1)

  // ---------- 2. 改纸帘帘纹标准 -> 关联结算失效 ----------
  await db.moulds.update(1, { stripeGap: 1.18, rev: 2 })
  const invalidated = await refreshStaleSettlements()
  ok('复查发现 1 张结算单失效', invalidated === 1)
  settlements = await db.settlements.where('period').equals(period).toArray()
  const stale = settlements.find((s) => s.mouldNo === 'DL-01')!
  ok('DL-01 进入待对账', stale.status === 'stale')
  ok('失效原因指向帘纹标准', stale.invalidReason?.includes('帘纹标准') === true)
  ok('封存标准仍是 1.10 mm（未被改写）', stale.mouldSnapshot.stripeGap === 1.1)
  const run1Sealed = stale.runSnapshots.find((r) => r.runNo === 'CB-260701')!
  ok('封存偏差仍是 -0.02（原值保留）', run1Sealed.deviation === -0.02)

  // ---------- 3. 重新对账：当前标准 1.18，偏差全部变化 -> 失败，原结算保留 ----------
  const failed = await reconcileSettlement(stale.id!)
  ok('对账未通过', failed.ok === false)
  ok('完成率 < 100', failed.report.completionRate < 100)
  ok('报告包含 4 类核对项', failed.report.items.some((i) => i.category === '帘纹标准'))
  ok('报告含偏差核对项', failed.report.items.filter((i) => i.category === '偏差').length === 2)
  ok('报告含打浆度核对项', failed.report.items.filter((i) => i.category === '打浆度').length === 2)
  ok('报告含样本结果核对项', failed.report.items.filter((i) => i.category === '样本结果').length === 2)
  const afterFail = await db.settlements.get(stale.id!)
  ok('对账失败后仍为待对账', afterFail.status === 'stale')
  ok('对账失败后封存值照旧（1.10）', afterFail.mouldSnapshot.stripeGap === 1.1)
  ok('重试次数 +1', afterFail.reconciliationCount === 1)
  ok('失败报告已落库', afterFail.lastReport?.ok === false)

  // ---------- 4. 把标准改回 1.10 后重试对账 -> 通过，按当前版本重新结案 ----------
  await db.moulds.update(1, { stripeGap: 1.1, rev: 3 })
  const retried = await reconcileSettlement(stale.id!)
  ok('回改后对账通过', retried.ok === true)
  ok('通过时完成率 100%', retried.report.completionRate === 100)
  const afterOk = await db.settlements.get(stale.id!)
  ok('状态转为 reconciled', afterOk.status === 'reconciled')
  ok('失效原因清除', afterOk.invalidReason === null)
  ok('指纹更新到 rev=3', afterOk.fingerprints.moulds['1'] === 3)
  ok('封存快照更新为当前标准 1.1', afterOk.mouldSnapshot.stripeGap === 1.1)
  ok('重试次数 +1（=2）', afterOk.reconciliationCount === 2)

  // ---------- 5. 改打浆度 / 实测间距 / 样本结果分别可致失效 ----------
  await db.fiberBatches.update(2, { beatingDegree: 40, rev: 2 })
  await refreshStaleSettlements()
  const batchStale = await db.settlements.where({ period, mouldId: 2 }).first()!
  ok('打浆度变化使 DL-02 待对账', batchStale.status === 'stale')

  await db.sheetRuns.update(3, { measuredGap: 1.09, deviation: 0.09, rev: 2 })
  await refreshStaleSettlements()
  const runStale = await db.settlements.where({ period, mouldId: 3 }).first()!
  ok('实测间距变化使 DL-03 待对账', runStale.status === 'stale')

  await db.paperSamples.update(1, { stripeCount: 47, rev: 2 })
  const n = await refreshStaleSettlements()
  ok('样本结果变化也触发失效（本次复查 >=1）', n >= 1)

  // ---------- 6. 校验：样本未齐不能结案 ----------
  let bundle = await loadBundle()
  const runsWithoutSample = Array.from(bundle.runs.values()).filter((r) => r.runNo === 'CB-260707')
  const check1 = evaluateRunsGroup(runsWithoutSample, bundle)
  ok('无样本批组校验失败', check1.ok === false)
  ok('失败原因说明样本未齐', check1.reason?.includes('样本未齐') === true)

  // ---------- 7. 校验：混入不同纸帘不能结案 ----------
  const mixed = Array.from(bundle.runs.values()).filter((r) => ['CB-260707', 'CB-260708'].includes(r.runNo))
  const check2 = evaluateRunsGroup(mixed, bundle)
  ok('混帘批组校验失败', check2.ok === false)
  ok('失败原因说明混入不同纸帘', check2.reason?.includes('混入不同纸帘') === true)

  // ---------- 8. 批量处理上月：DL-02/DL-03 可结案，DL-04/DL-05 无样本被跳过 ----------
  const run8 = await db.sheetRuns.get(8)
  const lastPeriod = run8!.runDate.slice(0, 7)
  const lastResult = await batchSettleMonth(lastPeriod)
  ok(`上月结案 ${lastResult.settled} 组（期望 2）`, lastResult.settled === 2)
  ok(`上月跳过 ${lastResult.skipped.length} 组（期望 2）`, lastResult.skipped.length === 2)
  ok('跳过的是 DL-04 与 DL-05', lastResult.skipped.map((item) => item.mouldNo).sort().join(',') === ['DL-04', 'DL-05'].sort().join(','))
  const lastTasks = await db.settlementTasks.where('period').equals(lastPeriod).toArray()
  ok('跳过任务持久化为 skipped', lastTasks.filter((t) => t.status === 'skipped').length === 2)
  ok('跳过原因已持久化', lastTasks.filter((t) => t.status === 'skipped').every((t) => (t.lastReason ?? '').includes('样本未齐')))

  // 给 DL-04 / DL-05 工序补齐样本后重试该月批量：只处理之前跳过的组
  await db.paperSamples.add({ sampleNo: 'YZ-07', runId: 7, sizeMm: 210, stripeCount: 40, evenness: '均匀', archiveBin: '丁柜-02', schemaRev: 2, rev: 1 } as never)
  await db.paperSamples.add({ sampleNo: 'YZ-08', runId: 8, sizeMm: 210, stripeCount: 44, evenness: '均匀', archiveBin: '丁柜-03', schemaRev: 2, rev: 1 } as never)
  const retryResult = await batchSettleMonth(lastPeriod)
  ok(`补齐样本后重试结案 ${retryResult.settled} 组（期望 2）`, retryResult.settled === 2)
  ok('补齐后无跳过', retryResult.skipped.length === 0)
  const lastSettlements = await db.settlements.where('period').equals(lastPeriod).toArray()
  ok('上月累计 4 张结算单', lastSettlements.length === 4)

  // ---------- 9. 重开页面模拟：任务状态仍在 ----------
  const reopenedTasks = await syncTasksForPeriod(lastPeriod)
  ok('重开后上月 4 个批组任务均保持 done', reopenedTasks.length === 4 && reopenedTasks.every((t) => t.status === 'done'))

  // ---------- 10. 幂等：重复批量不重复建单 ----------
  const again = await batchSettleMonth(period)
  ok('重复批量当月新增结案 0（幂等）', again.settled === 0)
  const countAgain = await db.settlements.where('period').equals(period).count()
  ok('结算单总数仍为 3', countAgain === 3)

  // ---------- 11. 结案后补登新槽：无样本先跳过，补样本后续封 ----------
  const mould1 = await db.moulds.get(1)
  await db.sheetRuns.add({
    runNo: 'CB-260709', mouldId: 1, batchId: 1, runDate: `${period}-28`, operator: '罗青禾',
    stripeDirection: '竖帘纹', dipCount: 2, stackHeight: 40, dryMethod: '火墙',
    grammage: 33, measuredGap: 1.12, deviation: 0.02, schemaRev: 2, rev: 1,
  } as unknown as SheetRun)
  const newRunId = (await db.sheetRuns.where('runNo').equals('CB-260709').first())!.id!
  const partial = await batchSettleMonth(period)
  ok('新槽无样本：当月结案 0', partial.settled === 0)
  ok('新槽无样本：DL-01 批组被跳过并说明原因', partial.skipped.some((item) => item.mouldNo === 'DL-01' && (item.reason.includes('样本未齐') || item.reason.includes('未纳入'))))
  const taskDl01 = await db.settlementTasks.where('taskKey').equals(`${period}|1`).first()
  ok('DL-01 任务状态为 skipped（原有结算仍保留）', taskDl01!.status === 'skipped')
  const sealedCountBefore = await db.settlements.where({ period, mouldId: 1 }).count()
  ok('DL-01 原结算单仍在（未被破坏）', sealedCountBefore === 1)

  await db.paperSamples.add({ sampleNo: 'YZ-09', runId: newRunId, sizeMm: 200, stripeCount: 45, evenness: '均匀', archiveBin: '甲柜-12', schemaRev: 2, rev: 1 } as never)
  const continued = await batchSettleMonth(period)
  ok('补齐新槽样本后续封结案 1 组', continued.settled === 1 && continued.skipped.length === 0)
  const sealedCountAfter = await db.settlements.where({ period, mouldId: 1 }).count()
  ok('DL-01 新增一张补封结算单（共 2 张）', sealedCountAfter === 2)
  const taskDl01After = await db.settlementTasks.where('taskKey').equals(`${period}|1`).first()
  ok('DL-01 任务恢复 done', taskDl01After!.status === 'done')

  console.log(`\n全部 ${pass} 项断言通过`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
