import {
  SiApple,
  SiBilibili,
  SiDiscord,
  SiGmail,
  SiHomeassistant,
  SiMatrix,
  SiMattermost,
  SiQq,
  SiSignal,
  SiTelegram,
  SiWechat,
  SiWhatsapp
} from '@icons-pack/react-simple-icons'
import type { ComponentType, SVGProps } from 'react'

import { Globe, Link as LinkIcon, MessageSquareText } from '@/lib/icons'
import { cn } from '@/lib/utils'

// We render simpleicons.org brand glyphs for platforms whose owners publish a
// usable mark (telegram, discord, matrix, ...). A few brands — Slack, Dingtalk,
// Feishu, WeCom — have been removed from Simple Icons at the brand owner's
// request, so we fall back to a colored letter monogram for those.
//
// `iconColor` is the brand's hex from simpleicons.org so we can paint each
// glyph in its native color on top of a soft tint. The fallback monogram uses
// the same hex to keep visual consistency.
type IconKind = 'brand' | 'generic'

interface PlatformIconSpec {
  Icon?: ComponentType<SVGProps<SVGSVGElement>>
  color: string
  kind: IconKind
  monogram?: string
}

// 中文环境下的平台名称映射。
// 后端 API 返回的 platform.name 是英文品牌名（如 "DingTalk"），
// 这里提供中文译名，在中文环境下替换显示。
const PLATFORM_NAMES_ZH: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  mattermost: 'Mattermost',
  matrix: 'Matrix',
  signal: 'Signal',
  whatsapp: 'WhatsApp',
  bluebubbles: 'BlueBubbles',
  homeassistant: 'Home Assistant',
  email: '邮件',
  sms: '短信',
  webhook: 'Webhook',
  api_server: 'API 服务器',
  weixin: '微信',
  wecom: '企业微信',
  qqbot: 'QQ 机器人',
  qq: 'QQ',
  dingtalk: '钉钉',
  feishu: '飞书',
  lark: '飞书',
  yuanbao: '元宝',
  bilibili: '哔哩哔哩'
}

/**
 * 根据当前 locale 返回平台的本地化名称。
 * 中文环境下使用 PLATFORM_NAMES_ZH 映射，其他环境返回原始名称。
 */
export function getPlatformDisplayName(
  platformId: string,
  fallbackName: string,
  locale: string
): string {
  if (locale === 'zh' || locale === 'zh-hant') {
    return PLATFORM_NAMES_ZH[platformId] || fallbackName
  }
  return fallbackName
}

const PLATFORM_ICONS: Record<string, PlatformIconSpec> = {
  telegram: { Icon: SiTelegram, color: '#26A5E4', kind: 'brand' },
  discord: { Icon: SiDiscord, color: '#5865F2', kind: 'brand' },
  // Slack removed from Simple Icons by Salesforce request — letter monogram.
  slack: { color: '#4A154B', kind: 'brand', monogram: 'S' },
  mattermost: { Icon: SiMattermost, color: '#0058CC', kind: 'brand' },
  matrix: { Icon: SiMatrix, color: '#000000', kind: 'brand' },
  signal: { Icon: SiSignal, color: '#3A76F0', kind: 'brand' },
  whatsapp: { Icon: SiWhatsapp, color: '#25D366', kind: 'brand' },
  bluebubbles: { Icon: SiApple, color: '#0BD318', kind: 'brand' },
  homeassistant: { Icon: SiHomeassistant, color: '#18BCF2', kind: 'brand' },
  email: { Icon: SiGmail, color: '#EA4335', kind: 'brand' },
  sms: { Icon: MessageSquareText, color: '#F43F5E', kind: 'generic' },
  webhook: { Icon: LinkIcon, color: '#71717A', kind: 'generic' },
  api_server: { Icon: Globe, color: '#64748B', kind: 'generic' },
  weixin: { Icon: SiWechat, color: '#07C160', kind: 'brand' },
  qqbot: { Icon: SiQq, color: '#EB1923', kind: 'brand' },
  yuanbao: { Icon: SiBilibili, color: '#FB7299', kind: 'brand' }
}

interface PlatformAvatarProps {
  platformId: string
  platformName: string
  className?: string
}

export function PlatformAvatar({ className, platformId, platformName }: PlatformAvatarProps) {
  const spec = PLATFORM_ICONS[platformId]

  const baseClass = cn(
    'inline-grid size-6 shrink-0 place-items-center rounded-md text-[length:var(--conversation-caption-font-size)] font-medium',
    className
  )

  if (!spec) {
    return (
      <span aria-hidden="true" className={cn(baseClass, 'bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)')}>
        {platformName.charAt(0).toUpperCase()}
      </span>
    )
  }

  const { Icon, color } = spec

  return (
    <span
      aria-hidden="true"
      className={baseClass}
      style={{
        // 16% tint of the brand color so the glyph reads against any surface
        // without the avatar dominating the row.
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        color
      }}
    >
      {Icon ? <Icon className="size-3.5" /> : spec.monogram || platformName.charAt(0).toUpperCase()}
    </span>
  )
}
