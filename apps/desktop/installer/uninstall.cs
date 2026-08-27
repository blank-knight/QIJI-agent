using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using Microsoft.Win32;

class Uninstaller
{
    // 品牌数据目录名 —— 由打包期生成 BrandInfo.cs 注入（源 apps/desktop/electron/brand.cjs）。
    // #if 兜底保证缺 BrandInfo.cs 时仍可独立编译（回落 'qiji'）。
#if !BRAND_INFO
    static class BrandInfo
    {
        public const string DataDir = "qiji";
        public const string UserDataDir = "Qiji";
    }
#endif

    // 与 launcher3/electron main.cjs 同链：QIJI_HOME/HERMES_HOME → %LOCALAPPDATA%\<品牌名>
    static string ReadUserEnvVar(string name)
    {
        try
        {
            using (var envKey = Registry.CurrentUser.OpenSubKey("Environment"))
            {
                if (envKey != null)
                {
                    object v = envKey.GetValue(name);
                    if (v != null)
                    {
                        string s = v.ToString().Trim();
                        if (s.Length > 0 && !s.StartsWith("%")) return s;
                    }
                }
            }
        }
        catch { }
        return null;
    }

    static string ResolvePrimaryDataDir()
    {
        string existing = ReadUserEnvVar("QIJI_HOME") ?? ReadUserEnvVar("HERMES_HOME");
        if (existing != null) return existing;

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            BrandInfo.DataDir);
    }

    [STAThread]
    static void Main(string[] args)
    {
        string exePath = Assembly.GetExecutingAssembly().Location;
        string exeDir = Path.GetDirectoryName(exePath);

        // Mode 1: launched from install dir (no args) -> copy to temp and relaunch
        if (args.Length == 0)
        {
            string tempExe = Path.Combine(Path.GetTempPath(), "qiji_uninstall.exe");
            try
            {
                File.Copy(exePath, tempExe, true);
            }
            catch (Exception ex)
            {
                Console.WriteLine("复制卸载程序失败: " + ex.Message);
                Console.WriteLine("按任意键关闭...");
                Console.ReadKey();
                return;
            }
            // Relaunch from temp with install dir as argument
            Process.Start(new ProcessStartInfo
            {
                FileName = tempExe,
                Arguments = "\"" + exeDir + "\"",
                UseShellExecute = false
            });
            return;
        }

        // 2. Running from temp -> actual uninstall
        string installDir = args[0];
        // Strip trailing backslash if present
        if (installDir.EndsWith("\\"))
            installDir = installDir.Substring(0, installDir.Length - 1);
        var failures = new System.Collections.Generic.List<string>();

        Console.WriteLine();
        Console.WriteLine("  ============================================");
        Console.WriteLine("            奇计 - 卸载程序");
        Console.WriteLine("  ============================================");
        Console.WriteLine();
        Console.WriteLine("  正在卸载奇计...");

        // 1. Kill running Qiji processes (by exe path, full family, retry)
        Console.Write("  停止运行中的进程...");
        bool anyKilled = false;
        try
        {
            for (int round = 0; round < 3; round++)
            {
                var toKill = new System.Collections.Generic.List<Process>();
                foreach (var p in Process.GetProcesses())
                {
                    try
                    {
                        // 按可执行文件路径匹配（不按名字）：覆盖安装目录里的 Qiji.exe 家族，
                        // 也覆盖 %APPDATA% 里的辅助进程；按名字杀不全（崩溃残留的渲染进程等）
                        string pPath = p.MainModule.FileName;
                        bool inInstall = pPath.StartsWith(installDir + "\\", StringComparison.OrdinalIgnoreCase);
                        bool isDataHelper = pPath.IndexOf("\\AppData\\Roaming\\" + BrandInfo.UserDataDir, StringComparison.OrdinalIgnoreCase) >= 0
                            && pPath.IndexOf("\\install", StringComparison.OrdinalIgnoreCase) < 0; // 排除卸载器自身路径误伤
                        if (inInstall || isDataHelper) toKill.Add(p);
                    }
                    catch { } // 系统进程/权限不足读不到 MainModule，跳过
                }
                if (toKill.Count == 0) break;
                foreach (var p in toKill)
                {
                    try { p.Kill(); p.WaitForExit(5000); anyKilled = true; } catch { }
                }
                Thread.Sleep(1000); // 给句柄释放时间，再扫一轮直到干净
            }
            Console.WriteLine(anyKilled ? " 完成" : " 未发现运行中的进程");
        }
        catch { Console.WriteLine(" 跳过"); }

        Thread.Sleep(1500);

        // 2. Delete install directory (with retry for locked handles)
        Console.Write("  删除安装文件...");
        bool installDeleted = false;
        Exception lastErr = null;
        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                if (!Directory.Exists(installDir)) { installDeleted = true; break; }
                Directory.Delete(installDir, true);
                installDeleted = true;
                break;
            }
            catch (Exception ex)
            {
                lastErr = ex;
                if (attempt < 3) { Console.Write("."); Thread.Sleep(2000); } // 句柄释放重试
            }
        }
        if (installDeleted) Console.WriteLine(" 完成");
        else
        {
            Console.WriteLine(" 部分失败");
            Console.WriteLine("    " + lastErr.Message);
            failures.Add("安装目录");
        }

        // 3. Delete start menu shortcuts
        Console.Write("  删除开始菜单快捷方式...");
        try
        {
            string startMenu = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs), "奇计");
            if (Directory.Exists(startMenu))
                Directory.Delete(startMenu, true);
            Console.WriteLine(" 完成");
        }
        catch { Console.WriteLine(" 跳过"); }

        // 4. Delete desktop shortcut
        Console.Write("  删除桌面快捷方式...");
        try
        {
            string desktopLnk = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "奇计.lnk");
            if (File.Exists(desktopLnk))
                File.Delete(desktopLnk);
            Console.WriteLine(" 完成");
        }
        catch { Console.WriteLine(" 跳过"); }

        // 5. Delete registry uninstall entry
        Console.Write("  清理注册表...");
        try
        {
            Registry.CurrentUser.DeleteSubKeyTree(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + BrandInfo.UserDataDir, false);
            Console.WriteLine(" 完成");
        }
        catch { Console.WriteLine(" 跳过"); }

        // 6. Clean up QIJI_HOME data directory（按解析链找真实位置，贴牌改名不漏删）
        Console.Write("  清理数据目录...");
        try
        {
            string qijiHome = ResolvePrimaryDataDir();
            if (Directory.Exists(qijiHome))
                Directory.Delete(qijiHome, true);
            Console.WriteLine(" 完成");
        }
        catch (Exception ex)
        {
            Console.WriteLine(" 部分失败");
            Console.WriteLine("    " + ex.Message);
            failures.Add("数据目录");
        }

        // 6b. Clean up Electron userData (%APPDATA%\Qiji) — 登录态/localStorage 在这里，
        // 不删则重装后沿用旧登录态，登录页永不弹出（2026-08-23 案）
        Console.Write("  清理登录数据...");
        bool roamingDeleted = false;
        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                string roamingData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), BrandInfo.UserDataDir);
                if (!Directory.Exists(roamingData)) { roamingDeleted = true; break; }
                Directory.Delete(roamingData, true);
                roamingDeleted = true;
                break;
            }
            catch
            {
                if (attempt < 3) { Console.Write("."); Thread.Sleep(2000); }
            }
        }
        if (roamingDeleted) Console.WriteLine(" 完成");
        else
        {
            Console.WriteLine(" 部分失败（重启电脑后可手动删除 %APPDATA%\\" + BrandInfo.UserDataDir + "）");
            failures.Add("登录数据");
        }

        // 7. Remove QIJI_HOME env var from registry
        Console.Write("  清理环境变量...");
        try
        {
            Registry.CurrentUser.DeleteSubKey(
                @"Environment\QIJI_HOME", false);
            // Also try the typed API (more reliable on some Windows versions)
            Environment.SetEnvironmentVariable("QIJI_HOME", null, EnvironmentVariableTarget.User);
            Console.WriteLine(" 完成");
        }
        catch { Console.WriteLine(" 跳过"); }

        Console.WriteLine();
        Console.WriteLine("  ============================================");
        if (failures.Count > 0)
        {
            Console.WriteLine("            卸载部分完成");
            Console.WriteLine("  ============================================");
            Console.WriteLine();
            Console.WriteLine("  以下内容未能完全删除（可能被占用）:");
            foreach (var f in failures) Console.WriteLine("    - " + f);
            Console.WriteLine("  重启电脑后重新运行本卸载程序，或手动删除剩余文件。");
        }
        else
        {
            Console.WriteLine("            卸载完成！");
        }
        Console.WriteLine("  ============================================");
        Console.WriteLine();
        Console.Write("  按任意键关闭...");
        Console.ReadKey();

        // 6. Self-delete temp copy (schedule delayed delete)
        try
        {
            string selfPath = Assembly.GetExecutingAssembly().Location;
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c timeout /t 2 >nul & del \"" + selfPath + "\"",
                CreateNoWindow = true,
                UseShellExecute = false
            });
        }
        catch { }
    }
}
