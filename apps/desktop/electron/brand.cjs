// 品牌配置单一事实源 —— 贴牌（白标）改名只改这里。
// 消费方：electron/main.cjs（运行时解析数据目录）+ installer/build-installer.cjs
// （编译期生成 BrandInfo.cs 注入 launcher3/uninstall，并给 install.ps1 注入默认值）。
// 新增字段时同步更新 build-installer.cjs 的 BrandInfo.cs 生成段。
module.exports = {
  // Windows 数据目录：%LOCALAPPDATA%\<dataDirName>；类 Unix：~/.<dataDirName>
  // （vendor、venv、会话、日志全在这里；Defender 排除目标也是它）
  dataDirName: 'qiji',
  // Electron userData（Roaming）目录名 —— 跟 productName 走，卸载器用它清登录态
  userDataDirName: 'Qiji',
}
