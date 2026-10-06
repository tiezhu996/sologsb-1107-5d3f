import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, Stack, TextField, Typography } from '@mui/material'
import { StatBadge } from '../components/common/StatBadge'
import { useRunStore } from '../stores/runStore'
import { useSettlementStore } from '../stores/settlementStore'
import type { BatchCloseResult, Settlement, SettlementStatus } from '../types/settlement'
import { getCloseBlockReason } from '../utils/settlement'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function formatTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

const statusColor: Record<SettlementStatus, 'success' | 'warning' | 'default'> = {
  已结算: 'success',
  待对账: 'warning',
  已结案: 'default',
}

interface SettlementCardProps {
  settlement: Settlement
  busy: boolean
  onReconcile: (id: number) => void
  onClose: (settlement: Settlement) => void
}

function SettlementCard({ settlement, busy, onReconcile, onClose }: SettlementCardProps) {
  const frozen = settlement.frozen
  const blockReason = settlement.status === '已结算' ? getCloseBlockReason(settlement) : null
  const rec = settlement.reconciliation
  const noValueChanges = rec
    && rec.gapStdChanges.length === 0
    && rec.beatingDegreeChanges.length === 0
    && rec.deviationChanges.length === 0
    && rec.sampleCountDelta === 0
  return (
    <Card data-testid="row-settlement" sx={{ borderColor: settlement.status === '待对账' ? '#d9a928' : undefined }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{settlement.settlementNo}</Typography>
            <Typography variant="caption" color="text.secondary">
              账期 {settlement.period} · 生成于 {formatTime(settlement.createdAt)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip size="small" color={statusColor[settlement.status]} label={settlement.status} />
            {settlement.status === '待对账' && settlement.id !== undefined && (
              <Button size="small" variant="contained" color="warning" disabled={busy} onClick={() => onReconcile(settlement.id as number)} data-testid={`reconcile-${settlement.id}`}>
                {settlement.reconcileError ? '重试对账' : '对账'}
              </Button>
            )}
            {settlement.status === '已结算' && (
              <Button size="small" variant="contained" disabled={busy || Boolean(blockReason)} onClick={() => onClose(settlement)} data-testid={`close-${settlement.id ?? 0}`}>
                结案
              </Button>
            )}
            {settlement.status === '已结案' && settlement.closedAt && (
              <Chip size="small" variant="outlined" label={`结案于 ${formatTime(settlement.closedAt)}`} />
            )}
          </Box>
        </Box>

        <Grid container spacing={1.5} sx={{ mt: 1 }}>
          <Grid item xs={6} md={2.4}>
            <Typography variant="caption" color="text.secondary">封存帘纹标准</Typography>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{frozen.moulds.map((mould) => `${mould.mouldNo} ${mould.stripeGap.toFixed(2)} mm`).join('、')}</Typography>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Typography variant="caption" color="text.secondary">封存打浆度</Typography>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{frozen.batches.map((batch) => `${batch.batchNo} ${batch.beatingDegree}°SR`).join('、')}</Typography>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Typography variant="caption" color="text.secondary">封存偏差</Typography>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{frozen.runs.length} 槽 · 平均 {frozen.avgDeviation > 0 ? '+' : ''}{frozen.avgDeviation.toFixed(2)} mm</Typography>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Typography variant="caption" color="text.secondary">封存样本</Typography>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>{frozen.samples.length} 份 · 覆盖 {frozen.sampledRunCount}/{frozen.runs.length} 槽</Typography>
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Typography variant="caption" color="text.secondary">封存完成率</Typography>
            <Typography variant="body2" sx={{ fontWeight: 800 }}>{frozen.completionRate}%</Typography>
          </Grid>
        </Grid>

        {blockReason && <Alert severity="info" sx={{ mt: 1.5 }}>暂不能结案：{blockReason}</Alert>}
        {settlement.reconcileError && <Alert severity="error" sx={{ mt: 1.5 }}>{settlement.reconcileError}</Alert>}

        {rec && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2">对账结果 · {formatTime(rec.reconciledAt)}（按当前主数据重算，封存值保留不变）</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              {rec.gapStdChanges.map((change) => (
                <Chip key={`gap-${change.mouldNo}`} size="small" color="warning" variant="outlined" label={`帘纹标准 ${change.mouldNo} ${change.from.toFixed(2)}→${change.to.toFixed(2)} mm`} />
              ))}
              {rec.beatingDegreeChanges.map((change) => (
                <Chip key={`degree-${change.batchNo}`} size="small" color="warning" variant="outlined" label={`打浆度 ${change.batchNo} ${change.from}→${change.to}°SR`} />
              ))}
              {rec.deviationChanges.map((change) => (
                <Chip key={`dev-${change.runNo}`} size="small" color="warning" variant="outlined" label={`偏差 ${change.runNo} ${change.from > 0 ? '+' : ''}${change.from.toFixed(2)}→${change.to > 0 ? '+' : ''}${change.to.toFixed(2)} mm`} />
              ))}
              {rec.sampleCountDelta !== 0 && (
                <Chip size="small" color="warning" variant="outlined" label={`样本 ${rec.sampleCountDelta > 0 ? '+' : ''}${rec.sampleCountDelta} 份`} />
              )}
              {noValueChanges && <Chip size="small" color="success" variant="outlined" label="封存数值与当前主数据一致" />}
              <Chip size="small" color="primary" label={`完成率 ${rec.frozenCompletionRate}% → ${rec.completionRate}%`} />
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettlementLedger() {
  const settlements = useSettlementStore((state) => state.settlements)
  const error = useSettlementStore((state) => state.error)
  const loadSettlements = useSettlementStore((state) => state.loadSettlements)
  const createSettlement = useSettlementStore((state) => state.createSettlement)
  const reconcile = useSettlementStore((state) => state.reconcile)
  const closeSettlement = useSettlementStore((state) => state.closeSettlement)
  const closeBatch = useSettlementStore((state) => state.closeBatch)
  const runs = useRunStore((state) => state.sheetRuns)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const [period, setPeriod] = useState(currentMonth())
  const [creating, setCreating] = useState(false)
  const [closing, setClosing] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [batchResult, setBatchResult] = useState<BatchCloseResult | null>(null)
  const [closeHint, setCloseHint] = useState('')

  useEffect(() => {
    void loadSettlements()
    void loadRuns()
  }, [loadRuns, loadSettlements])

  const settledRunIds = useMemo(() => new Set(settlements.flatMap((settlement) => settlement.runIds)), [settlements])
  const pendingRuns = useMemo(
    () => runs.filter((run) => run.runDate.startsWith(period) && run.id !== undefined && !settledRunIds.has(run.id)),
    [period, runs, settledRunIds],
  )
  const openCount = settlements.filter((settlement) => settlement.status !== '已结案').length
  const reconcilingCount = settlements.filter((settlement) => settlement.status === '待对账').length
  const closedCount = settlements.filter((settlement) => settlement.status === '已结案').length

  const handleCreate = async () => {
    setCreating(true)
    setBatchResult(null)
    await createSettlement(period)
    setCreating(false)
  }

  const handleReconcile = async (id: number) => {
    setBusyId(id)
    await reconcile(id)
    setBusyId(null)
  }

  const handleCloseOne = async (settlement: Settlement) => {
    if (settlement.id === undefined) return
    setBusyId(settlement.id)
    setCloseHint('')
    const reason = await closeSettlement(settlement.id)
    if (reason) setCloseHint(`${settlement.settlementNo}：${reason}`)
    setBusyId(null)
  }

  const handleCloseBatch = async () => {
    setClosing(true)
    setCloseHint('')
    const result = await closeBatch()
    setBatchResult(result)
    setClosing(false)
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h3" color="#344a34">生产结算单</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          月末合并纸帘、料批、多槽工序与样本生成结算单并封存快照；主数据一旦变动，关联结算即转入待对账。完成率按“样本已齐且偏差在 ±0.2 mm 内”的工序占比计算。
        </Typography>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h5">月末结算</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                按账期合并未结算工序，封存当时的帘纹标准、打浆度、偏差与样本结果。
              </Typography>
              <Grid container spacing={2} alignItems="center" sx={{ mt: 1.5 }}>
                <Grid item xs={7} sm={6}>
                  <TextField fullWidth type="month" label="账期" value={period} onChange={(event) => setPeriod(event.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'field-period' }} />
                </Grid>
                <Grid item xs={5} sm={6}>
                  <Chip label={`待结算工序 ${pendingRuns.length} 槽`} color={pendingRuns.length ? 'primary' : 'default'} variant="outlined" />
                </Grid>
              </Grid>
              <Button sx={{ mt: 2 }} variant="contained" disabled={creating || pendingRuns.length === 0} onClick={handleCreate} data-testid="submit-settlement">
                {creating ? '生成中…' : '生成结算单'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="h5">批量结案</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    逐单校验样本与纸帘一致性，不合格的单据跳过并给出原因，处理后再次执行即可继续。
                  </Typography>
                </Box>
                <Button variant="outlined" onClick={handleCloseBatch} disabled={closing || openCount === 0} data-testid="batch-close">
                  {closing ? '处理中…' : `批量结案（${openCount} 单待处理）`}
                </Button>
              </Box>
              {batchResult && (
                <Alert severity={batchResult.skipped.length ? 'warning' : 'success'} sx={{ mt: 2 }} data-testid="batch-result">
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    结案 {batchResult.closedCount} 单，跳过 {batchResult.skipped.length} 单
                  </Typography>
                  {batchResult.skipped.map((skip) => (
                    <Typography key={skip.settlementNo} variant="body2" sx={{ mt: 0.5 }}>
                      {skip.settlementNo}：{skip.reason}
                    </Typography>
                  ))}
                  {batchResult.skipped.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      跳过的结算单保持原状态，处理原因后重新批量结案即可接着处理。
                    </Typography>
                  )}
                </Alert>
              )}
              {closeHint && <Alert severity="info" sx={{ mt: 2 }}>{closeHint}</Alert>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <StatBadge label="结算单总数" value={settlements.length} detail="月末合并生成" />
        <StatBadge label="待对账" value={reconcilingCount} detail="主数据变动待核对" tone={reconcilingCount ? 'warning' : 'neutral'} />
        <StatBadge label="已结案" value={closedCount} detail="封存值不再变动" tone="bamboo" />
      </Box>

      {settlements.map((settlement) => (
        <SettlementCard
          key={settlement.id ?? settlement.settlementNo}
          settlement={settlement}
          busy={busyId === settlement.id}
          onReconcile={(id) => void handleReconcile(id)}
          onClose={(target) => void handleCloseOne(target)}
        />
      ))}
      {settlements.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 7 }}>
            <Typography color="text.secondary">尚未生成结算单，选择账期后点击“生成结算单”。</Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  )
}
