import { useEffect, useMemo, useState, type InputHTMLAttributes } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { StatBadge } from '../components/common/StatBadge'
import { useFiberStore } from '../stores/fiberStore'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import { useSampleStore } from '../stores/sampleStore'
import { useSettlementStore } from '../stores/settlementStore'
import {
  SETTLEMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  type ReconcileCategory,
  type ReconcileReport,
  type Settlement,
  type SettlementStatus,
  type SettlementTask,
} from '../types/settlement'
import { evaluateRunsGroup, monthKey } from '../utils/settlementEngine'
import { isGapOutOfTolerance } from '../utils/stripe'

const STATUS_COLOR: Record<SettlementStatus, 'success' | 'warning' | 'info'> = {
  sealed: 'success',
  stale: 'warning',
  reconciled: 'info',
}

const CATEGORY_COLOR: Record<ReconcileCategory, string> = {
  帘纹标准: '#426044',
  打浆度: '#2f5d62',
  偏差: '#8a5a17',
  样本结果: '#6d4a78',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16)
}

export default function SettlementBoard() {
  const {
    settlements,
    tasks,
    isLoading,
    error,
    lastBatchResult,
    init,
    syncPeriod,
    runBatch,
    reconcile,
    settleRuns,
  } = useSettlementStore()
  const moulds = useMouldStore((state) => state.moulds)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const batches = useFiberStore((state) => state.fiberBatches)
  const loadBatches = useFiberStore((state) => state.loadFiberBatches)
  const runs = useRunStore((state) => state.sheetRuns)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const samples = useSampleStore((state) => state.paperSamples)
  const loadSamples = useSampleStore((state) => state.loadSamples)

  const [period, setPeriod] = useState(monthKey(new Date().toISOString()))
  const [selectedRunIds, setSelectedRunIds] = useState<number[]>([])
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void init()
    void loadMoulds()
    void loadBatches()
    void loadRuns()
    void loadSamples()
  }, [init, loadBatches, loadMoulds, loadRuns, loadSamples])

  const mouldById = useMemo(() => new Map(moulds.filter((mould) => mould.id !== undefined).map((mould) => [mould.id as number, mould])), [moulds])
  const batchById = useMemo(() => new Map(batches.filter((batch) => batch.id !== undefined).map((batch) => [batch.id as number, batch])), [batches])
  const runById = useMemo(() => new Map(runs.filter((run) => run.id !== undefined).map((run) => [run.id as number, run])), [runs])
  const samplesByRun = useMemo(() => {
    const map = new Map<number, typeof samples>()
    samples.forEach((sample) => {
      const list = map.get(sample.runId) ?? []
      list.push(sample)
      map.set(sample.runId, list)
    })
    return map
  }, [samples])

  const monthRuns = useMemo(() => runs.filter((run) => monthKey(run.runDate) === period), [period, runs])
  const monthSettlements = useMemo(() => settlements.filter((settlement) => settlement.period === period), [period, settlements])
  const monthTasks = useMemo(() => tasks.filter((task) => task.period === period).sort((a, b) => a.mouldId - b.mouldId), [period, tasks])

  const staleCount = settlements.filter((settlement) => settlement.status === 'stale').length
  const monthDone = monthTasks.filter((task) => task.status === 'done').length
  const monthSkipped = monthTasks.filter((task) => task.status === 'skipped').length
  const monthPending = monthTasks.filter((task) => task.status === 'pending').length

  const selectableRuns = useMemo(
    () => monthRuns.slice().sort((a, b) => a.mouldId - b.mouldId || a.runDate.localeCompare(b.runDate) || a.runNo.localeCompare(b.runNo)),
    [monthRuns],
  )
  const selectedMouldIds = useMemo(
    () => Array.from(new Set(selectedRunIds.map((id) => runById.get(id)?.mouldId).filter((id): id is number => id !== undefined))),
    [runById, selectedRunIds],
  )
  const mixedSelection = selectedMouldIds.length > 1

  const manualCheck = useMemo(() => {
    const selected = selectedRunIds.map((id) => runById.get(id)).filter((run): run is NonNullable<typeof run> => Boolean(run))
    if (selected.length === 0) return null
    return evaluateRunsGroup(selected, { moulds: mouldById, batches: batchById, runs: runById, samples, samplesByRun })
  }, [batchById, mouldById, runById, samples, samplesByRun, selectedRunIds])

  const toggleRun = (runId: number) => {
    setSelectedRunIds((current) => (current.includes(runId) ? current.filter((id) => id !== runId) : [...current, runId]))
    setActionMessage(null)
  }

  const toggleMouldGroup = (mouldId: number) => {
    const groupIds = selectableRuns.filter((run) => run.mouldId === mouldId).map((run) => run.id as number)
    const allSelected = groupIds.every((id) => selectedRunIds.includes(id))
    setSelectedRunIds((current) =>
      allSelected
        ? current.filter((id) => !groupIds.includes(id))
        : Array.from(new Set([...current, ...groupIds])),
    )
    setActionMessage(null)
  }

  const handleBatch = async () => {
    setBusy(true)
    setActionMessage(null)
    const result = await runBatch(period)
    setBusy(false)
    if (result.skipped.length > 0) {
      setActionMessage(`批量处理完成：结案 ${result.settled} 组，跳过 ${result.skipped.length} 组（${result.skipped.map((item) => item.mouldNo).join('、')}），原因见下方批组任务`)
    } else {
      setActionMessage(`批量处理完成：本月 ${result.settled} 组全部封存结案`)
    }
  }

  const handleSync = async () => {
    setBusy(true)
    await syncPeriod(period)
    setBusy(false)
    setActionMessage('已按当前工序重新整理本月批组，跳过原因保留，可继续处理')
  }

  const handleManualSettle = async () => {
    if (!manualCheck?.ok || mixedSelection) return
    setBusy(true)
    const ok = await settleRuns(selectedRunIds)
    setBusy(false)
    if (ok) {
      setSelectedRunIds([])
      setActionMessage('已封存该组工序的帘纹标准、打浆度、偏差与样本结果，生成生产结算单')
    }
  }

  const handleReconcile = async (settlement: Settlement) => {
    setBusy(true)
    const { ok, report } = await reconcile(settlement.id as number)
    setBusy(false)
    if (ok) {
      setActionMessage(`${settlement.settlementNo} 对账一致（完成率 100%），已按当前主数据重新结案`)
    } else {
      setActionMessage(`${settlement.settlementNo} 对账未通过（完成率 ${report?.completionRate ?? 0}%），原封存值照旧保留，可修正主数据后重试`)
    }
  }

  const monthOptions = useMemo(
    () => Array.from(new Set([...runs.map((run) => monthKey(run.runDate)), ...settlements.map((settlement) => settlement.period)])).sort().reverse(),
    [runs, settlements],
  )

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">月末生产结算</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            结案时封存帘纹标准、打浆度、偏差与样本结果；主数据一变即失效待对账，可按当前数据重算差异与完成率。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <TextField
            select
            size="small"
            label="结算月份"
            value={period}
            onChange={(event) => { setPeriod(event.target.value); setSelectedRunIds([]); setActionMessage(null) }}
            SelectProps={{ native: true }}
            inputProps={{ 'data-testid': 'field-period' }}
            sx={{ minWidth: 140 }}
          >
            {monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}
            {!monthOptions.includes(period) && <option value={period}>{period}</option>}
          </TextField>
          <Button variant="outlined" onClick={handleSync} disabled={busy} data-testid="sync-tasks">整理批组</Button>
          <Button variant="contained" size="large" onClick={handleBatch} disabled={busy} data-testid="batch-settle">
            批量结案
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}
      {actionMessage && <Alert severity={actionMessage.includes('未通过') || actionMessage.includes('跳过') ? 'warning' : 'success'} onClose={() => setActionMessage(null)}>{actionMessage}</Alert>}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <StatBadge label="本月批组" value={monthTasks.length} detail={`${monthDone} 结案 · ${monthPending} 待处理`} />
        <StatBadge label="跳过批组" value={monthSkipped} detail="样本未齐等原因，重开仍可继续" tone={monthSkipped ? 'warning' : 'neutral'} />
        <StatBadge label="本月结算单" value={monthSettlements.length} detail="封存当时主数据与样本结果" tone="bamboo" />
        <StatBadge label="待对账（全部月份）" value={staleCount} detail="主数据已变，需重新对账" tone={staleCount ? 'warning' : 'neutral'} />
      </Box>

      {isLoading && <LinearProgress />}

      {/* ------------------------------ 批组任务 ------------------------------ */}
      <Card data-testid="panel-tasks">
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.5 }}>
            <Box>
              <Typography variant="h5">月末批组任务（{period}）</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                按纸帘合并当月多槽工序。批量结案会逐组跳过不合格批组并记录原因，下次进入可继续处理。
              </Typography>
            </Box>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>纸帘</TableCell>
                <TableCell align="right">工序槽数</TableCell>
                <TableCell align="right">成纸样本</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>跳过原因 / 最近处理</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {monthTasks.map((task) => (
                <TaskRow
                  key={task.taskKey}
                  task={task}
                  busy={busy}
                  onRetry={async () => {
                    setBusy(true)
                    const result = await runBatch(period)
                    setBusy(false)
                    const hit = result.skipped.find((item) => item.taskKey === task.taskKey)
                    if (hit) setActionMessage(`${task.mouldNo} 仍被跳过：${hit.reason}`)
                    else setActionMessage(`${task.mouldNo} 已结案封存`)
                  }}
                />
              ))}
              {monthTasks.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>本月暂无工序批组</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ------------------------------ 手工结案 ------------------------------ */}
      <Card data-testid="panel-manual">
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Typography variant="h5">按工序结案</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            勾选当月工序生成结算单。混入不同纸帘或样本未齐时不能结案。
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>工序</TableCell>
                <TableCell>纸帘</TableCell>
                <TableCell>料批</TableCell>
                <TableCell align="right">样本</TableCell>
                <TableCell>偏差</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {selectableRuns.map((run) => {
                const mould = mouldById.get(run.mouldId)
                const batch = batchById.get(run.batchId)
                const sampleCount = samplesByRun.get(run.id as number)?.length ?? 0
                const checked = selectedRunIds.includes(run.id as number)
                const blockedByMix = checked && mixedSelection
                return (
                  <TableRow key={run.id} hover data-testid={`manual-run-${run.id}`} selected={checked}
                    sx={{ bgcolor: blockedByMix ? '#fff1e8' : undefined }}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={checked} size="small" onChange={() => toggleRun(run.id as number)} inputProps={{ 'data-testid': `check-run-${run.id}` } as InputHTMLAttributes<HTMLInputElement>} />
                    </TableCell>
                    <TableCell>{run.runNo}<Typography variant="caption" display="block" color="text.secondary">{run.runDate}</Typography></TableCell>
                    <TableCell>{mould?.mouldNo ?? '纸帘缺失'}</TableCell>
                    <TableCell>{batch?.batchNo ?? '料批缺失'}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" color={sampleCount > 0 ? 'success' : 'warning'} variant={sampleCount > 0 ? 'outlined' : 'filled'} label={`${sampleCount} 份`} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={isGapOutOfTolerance(run.deviation) ? 'warning' : 'default'} label={`${run.deviation > 0 ? '+' : ''}${run.deviation.toFixed(2)} mm`} />
                    </TableCell>
                  </TableRow>
                )
              })}
              {selectableRuns.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>本月暂无可选工序</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {selectableRuns.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2, alignItems: 'center' }}>
              {Array.from(new Set(selectableRuns.map((run) => run.mouldId))).map((mouldId) => {
                const groupIds = selectableRuns.filter((run) => run.mouldId === mouldId).map((run) => run.id as number)
                const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedRunIds.includes(id))
                return (
                  <Button key={mouldId} size="small" variant="outlined" onClick={() => toggleMouldGroup(mouldId)}>
                    {allSelected ? '取消整帘' : '整帘全选'} · {mouldById.get(mouldId)?.mouldNo ?? mouldId}
                  </Button>
                )
              })}
              <Box sx={{ flex: 1 }} />
              {manualCheck && !manualCheck.ok && (
                <Chip color="warning" label={manualCheck.reason} data-testid="manual-blocked" />
              )}
              {mixedSelection && <Chip color="error" label="混入不同纸帘的工序，不能结案" data-testid="manual-mixed" />}
              <Button
                variant="contained"
                disabled={busy || selectedRunIds.length === 0 || mixedSelection || !manualCheck?.ok}
                onClick={handleManualSettle}
                data-testid="manual-submit"
              >
                封存结案（{selectedRunIds.length} 槽）
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------ 结算单 ------------------------------ */}
      <Stack spacing={1.5} data-testid="panel-settlements">
        <Typography variant="h5">生产结算单（{period}）</Typography>
        {monthSettlements.length === 0 && (
          <Card><CardContent sx={{ textAlign: 'center', py: 5 }}><Typography color="text.secondary">本月还没有结算单，先执行批量结案或按工序结案</Typography></CardContent></Card>
        )}
        {monthSettlements.map((settlement) => (
          <SettlementCard key={settlement.id} settlement={settlement} busy={busy} onReconcile={handleReconcile} />
        ))}
      </Stack>
    </Stack>
  )
}

