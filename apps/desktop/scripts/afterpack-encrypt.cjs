#!/usr/bin/env node
/**
 * afterPack: 源码加密(幂等版 — electron-builder 多 target 时钩子会跑多次)
 * 渲染层: dist/assets/*.js → .enc + index.html 内联解密 loader
 * 主进程: asar 内 electron/main.cjs → .enc + bootstrap.cjs 解密入口
 * QIJI_OBF_SEED 未设置 = dev模式,自动跳过。
 * 2026-09-12 对外发包加。
 */
const fs = require('fs');
const path = require('path');

const SEED = process.env.QIJI_OBF_SEED;

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

module.exports.default = async function afterPack(context) {
  if (!SEED) {
    console.error('[afterPack-encrypt] QIJI_OBF_SEED 未设置 — 跳过加密(开发模式)');
    return;
  }
  const key = deriveKey(SEED);
  const appDir = context.appOutDir;
  const resDir = path.join(appDir, 'resources');

  // ---- 主进程 asar 先加密(必须在渲染层前 — extractAll 会引用 unpacked 的渲染层文件) ----
  const asarPath0 = path.join(appDir, 'resources', 'app.asar');
  if (fs.existsSync(asarPath0)) {
    const asar = require('@electron/asar');
    let alreadyDone = false;
    try { asar.extractFile(asarPath0, 'electron/bootstrap.cjs'); alreadyDone = true; } catch {}
    if (!alreadyDone) {
      const mainSrc = asar.extractFile(asarPath0, 'electron/main.cjs');
      const enc = rc4(mainSrc, key);
      const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'asar-repack-'));
      asar.extractAll(asarPath0, tmpDir);
      fs.writeFileSync(path.join(tmpDir, 'electron', 'main.cjs.enc'), enc);
      fs.unlinkSync(path.join(tmpDir, 'electron', 'main.cjs'));
      const bootstrap = [
        "const { readFileSync } = require('fs');",
        "const path = require('path');",
        `const SEED = ${JSON.stringify(SEED)};`,
        "function deriveKey(seed){const out=Buffer.alloc(32);let h=2166136261>>>0;for(let r=0;r<32;r++){for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i)+(r<<8);h=Math.imul(h,16777619)>>>0;}out[r]=h&255;}return out;}",
        "function rc4(data,key){const S=new Uint8Array(256);let j=0;for(let i=0;i<256;i++)S[i]=i;for(let i=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;const t=S[i];S[i]=S[j];S[j]=t;}let i=0;j=0;const out=Buffer.alloc(data.length);for(let n=0;n<data.length;n++){i=(i+1)&255;j=(j+S[i])&255;const t=S[i];S[i]=S[j];S[j]=t;out[n]=data[n]^S[(S[i]+S[j])&255];}return out;}",
        "const enc = readFileSync(path.join(__dirname, 'main.cjs.enc'));",
        "const plain = rc4(enc, deriveKey(SEED)).toString('utf8');",
        "const Module = require('module');",
        "const m = new Module('main.cjs', null);",
        "m.filename = path.join(__dirname, 'main.cjs');",
        "m.paths = Module._nodeModulePaths(__dirname);",
        "m._compile(plain, path.join(__dirname, 'main.cjs'));",
      ].join('\n');
      fs.writeFileSync(path.join(tmpDir, 'electron', 'bootstrap.cjs'), bootstrap);
      const pkgPath = path.join(tmpDir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.main = 'electron/bootstrap.cjs';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      await asar.createPackage(tmpDir, asarPath0);
      console.log('[afterPack-encrypt] 主进程加密完成(bootstrap入口)');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } else {
      console.log('[afterPack-encrypt] 主进程已加密,跳过');
    }
  }

  // ---- 渲染层(幂等: .js 已是 .enc 就跳过) ----
  const distAssets = path.join(resDir, 'app.asar.unpacked', 'dist', 'assets');
  let encCount = 0, skipCount = 0;
  if (fs.existsSync(distAssets)) {
    const filesList = fs.readdirSync(distAssets);
    const hasPlainJs = filesList.some(f => f.endsWith('.js'));
    if (!hasPlainJs && filesList.some(f => f.endsWith('.js.enc'))) {
      // 2026-09-12 双加密事故防线: 目录里无任何明文js且已有enc = 加密已完成,整段跳过
      console.log('[afterPack-encrypt] 渲染层已全部加密,跳过(防双加密)');
    } else {
    for (const f of filesList) {
      if (f.endsWith('.js')) {
        const p = path.join(distAssets, f);
        const plain = fs.readFileSync(p);
        fs.writeFileSync(p + '.enc', rc4(plain, key));
        fs.unlinkSync(p);
        encCount++;
      } else if (f.endsWith('.js.enc')) {
        skipCount++;
      }
    }
    console.log(`[afterPack-encrypt] 渲染层: 新加密${encCount} 已加密跳过${skipCount}`);
    }

    const htmlPath = path.join(resDir, 'app.asar.unpacked', 'dist', 'index.html');
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      if (!html.includes('boot-decrypt')) {
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
  }

console.log('[afterPack-encrypt] 完成');
};
