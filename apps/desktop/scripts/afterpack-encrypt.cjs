#!/usr/bin/env node
/**
 * afterPack: 渲染层 + 主进程源码加密
 *
 * 1) dist/assets/index-*.js  → RC4流加密成 .enc，index.html 的 <script src> 换成内联解密 loader
 * 2) app.asar 内 electron/main.cjs → 同算法加密，入口换 bootstrap.cjs（解密到内存后 require）
 *
 * 密钥: QIJI_OBF_SEED 环境变量（打包时注入），派生算法两端一致（FNV→RC4 KSA）。
 * 定位：防脚本小子的商业混淆（90%人群），不是军事级加密。
 * 2026-09-12 为对外测试发包而加。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEED = process.env.QIJI_OBF_SEED;
if (!SEED) {
  console.error('[afterPack-encrypt] QIJI_OBF_SEED 未设置 — 跳过加密（开发模式）');
  return;
}

function deriveKey(seed) {
  const out = Buffer.alloc(32);
  let h = 2166136261 >>> 0;
  for (let r = 0; r < 32; r++) {
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i) + (r << 8);
      h = Math.imul(h, 16777619) >>> 0;
    }
    out[r] = h & 255;
  }
  return out;
}

function rc4(data, key) {
  const S = new Uint8Array(256);
  let j = 0;
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
  }
  let i = 0; j = 0;
  const out = Buffer.alloc(data.length);
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
    out[n] = data[n] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

const key = deriveKey(SEED);

exports.default = async function afterPack(context) {
  const appDir = context.appOutDir;
  const resDir = path.join(appDir, 'resources');

  // ---- 1) 渲染层 ----
  const distAssets = path.join(resDir, 'app.asar.unpacked', 'dist', 'assets');
  if (fs.existsSync(distAssets)) {
    for (const f of fs.readdirSync(distAssets)) {
      if (f.endsWith('.js')) {
        const p = path.join(distAssets, f);
        const plain = fs.readFileSync(p);
        fs.writeFileSync(p + '.enc', rc4(plain, key));
        fs.unlinkSync(p);
        console.log(`[afterPack-encrypt] 渲染层加密: ${f} → ${f}.enc (${plain.length}B)`);
      }
    }
    // index.html: 替换 script src
    const htmlPath = path.join(resDir, 'app.asar.unpacked', 'dist', 'index.html');
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      const loader = fs.readFileSync(path.join(__dirname, 'renderer-loader.html'), 'utf8')
        .replace('__KEY_SEED__', SEED);
      html = html.replace(
        /<script type="module" crossorigin src="\.\/assets\/(index-[^"]+\.js)"><\/script>/,
        `<script data-src="./assets/$1.enc">\n${loader}\n</script>`
      );
      fs.writeFileSync(htmlPath, html);
      console.log('[afterPack-encrypt] index.html loader 已替换');
    }
  }

  // ---- 2) asar 内主进程 ----
  const asarPath = path.join(resDir, 'app.asar');
  if (fs.existsSync(asarPath)) {
    const asar = require('@electron/asar');
    // 读 main.cjs → 加密 → 写回 → 换入口
    const mainSrc = asar.extractFile(asarPath, 'electron/main.cjs');
    const enc = rc4(mainSrc, key);
    asar.writeFile? null : null;
    // asar 库不支持原位改 — 读全部→改→重打
    const tmpDir = fs.mkdtempSync('/tmp/asar-repack-');
    asar.extractAll(asarPath, tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'electron', 'main.cjs.enc'), enc);
    fs.unlinkSync(path.join(tmpDir, 'electron', 'main.cjs'));
    // bootstrap: 解密 main.cjs.enc 到内存并 require
    const bootstrap = `
const { readFileSync } = require('fs');
const path = require('path');
const crypto = require('crypto');
const SEED = ${JSON.stringify(SEED)};
function deriveKey(seed){const out=Buffer.alloc(32);let h=2166136261>>>0;for(let r=0;r<32;r++){for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i)+(r<<8);h=Math.imul(h,16777619)>>>0;}out[r]=h&255;}return out;}
function rc4(data,key){const S=new Uint8Array(256);let j=0;for(let i=0;i<256;i++)S[i]=i;for(let i=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;const t=S[i];S[i]=S[j];S[j]=t;}let i=0;j=0;const out=Buffer.alloc(data.length);for(let n=0;n<data.length;n++){i=(i+1)&255;j=(j+S[i])&255;const t=S[i];S[i]=S[j];S[j]=t;out[n]=data[n]^S[(S[i]+S[j])&255];}return out;}
const enc = readFileSync(path.join(__dirname, 'main.cjs.enc'));
const plain = rc4(enc, deriveKey(SEED)).toString('utf8');
const Module = require('module');
const m = new Module('main.cjs', null);
m.filename = __filename;
m.paths = Module._nodeModulePaths(__dirname);
m._compile(plain, path.join(__dirname, 'main.cjs'));
`;
    fs.writeFileSync(path.join(tmpDir, 'electron', 'bootstrap.cjs'), bootstrap);
    // package.json main 字段改 bootstrap
    const pkgPath = path.join(tmpDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.main = 'electron/bootstrap.cjs';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    // 重打 asar
    await asar.createFromDir(tmpDir, asarPath);
    console.log('[afterPack-encrypt] 主进程加密完成(bootstrap入口)');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('[afterPack-encrypt] 全部完成');
};
