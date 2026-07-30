import { backendPost, type QuotaReportResponse } from '@/lib/backend'
import { notify } from '@/store/notifications'
import { setScore } from '@/store/auth'

/**
 * 上报单次 LLM 调用的 token 用量到后端。
 * 后端返回 remaining_score 时更新本地 score；
 * 后端返回额度不足（code=0）时弹窗提示。
 *
 * 失败时静默——上报是 best-effort，不阻塞聊天。
 */
export async function reportUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  requestId?: string
): Promise<void> {
  if (!model || (inputTokens === 0 && outputTokens === 0)) {
    return
  }

  try {
    const res = await backendPost<QuotaReportResponse>('/api/client/v1/quota/report', {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      request_id: requestId ?? ''
    })

    if (res.data?.remaining_score !== undefined) {
      setScore(res.data.remaining_score)
    }
  } catch (err) {
    // 额度不足：后端返回 code=0，msg 含"额度不足"
    const msg = err instanceof Error ? err.message : String(err)

    if (msg.includes('额度不足') || msg.includes('insufficient')) {
      notify({
        kind: 'warning',
        title: '额度不足',
        message: '剩余额度已耗尽，请联系代理充值',
        durationMs: 0 // 不自动消失，必须用户手动关
      })
    }

    // 其他错误静默：上报失败不阻塞聊天
  }
}
