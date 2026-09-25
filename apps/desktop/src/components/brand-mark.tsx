import { useStore } from '@nanostores/react'
import { type ComponentProps, useState } from 'react'

import { cn } from '@/lib/utils'

import { $oemBrand, hasOemLogo } from '@/store/oem-brand'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

/**
 * Brand badge: 默认硅基Claw 标（qiji-brand.png，浅深色一致）。
 * 登录贴牌账号后显示贴牌 logo（远程 URL）；贴牌 logo 加载失败回退默认图。
 * `overrideLogo` 供登录页传预查预览 logo（未登录时 store 里还没有品牌）。
 */
export function BrandMark({
  className,
  overrideLogo,
  ...props
}: ComponentProps<'span'> & { overrideLogo?: string | null }) {
  const brand = useStore($oemBrand)
  const [broken, setBroken] = useState(false)
  const logoUrl = overrideLogo?.trim() || (hasOemLogo(brand) ? brand.logo.trim() : '')

  return (
    <span
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white',
        className
      )}
      {...props}
    >
      {logoUrl && !broken ? (
        <img
          alt=""
          className="size-full object-contain"
          onError={() => setBroken(true)}
          src={logoUrl}
        />
      ) : (
        <img alt="" className="size-full object-contain" src={assetPath('qiji-brand.png')} />
      )}
    </span>
  )
}