/* --------------------------------- 子组件 --------------------------------- */

function TaskRow({ task, busy, onRetry }: { task: SettlementTask; busy: boolean; onRetry: () => void }) {
  const color = task.status === 'done' ? 'success' : task.status === 'skipped' ? 'warning' : 'default'
  return (
    <TableRow data-testid={`task-${task.taskKey}`} sx={{ bgcolor: task.status === 'skipped' ? '#fff8e5' : undefined }}>
      <TableCell sx={{ fontWeight: 700 }}>{task.mouldNo}</TableCell>
      <TableCell align="right">{task.runsCount}</TableCell>
      <TableCell align="right">{task.samplesCount}</TableCell>
      <TableCell><Chip size="small" color={color as 'success' | 'warning' | 'default'} label={TASK_STATUS_LABEL[task.status]} /></TableCell>
      <TableCell>
        {task.lastReason ? (
          <Typography variant="body2" color="warning.dark" data-testid={`task-reason-${task.taskKey}`}>{task.lastReason}</Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">最近处理 {task.attemptedAt ? formatDateTime(task.attemptedAt) : '—'}</Typography>
        )}
      </TableCell>
      <TableCell align="right">
        <Button
          size="small"
          variant={task.status === 'skipped' ? 'contained' : 'outlined'}
          color={task.status === 'skipped' ? 'warning' : 'primary'}
          disabled={busy || task.status === 'done'}
          onClick={onRetry}
          data-testid={`retry-task-${task.taskKey}`}
        >
          {task.status === 'done' ? '已结案' : '重试该组'}
        </Button>
      </TableCell>
    </TableRow>
  )
}

