/**
 * Skill Picker — a floating popover that lets users browse and select skills
 * by category, similar to Doubao's plugin selector.
 *
 * Click the ⚡ button next to the model pill → popover opens with skills
 * grouped by category → click a skill → it loads via the `/skill-name`
 * slash command.
 */

import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getSkills, type SkillInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { translateCategory, translateSkillField } from '@/app/skills/translations'
import { cn } from '@/lib/utils'

interface SkillPickerProps {
  /** Called with the slash command text (e.g. "/qiji-geo") when user picks a skill. */
  onSelect: (command: string) => void
  disabled?: boolean
}

export function SkillPicker({ onSelect, disabled }: SkillPickerProps) {
  const { locale } = useI18n()
  const isZh = locale === 'zh' || locale === 'zh-hant'

  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  // Fetch skills when popover opens
  useEffect(() => {
    if (!open || skills.length > 0) return
    setLoading(true)
    getSkills()
      .then(list => {
        setSkills(list.filter(s => s.enabled))
      })
      .catch(() => {
        setSkills([])
      })
      .finally(() => setLoading(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Group by category
  const grouped = useMemo(() => {
    const filtered = query.trim()
      ? skills.filter(s =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase()) ||
          (s.category || '').toLowerCase().includes(query.toLowerCase())
        )
      : skills

    const map = new Map<string, SkillInfo[]>()
    for (const s of filtered) {
      const cat = s.category || 'other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(s)
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'other') return 1
      if (b[0] === 'other') return -1
      return a[0].localeCompare(b[0])
    })
  }, [skills, query])

  const handlePick = (skill: SkillInfo) => {
    const cmd = `/${skill.name}`
    onSelect(cmd)
    setOpen(false)
    setQuery('')
  }

  const displayCategory = (cat: string) => {
    return isZh ? translateCategory(cat) : cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  const displayName = (skill: SkillInfo) => {
    return isZh ? translateSkillField(skill.name, 'name', skill.name) : skill.name
  }

  const displayDescription = (skill: SkillInfo) => {
    return isZh ? translateSkillField(skill.name, 'description', skill.description || '') : (skill.description || '')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="选择技能"
          className="size-(--composer-control-size) shrink-0 rounded-md text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground"
          disabled={disabled}
          size="icon"
          title={isZh ? '技能' : 'Skills'}
          type="button"
          variant="ghost"
        >
          <Codicon name="zap" size="0.875rem" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-h-96 overflow-hidden p-0 flex flex-col"
        side="top"
        sideOffset={8}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-(--ui-border) px-3 py-2">
          <Codicon name="search" size="0.75rem" className="text-(--ui-text-tertiary)" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-(--ui-text-tertiary)"
            onChange={e => setQuery(e.target.value)}
            placeholder={isZh ? '搜索技能...' : 'Search skills...'}
            value={query}
          />
        </div>

        {/* Skill list */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-(--ui-text-tertiary)">
              <Codicon name="loading~spin" size="0.875rem" className="mr-2" />
              {isZh ? '加载中...' : 'Loading...'}
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">
              {query ? (isZh ? '没有匹配的技能' : 'No matching skills') : (isZh ? '暂无可用技能' : 'No skills available')}
            </div>
          ) : (
            grouped.map(([category, items]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs font-semibold text-foreground bg-(--ui-bg-secondary) border-b border-(--ui-border)">
                  {displayCategory(category)}
                </div>
                {items.map(skill => (
                  <button
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left',
                      'hover:bg-(--ui-bg-tertiary) transition-colors cursor-pointer'
                    )}
                    key={skill.name}
                    onClick={() => handlePick(skill)}
                    type="button"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {displayName(skill)}
                    </span>
                    {displayDescription(skill) && (
                      <span className="text-xs text-(--ui-text-tertiary) line-clamp-2">
                        {displayDescription(skill)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
