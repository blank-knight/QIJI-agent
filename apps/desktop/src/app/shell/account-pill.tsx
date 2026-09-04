import { useStore } from '@nanostores/react'
import { useNavigate } from 'react-router-dom'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $auth } from '@/store/auth'

/**
 * 标题栏左上角账号头像：登录后显示大号头像（emoji），点击直达设置-个人中心。
 * 未设头像时显示人形 codicon；积分≤0 时头像右下角挂红点。
 */
export function AccountAvatarButton() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const authState = useStore($auth)

  if (!authState.token) {
    return null
  }

  const avatarRaw = authState.avatar ?? ''
  let emoji = ''
  if (avatarRaw.startsWith('avatar://emoji/')) {
    const decoded = decodeURIComponent(avatarRaw.slice('avatar://emoji/'.length))
    // 白名单：恰好 1 个字符（emoji）才信
    if (Array.from(decoded).length === 1) {
      emoji = decoded
    }
  }

  const score = authState.score
  const lowScore = score <= 0

  return (
    <button
      aria-label={t.titlebar.accountPill(emoji || authState.username || '', score)}
      className={cn(
        'pointer-events-auto relative flex size-6 shrink-0 translate-y-0.5 items-center justify-center',
        'rounded-full text-(--ui-text-tertiary)',
        'hover:bg-(--ui-control-hover-background) hover:text-foreground',
        'transition-colors [-webkit-app-region:no-drag]'
      )}
      onClick={() => navigate('/settings?tab=account')}
      onPointerDown={event => event.stopPropagation()}
      title={t.titlebar.accountPill(emoji || authState.username || '', score)}
      type="button"
    >
      {emoji ? (
        <span className="text-base leading-none">{emoji}</span>
      ) : (
        <Codicon className="text-[0.9375rem]" name="account" />
      )}
      {lowScore && (
        <span className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-(--ui-destructive) ring-2 ring-(--ui-chat-surface-background)" />
      )}
    </button>
  )
}