function SettlementCard({
  settlement,
  busy,
  onReconcile,
}: {
  settlement: Settlement
  busy: boolean
  onReconcile: (settlement: Settlement) => void
}) {
  return (
    <Accordion data-testid={`settlement-${settlement.id}`} disableGutters sx={{ border: '1px solid #ddd2bd', borderRadius: '10px !important', '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<Box component="span" aria-hidden="true" sx={{ fontSize: 20, lineHeight: 1 }}>⌄</Box>}>
        <Grid container spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
          <Grid item xs={12} sm={4} md={3}>
            <Typography sx={{ fontWeight: 800 }}>{settlement.settlementNo}</Typography>
            <Typography variant="caption" color="text.secondary">{settlement.period} · 封存于 {formatDateTime(settlement.sealedAt)}</Typography>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <Chip size="small" color={STATUS_COLOR[settlement.status]} label={SETTLEMENT_STATUS_LABEL[settlement.status]} data-testid={`settlement-status-${settlement.id}`} />
          </Grid>
          <Grid item xs={6} sm={5} md={3}>
            <Typography variant="body2">{settlement.runSnapshots.length} 槽工序 · {settlement.sampleSnapshots.length} 份样本</Typography>
            <Typography variant="caption" color="text.secondary">{settlement.batchSnapshots.length} 个料批</Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            {settlement.invalidReason ? (
              <Typography variant="caption" color="warning.dark">{settlement.invalidReason}</Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">封存数据与主数据版本一致{settlement.reconciledAt ? `，对账于 ${formatDateTime(settlement.reconciledAt)}` : ''}</Typography>
            )}
          </Grid>
        </Grid>
      </AccordionSummary>
      <AccordionDetails sx={{ bgcolor: '#faf6ec' }}>
        <SealedSnapshotTable settlement={settlement} />
        {settlement.status === 'stale' && (
          <ReconcilePanel settlement={settlement} busy={busy} onReconcile={onReconcile} />
        )}
        {settlement.status !== 'stale' && settlement.lastReport && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>最近一次对账结果（{formatDateTime(settlement.lastReport.checkedAt)}）</Typography>
            <ReportTable report={settlement.lastReport} />
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  )
}

function SealedSnapshotTable({ settlement }: { settlement: Settlement }) {
  const batchOf = (batchId: number) => settlement.batchSnapshots.find((batch) => batch.batchId === batchId)
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>封存值（结案当时快照，不随后续改动变化）</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>工序</TableCell>
            <TableCell>帘纹标准</TableCell>
            <TableCell align="right">封存偏差</TableCell>
            <TableCell>打浆度</TableCell>
            <TableCell>样本结果</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {settlement.runSnapshots.map((run) => {
            const runSamples = settlement.sampleSnapshots.filter((sample) => sample.runId === run.runId)
            return (
              <TableRow key={run.runId}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>{run.runNo}</Typography>
                  <Typography variant="caption" color="text.secondary">{run.runDate} · {run.grammage} g/m²</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{settlement.mouldSnapshot.mouldNo} · {run.standardGap.toFixed(2)} mm</Typography>
                  <Typography variant="caption" color="text.secondary">实测 {run.measuredGap.toFixed(2)} mm</Typography>
                </TableCell>
                <TableCell align="right">
                  <Chip size="small" color={isGapOutOfTolerance(run.deviation) ? 'warning' : 'success'} variant="outlined" label={`${run.deviation > 0 ? '+' : ''}${run.deviation.toFixed(2)} mm`} />
                </TableCell>
                <TableCell>
                  {(() => {
                    const batch = batchOf(run.batchId)
                    return batch ? `${batch.batchNo} · ${batch.beatingDegree}°SR` : '料批缺失'
                  })()}
                </TableCell>
                <TableCell>
                  {runSamples.length === 0 && <Typography variant="caption" color="text.secondary">无样本</Typography>}
                  {runSamples.map((sample) => (
                    <Chip key={sample.sampleId} size="small" sx={{ mr: 0.5, mb: 0.25 }} label={`${sample.sampleNo} ${sample.stripeCount}条·${sample.evenness}`} />
                  ))}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

function ReconcilePanel({ settlement, busy, onReconcile }: { settlement: Settlement; busy: boolean; onReconcile: (settlement: Settlement) => void }) {
  const report = settlement.lastReport
  return (
    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #d4c6a8' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle2">重新对账（按当前主数据复算，封存值照旧保留）</Typography>
          {report && (
            <Typography variant="body2" color="text.secondary">
              上次完成率 {report.completionRate}%（{report.matched}/{report.total} 项一致），已重试 {settlement.reconciliationCount} 次
            </Typography>
          )}
        </Box>
        <Button variant="contained" color="warning" disabled={busy} onClick={() => onReconcile(settlement)} data-testid={`reconcile-${settlement.id}`}>
          重新对账
        </Button>
      </Box>
      {report && <ReportTable report={report} />}
    </Box>
  )
}

function ReportTable({ report }: { report: ReconcileReport }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={report.completionRate}
            color={report.ok ? 'success' : 'warning'}
            sx={{ height: 10, borderRadius: 5, bgcolor: '#e8e1d4' }}
          />
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 90, textAlign: 'right' }}>完成率 {report.completionRate}%</Typography>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>核对项</TableCell>
            <TableCell>封存值</TableCell>
            <TableCell>当前值</TableCell>
            <TableCell>差异</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {report.items.map((item, index) => (
            <TableRow key={`${item.label}-${index}`} sx={{ bgcolor: item.matched ? undefined : '#fff4d6' }}>
              <TableCell>
                <Chip size="small" sx={{ mr: 0.5, bgcolor: `${CATEGORY_COLOR[item.category]}1a`, color: CATEGORY_COLOR[item.category] }} label={item.category} />
                {item.label}
              </TableCell>
              <TableCell>{item.sealedValue}</TableCell>
              <TableCell>{item.currentValue}</TableCell>
              <TableCell>
                <Chip size="small" color={item.matched ? 'success' : 'warning'} variant={item.matched ? 'outlined' : 'filled'} label={item.matched ? '一致' : '不一致'} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Alert severity={report.ok ? 'success' : 'warning'} sx={{ mt: 1 }}>{report.note}</Alert>
    </Box>
  )
}
