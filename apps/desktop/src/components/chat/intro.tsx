import { type CSSProperties, useState } from 'react'

import introCopyJsonl from './intro-copy.jsonl?raw'

type IntroCopy = {
  headline: string
  body: string
}

type IntroCopyRecord = IntroCopy & {
  personality: string
}

export type QuickSkill = {
  name: string
  title: string
  desc: string
}

export type IntroExample = {
  title: string
  prompt: string
}

export type IntroProps = {
  personality?: string
  seed?: number
  quickSkills?: QuickSkill[]
  examples?: IntroExample[]
  onPickSkill?: (name: string) => void
  onPickExample?: (prompt: string) => void
}

const NEUTRAL_PERSONALITIES = new Set(['', 'default', 'none', 'neutral'])

const FALLBACK_COPY: IntroCopy[] = [
  {
    headline: '今天要做点什么？',
    body: '发个问题、任务、或想法，我来看手帮你搞定。'
  },
  {
    headline: '在想什么？',
    body: '把你的问题或卡住的地方告诉我，我先理解再动手。'
  },
  {
    headline: '奇计能帮你看什么？',
    body: '发任务、问题、或想法，我帮你拆解成具体步骤。'
  },
  {
    headline: '从哪里开始？',
    body: '把问题、目标或文件发过来，我先看看再动手。'
  },
  {
    headline: '需要什么帮助？',
    body: '把你已知的信息发过来，我帮你梳理成方案或直接解决。'
  }
]

function normalizeKey(value?: string): string {
  return (value || '').trim().toLowerCase()
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function isIntroCopyRecord(value: unknown): value is IntroCopyRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.personality === 'string' &&
    typeof record.headline === 'string' &&
    typeof record.body === 'string' &&
    Boolean(record.personality.trim()) &&
    Boolean(record.headline.trim()) &&
    Boolean(record.body.trim())
  )
}

function parseIntroCopy(raw: string): Record<string, IntroCopy[]> {
  const byPersonality: Record<string, IntroCopy[]> = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    try {
      const parsed: unknown = JSON.parse(trimmed)

      if (!isIntroCopyRecord(parsed)) {
        continue
      }

      const key = normalizeKey(parsed.personality)
      byPersonality[key] ??= []
      byPersonality[key].push({
        headline: parsed.headline.trim(),
        body: parsed.body.trim()
      })
    } catch {
      // Bad generated copy should not break the whole desktop app.
    }
  }

  return byPersonality
}

const INTRO_COPY_BY_PERSONALITY = parseIntroCopy(introCopyJsonl)

function neutralCopy(): IntroCopy[] {
  return INTRO_COPY_BY_PERSONALITY.none || INTRO_COPY_BY_PERSONALITY.default || FALLBACK_COPY
}

function fallbackCopyForPersonality(personalityKey: string): IntroCopy[] {
  if (NEUTRAL_PERSONALITIES.has(personalityKey)) {
    return neutralCopy()
  }

  const label = titleize(personalityKey)

  return [
    {
      headline: `${label} 模式已开启，需要做什么？`,
      body: '发任务、文件、或想法。我会按你配置的风格来工作。'
    },
    {
      headline: `${label} 奇计需要看什么？`,
      body: '把上下文或卡住的部分发过来，我会适配你的风格。'
    },
    {
      headline: `${label} 模式就绪。`,
      body: '发问题、文件、或想法，我会按你配置的风格回应。'
    },
    {
      headline: `${label} 奇计该处理什么？`,
      body: '把任务发过来，我会认真完成。'
    },
    {
      headline: '从哪里开始？',
      body: `给我上下文，我会用 ${label} 模式回应。`
    }
  ]
}

function pickCopy(copies: IntroCopy[], seed = 0): IntroCopy {
  return copies[Math.abs(seed) % copies.length] || FALLBACK_COPY[0]
}

const WORDMARK = '奇计'

function resolveCopy(personality?: string, seed?: number): IntroCopy {
  const personalityKey = normalizeKey(personality)

  const copies = NEUTRAL_PERSONALITIES.has(personalityKey)
    ? INTRO_COPY_BY_PERSONALITY[personalityKey] || neutralCopy()
    : INTRO_COPY_BY_PERSONALITY[personalityKey] || fallbackCopyForPersonality(personalityKey)

  return pickCopy(copies, seed)
}

export function Intro({ personality, seed, quickSkills, examples, onPickSkill, onPickExample }: IntroProps) {
  const [mountSeed] = useState(() => Math.floor(Math.random() * 100000))
  const copy = resolveCopy(personality, mountSeed + (seed ?? 0))

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <div className="w-full min-w-0">
        <p
          aria-label={WORDMARK}
          className="text-6xl font-bold tracking-[0.08em] text-midground dark:text-foreground/85"
        >
          {WORDMARK}
        </p>

        <p className="m-0 text-center leading-normal tracking-tight">{copy.body}</p>

        {quickSkills && quickSkills.length > 0 && onPickSkill ? (
          <div className="pointer-events-auto mt-3 w-full max-w-xl">
            <div className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">快捷技能</div>
            <div className="flex justify-center gap-1.5">
              {quickSkills.map(sk => (
                <button
                  className="group shrink-0 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                  key={sk.name}
                  onClick={() => onPickSkill(sk.name)}
                  title={sk.desc}
                  type="button"
                >
                  <span className="text-[0.75rem] font-medium text-foreground">{sk.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  )
}

/** 最佳实践条：挂载在输入框下方（仅空会话主页显示） */
export function ExamplesStrip({ examples, onPick }: { examples: IntroExample[]; onPick: (prompt: string) => void }) {
  if (examples.length === 0) return null
  return (
    <div className="pointer-events-auto absolute top-[calc(42%+var(--composer-measured-height,160px)+0.75rem)] left-1/2 z-20 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 px-1 pb-1">
      <div className="mb-1.5 text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">试试这样用</div>
      <div className="flex flex-col gap-1">
        {examples.map(ex => (
          <button
            className="w-full truncate rounded-lg border border-border/50 bg-transparent px-3 py-1.5 text-left text-[0.8rem] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            key={ex.title}
            onClick={() => onPick(ex.prompt)}
            title={ex.prompt}
            type="button"
          >
            {ex.title}
          </button>
        ))}
      </div>
    </div>
  )
}
