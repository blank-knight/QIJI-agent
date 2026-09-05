using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class Launcher
{
    // ── Native methods ──────────────────────────────────────────────
    static class NativeMethods
    {
        public static readonly IntPtr HWND_BROADCAST = new IntPtr(0xffff);
        public const int WM_SETTINGCHANGE = 0x001A;
        public const int SMTO_ABORTIFHUNG = 0x0002;

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern IntPtr SendMessageTimeout(
            IntPtr hWnd, uint Msg, IntPtr wParam, string lParam,
            uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
    }

    // ── Constants ───────────────────────────────────────────────────
    const string APP_NAME = "奇计";
    const string APP_VERSION = "0.17.0";
    // 品牌数据目录名 —— 由打包期生成 BrandInfo.cs 注入（源 apps/desktop/electron/brand.cjs）。
    // #if 兜底保证缺 BrandInfo.cs 时仍可独立编译（回落 'qiji'）。
#if !BRAND_INFO
    static class BrandInfo
    {
        public const string DataDir = "qiji";
        public const string UserDataDir = "Qiji";
    }
#endif
    static readonly Color BRAND_COLOR = Color.FromArgb(60, 100, 230);
    static readonly Color BG_COLOR = Color.FromArgb(255, 255, 255);
    static readonly Color CARD_COLOR = Color.FromArgb(240, 240, 245);
    static readonly Color TEXT_PRIMARY = Color.FromArgb(30, 30, 35);
    static readonly Color TEXT_SECONDARY = Color.FromArgb(120, 120, 130);

    // ── Install state ───────────────────────────────────────────────
    static string s_exePath = Assembly.GetExecutingAssembly().Location;
    static string s_tempDir;
    static string s_sevenZipPath;
    static string s_installDir;

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // 提取内嵌 7zr.exe 到临时目录
        PrepSevenZip();

        // 启动向导
        Application.Run(new WizardForm());
    }

    // ─────────────────────────────────────────────────────────────────
    //  7z 准备
    // ─────────────────────────────────────────────────────────────────
    static void PrepSevenZip()
    {
        s_tempDir = Path.Combine(Path.GetTempPath(), "QijiSetup_" + Guid.NewGuid().ToString("N").Substring(0, 8));
        Directory.CreateDirectory(s_tempDir);
        s_sevenZipPath = Path.Combine(s_tempDir, "7zr.exe");

        var asm = Assembly.GetExecutingAssembly();
        foreach (var name in asm.GetManifestResourceNames())
        {
            if (name.EndsWith("7zr.exe"))
            {
                using (var stream = asm.GetManifestResourceStream(name))
                using (var outFs = File.Create(s_sevenZipPath))
                {
                    stream.CopyTo(outFs);
                }
                return;
            }
        }
        MessageBox.Show("内部错误: 未找到 7zr.exe 资源", APP_NAME + " 安装", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Environment.Exit(1);
    }

    // ─────────────────────────────────────────────────────────────────
    //  安装逻辑（在后台线程跑）
    // ─────────────────────────────────────────────────────────────────
    static bool s_cancelRequested = false;
    static Process s_sevenZipProc = null;

    static void PerformInstall(string installDir, InstallProgressReporter reporter)
    {
        s_installDir = installDir;
        Directory.CreateDirectory(installDir);

        // 0. 杀目标目录下运行中的 Qiji 进程：旧版本运行中会锁住 app.asar 等
        //    文件，导致覆盖安装解压失败/写坏 0 字节文件（2026-08-23 案）
        reporter(0, "正在停止运行中的旧版本...");
        try
        {
            for (int round = 0; round < 3; round++)
            {
                var toKill = new System.Collections.Generic.List<Process>();
                foreach (var p in Process.GetProcesses())
                {
                    try
                    {
                        string pPath = p.MainModule.FileName;
                        if (pPath != null && pPath.StartsWith(installDir + "\\", StringComparison.OrdinalIgnoreCase))
                            toKill.Add(p);
                        // Roaming 下的辅助进程（网关子进程）一并停，防锁数据目录
                        else if (pPath != null && pPath.IndexOf("\\AppData\\Roaming\\" + BrandInfo.UserDataDir, StringComparison.OrdinalIgnoreCase) >= 0
                            && pPath.IndexOf("\\installer", StringComparison.OrdinalIgnoreCase) < 0)
                            toKill.Add(p);
                    }
                    catch { } // 系统进程读不到路径，跳过
                }
                if (toKill.Count == 0) break;
                foreach (var p in toKill)
                {
                    try { p.Kill(); p.WaitForExit(5000); } catch { }
                }
                Thread.Sleep(1000); // 给句柄释放时间，再扫一轮
            }
        }
        catch { }
        Thread.Sleep(1500); // 等文件句柄彻底释放

        // 1. Defender 排除
        reporter(0, "正在配置 Windows Defender...");
        AddDefenderExclusion(installDir);
        AddDefenderExclusion(s_tempDir);
        // 数据目录（%LOCALAPPDATA%\<dataDirName>，vendor/git 复制目标）也要排除：
        // 首启 bootstrap 把 40 万 MB/9504 文件的 vendor 复制进去，若被实时扫描，
        // 每个小文件都触发一次拦截，装完首启要 28-60 分钟。排除可先于目录存在注册。
        // 品牌目录名由打包期 BrandInfo.cs 注入（源 apps/desktop/electron/brand.cjs），
        // 与 main.cjs 运行时解析链同源，贴牌改名不会漏。
        foreach (string dataDir in ResolveDataDirs())
        {
            AddDefenderExclusion(dataDir);
        }

        // 2. 7z 解压（解析进度）
        reporter(5, "正在解压文件...");
        int exitCode = ExtractWithProgress(s_exePath, installDir, percent =>
        {
            // 7z 进度映射到 5%–85%
            int mapped = 5 + (int)(percent * 0.80);
            reporter(mapped, "正在解压文件... " + percent + "%");
        });

        if (exitCode != 0)
        {
            if (exitCode == -2 || s_cancelRequested)
            {
                reporter(-2, "安装已取消");
                return;
            }
            reporter(-1, "解压失败 (代码 " + exitCode + ")");
            return;
        }

        // 3. 清理临时
        if (s_cancelRequested) { reporter(-2, "安装已取消"); return; }
        reporter(86, "正在清理临时文件...");
        try { Directory.Delete(s_tempDir, true); } catch { }

        // 4. 查找 app exe
        string appExe = Path.Combine(installDir, "Qiji.exe");
        if (!File.Exists(appExe))
        {
            var found = Directory.GetFiles(installDir, "Qiji.exe", SearchOption.AllDirectories);
            if (found.Length > 0) appExe = found[0];
            else { reporter(-1, "错误: 解压后未找到 Qiji.exe"); return; }
        }
        string appDir = Path.GetDirectoryName(appExe);

        // 5. 安装 uninstall.exe
        reporter(88, "正在安装卸载程序...");
        var asm = Assembly.GetExecutingAssembly();
        foreach (var name in asm.GetManifestResourceNames())
        {
            if (name.EndsWith("uninstall.exe"))
            {
                using (var stream = asm.GetManifestResourceStream(name))
                using (var outFs = File.Create(Path.Combine(appDir, "uninstall.exe")))
                {
                    stream.CopyTo(outFs);
                }
                break;
            }
        }

        // 6. 快捷方式
        reporter(90, "正在创建快捷方式...");
        CreateShortcut(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), APP_NAME + ".lnk"),
            appExe, appDir);

        string startMenu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs), APP_NAME);
        Directory.CreateDirectory(startMenu);
        CreateShortcut(
            Path.Combine(startMenu, APP_NAME + ".lnk"),
            appExe, appDir);

        // 7. 注册卸载信息
        reporter(93, "正在注册系统信息...");
        string uninstallPath = Path.Combine(appDir, "uninstall.exe");
        using (var key = Registry.CurrentUser.CreateSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + BrandInfo.UserDataDir))
        {
            key.SetValue("DisplayName", APP_NAME);
            key.SetValue("DisplayIcon", appExe + ", 0");
            // 路径含空格必须加引号，否则控制面板执行时按空格切分找不到 exe（点卸载无反应）
            key.SetValue("UninstallString", "\"" + uninstallPath + "\"");
            key.SetValue("InstallLocation", appDir);
            key.SetValue("DisplayVersion", APP_VERSION);
            key.SetValue("Publisher", APP_NAME);
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }

        // 8. 初始化数据目录
        reporter(96, "正在初始化数据目录...");
        string qijiHome = ResolvePrimaryDataDir();
        Directory.CreateDirectory(qijiHome);

        Registry.SetValue(@"HKEY_CURRENT_USER\Environment", "QIJI_HOME", qijiHome);

        try
        {
            using (var envKey = Registry.CurrentUser.OpenSubKey(@"Environment", true))
            {
                if (envKey != null && envKey.GetValue("HERMES_HOME") != null)
                    envKey.DeleteValue("HERMES_HOME", false);
            }
        }
        catch { }

        IntPtr result;
        NativeMethods.SendMessageTimeout(
            NativeMethods.HWND_BROADCAST, NativeMethods.WM_SETTINGCHANGE,
            IntPtr.Zero, "Environment",
            NativeMethods.SMTO_ABORTIFHUNG, 5000, out result);

        string configPath = Path.Combine(qijiHome, "config.yaml");
        if (!File.Exists(configPath))
        {
            File.WriteAllText(configPath, "display:\n  language: zh\n", System.Text.Encoding.UTF8);
        }

        reporter(100, "安装完成!");
    }

    static void LaunchApp(string installDir)
    {
        string appExe = Path.Combine(installDir, "Qiji.exe");
        if (!File.Exists(appExe))
        {
            var found = Directory.GetFiles(installDir, "Qiji.exe", SearchOption.AllDirectories);
            if (found.Length > 0) appExe = found[0];
        }
        if (File.Exists(appExe))
        {
            var psi = new ProcessStartInfo
            {
                FileName = appExe,
                WorkingDirectory = Path.GetDirectoryName(appExe),
                UseShellExecute = true
            };
            Process.Start(psi);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  7z 进度解析
    // ─────────────────────────────────────────────────────────────────
    static int ExtractWithProgress(string archivePath, string destDir, Action<int> onProgress)
    {
        var psi = new ProcessStartInfo
        {
            FileName = s_sevenZipPath,
            Arguments = "x \"" + archivePath + "\" -o\"" + destDir + "\" -y -mmt=on -bsp1",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            StandardOutputEncoding = System.Text.Encoding.GetEncoding("GB2312")
        };

        var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
        s_sevenZipProc = proc;
        proc.Start();

        // 实时读取 stdout 解析百分比
        // 7z -bsp1 输出格式: "  45% 12 - some/file.ext"
        string line;
        while ((line = proc.StandardOutput.ReadLine()) != null)
        {
            if (s_cancelRequested)
            {
                try { proc.Kill(); } catch { }
                proc.WaitForExit();
                return -2;
            }
            line = line.Trim();
            if (line.Length > 0 && line[0] >= '0' && line[0] <= '9')
            {
                int pct = 0;
                int spaceIdx = line.IndexOf('%');
                if (spaceIdx > 0 && int.TryParse(line.Substring(0, spaceIdx).Trim(), out pct))
                {
                    onProgress(pct);
                }
            }
        }
        proc.WaitForExit();
        s_sevenZipProc = null;
        return proc.ExitCode;
    }

    static void AddDefenderExclusion(string path)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -NonInteractive -Command \"Add-MpPreference -ExclusionPath '" + path + "' -ErrorAction SilentlyContinue\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true
            };
            var p = Process.Start(psi);
            p.StandardInput.Close();
            p.WaitForExit(10000);
        }
        catch { }
    }

    // ─────────────────────────────────────────────────────────────────
    //  数据目录解析（与 electron/main.cjs resolveHermesHome 同链，防两处漂移）
    //  QIJI_HOME/HERMES_HOME 环境变量（含注册表 User 范围） → %LOCALAPPDATA%\<品牌名>
    // ─────────────────────────────────────────────────────────────────

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

    /// <summary>主数据目录（安装时写 QIJI_HOME 注册表用它）</summary>
    static string ResolvePrimaryDataDir()
    {
        // 已有显式覆盖（老机器迁移/定制部署）优先，不动
        string existing = ReadUserEnvVar("QIJI_HOME") ?? ReadUserEnvVar("HERMES_HOME");
        if (existing != null) return existing;

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            BrandInfo.DataDir);
    }

    /// <summary>
    /// 需要 Defender 排除的数据目录全集（去重）：
    /// 1. 品牌兜底目录 %LOCALAPPDATA%\&lt;BRAND_DATA_DIR&gt;（排除可先于目录存在注册）
    /// 2. 注册表/环境变量里现存的所有 QIJI_HOME / HERMES_HOME（老 Hermes 装机兼容）
    /// 注意：v4.0.30319 csc 只支持 C# 5，禁用局部函数/内插字符串等新语法。
    /// </summary>
    static void AddDataDir(List<string> dirs, HashSet<string> seen, string p)
    {
        if (string.IsNullOrEmpty(p)) return;
        try { p = Path.GetFullPath(p); } catch { }
        if (seen.Add(p)) dirs.Add(p);
    }

    static List<string> ResolveDataDirs()
    {
        var dirs = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        AddDataDir(dirs, seen, Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            BrandInfo.DataDir));

        AddDataDir(dirs, seen, ReadUserEnvVar("QIJI_HOME"));
        AddDataDir(dirs, seen, ReadUserEnvVar("HERMES_HOME"));

        return dirs;
    }

    static void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
    {
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        object shortcut = t.InvokeMember("CreateShortcut",
            BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
        Type st = shortcut.GetType();
        st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
        st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
        st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ", 0" });
        st.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { APP_NAME });
        st.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
    }

    // ─────────────────────────────────────────────────────────────────
    //  进度回调委托
    // ─────────────────────────────────────────────────────────────────
    delegate void InstallProgressReporter(int percent, string status);

    // ═════════════════════════════════════════════════════════════════
    //  向导主窗体
    // ═════════════════════════════════════════════════════════════════
    class WizardForm : Form
    {
        // 4 个页面面板
        Panel _welcomePage, _dirPage, _installPage;
        Panel _donePage;
        Button _btnNext, _btnBack, _btnCancel;
        int _currentPage = 0;

        // 目录选择
        TextBox _dirTextBox;
        // 安装进度
        Label _statusLabel, _installTitle;
        ProgressBar _progressBar;
        Label _progressLabel;
        bool _installFailed = false;
        bool _installDone = false;
        bool _cancelRequested = false;  // 用户请求取消安装

        // 完成页
        CheckBox _chkLaunch;
        CheckBox _chkDesktop;

        // 按钮栏高度
        const int BTN_PANEL_HEIGHT = 50;

        public WizardForm()
        {
            SetupWindow();
            BuildWelcomePage();
            BuildDirPage();
            BuildInstallPage();
            BuildDonePage();
            BuildButtons();
            ShowPage(0);
        }

        void SetupWindow()
        {
            Text = APP_NAME + " 安装程序";
            Size = new Size(520, 440);
            MinimumSize = new Size(520, 440);
            MaximumSize = new Size(520, 440);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = BG_COLOR;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            MinimizeBox = false;

            // 从嵌入资源加载窗口图标
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                using (var stream = asm.GetManifestResourceStream("icon.ico"))
                {
                    if (stream != null)
                        Icon = new Icon(stream);
                }
            }
            catch { }
        }

        // ── 欢迎页 ──────────────────────────────────────────────
        void BuildWelcomePage()
        {
            _welcomePage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR
            };

            PictureBox logoBox = null;
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                var stream = asm.GetManifestResourceStream("icon.ico");
                if (stream != null)
                {
                    var bmp = new Bitmap(stream);
                    logoBox = new PictureBox
                    {
                        Image = bmp,
                        SizeMode = PictureBoxSizeMode.Zoom,
                        Size = new Size(56, 56)
                    };
                    _welcomePage.Controls.Add(logoBox);
                }
            }
            catch { }

            var title = new Label
            {
                Text = APP_NAME + " 安装",
                Font = new Font("Microsoft YaHei", 20, FontStyle.Bold),
                ForeColor = TEXT_PRIMARY,
                AutoSize = true
            };

            var desc = new Label
            {
                Text = "点击「下一步」开始安装",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_SECONDARY,
                AutoSize = true
            };

            _welcomePage.Controls.Add(title);
            _welcomePage.Controls.Add(desc);

            _welcomePage.Resize += (s, e) =>
            {
                int cx = _welcomePage.ClientSize.Width / 2;
                int cy = _welcomePage.ClientSize.Height / 2;
                // logo 居中，在垂直中心上方 55px
                if (logoBox != null)
                    logoBox.Location = new Point(cx - 28, cy - 95);
                // title 在 logo 下方
                title.Location = new Point(cx - title.PreferredWidth / 2, cy - 32);
                // desc 在 title 下方
                desc.Location = new Point(cx - desc.PreferredWidth / 2, cy + 4);
            };
        }

        // ── 目录选择页 ──────────────────────────────────────────
        void BuildDirPage()
        {
            _dirPage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR
            };

            const int INPUT_W = 320;
            const int BROWSE_W = 90;
            const int ROW_W = INPUT_W + 10 + BROWSE_W; // 420

            var title = new Label
            {
                Text = "选择安装位置",
                Font = new Font("Microsoft YaHei", 16, FontStyle.Bold),
                ForeColor = TEXT_PRIMARY,
                AutoSize = true
            };

            var hint = new Label
            {
                Text = APP_NAME + " 将安装到以下目录，点击「安装」开始",
                Font = new Font("Microsoft YaHei", 9),
                ForeColor = TEXT_SECONDARY,
                AutoSize = true
            };

            // 默认目录优先回读上次安装位置（注册表 InstallLocation），
            // 装过 D 盘的用户更新时默认仍是 D 盘；没装过才用 C 盘默认。
            // 防「更新后 C/D 两份客户端」。
            string defaultPath = null;
            try
            {
                using (var prevKey = Registry.CurrentUser.OpenSubKey(
                    "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + BrandInfo.UserDataDir))
                {
                    if (prevKey != null)
                    {
                        var prevDir = prevKey.GetValue("InstallLocation") as string;
                        if (!string.IsNullOrWhiteSpace(prevDir) && Directory.Exists(prevDir))
                        {
                            defaultPath = prevDir;
                        }
                    }
                }
            }
            catch { /* 读注册表失败 → 走默认 */ }
            if (string.IsNullOrEmpty(defaultPath))
            {
                defaultPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Programs", "Qiji");
            }

            _dirTextBox = new TextBox
            {
                Text = defaultPath,
                Font = new Font("Microsoft YaHei", 11),
                BackColor = CARD_COLOR,
                ForeColor = TEXT_PRIMARY,
                BorderStyle = BorderStyle.FixedSingle,
                Width = INPUT_W
            };

            var browseBtn = new Button
            {
                Text = "浏览...",
                Font = new Font("Microsoft YaHei", 10),
                BackColor = CARD_COLOR,
                ForeColor = TEXT_PRIMARY,
                FlatStyle = FlatStyle.Flat,
                Width = BROWSE_W
            };
            browseBtn.FlatAppearance.BorderColor = TEXT_SECONDARY;
            browseBtn.Click += (s, e) =>
            {
                var dlg = new FolderBrowserDialog
                {
                    Description = "选择" + APP_NAME + "安装目录",
                    SelectedPath = _dirTextBox.Text
                };
                if (dlg.ShowDialog() == DialogResult.OK)
                    _dirTextBox.Text = dlg.SelectedPath;
            };

            _dirPage.Controls.Add(title);
            _dirPage.Controls.Add(hint);
            _dirPage.Controls.Add(_dirTextBox);
            _dirPage.Controls.Add(browseBtn);

            _dirPage.Resize += (s, e) =>
            {
                int cx = _dirPage.ClientSize.Width / 2;
                int cy = _dirPage.ClientSize.Height / 2;
                int inputLeft = cx - ROW_W / 2;

                title.Location = new Point(cx - title.PreferredWidth / 2, cy - 95);
                hint.Location = new Point(cx - hint.PreferredWidth / 2, cy - 62);
                int inputTop = cy - 30;
                _dirTextBox.Location = new Point(inputLeft, inputTop);
                // browseBtn 与输入框等高
                browseBtn.Height = _dirTextBox.Height;
                browseBtn.Location = new Point(inputLeft + INPUT_W + 10, inputTop);
            };
        }

        // ── 安装进度页 ──────────────────────────────────────────
        void BuildInstallPage()
        {
            _installPage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR
            };

            const int BAR_W = 420;

            _installTitle = new Label
            {
                Text = "正在安装",
                Font = new Font("Microsoft YaHei", 16, FontStyle.Bold),
                ForeColor = TEXT_PRIMARY,
                AutoSize = true
            };

            _statusLabel = new Label
            {
                Text = "准备中...",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_SECONDARY,
                AutoSize = true
            };

            _progressBar = new ProgressBar
            {
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Height = 24,
                Width = BAR_W,
                Style = ProgressBarStyle.Continuous
            };

            _progressLabel = new Label
            {
                Text = "0%",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_PRIMARY,
                AutoSize = true
            };

            _installPage.Controls.Add(_installTitle);
            _installPage.Controls.Add(_statusLabel);
            _installPage.Controls.Add(_progressBar);
            _installPage.Controls.Add(_progressLabel);

            _installPage.Resize += (s, e) =>
            {
                int cx = _installPage.ClientSize.Width / 2;
                int cy = _installPage.ClientSize.Height / 2;
                int barLeft = cx - BAR_W / 2;

                // "正在安装" 紧贴进度条上方（间距12px）
                _installTitle.Location = new Point(cx - _installTitle.PreferredWidth / 2, cy - 50);
                _progressBar.Location = new Point(barLeft, cy - 10);
                // 百分比在进度条右下
                _progressLabel.Location = new Point(barLeft + BAR_W - _progressLabel.PreferredWidth, cy + 18);
                // 状态信息在进度条左下，与进度条左对齐
                _statusLabel.Location = new Point(barLeft, cy + 18);
            };
        }

        // ── 完成页 ──────────────────────────────────────────────
        void BuildDonePage()
        {
            _donePage = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = BG_COLOR,
                Padding = new Padding(40, 30, 40, 40)
            };

            var title = new Label
            {
                Text = "安装完成!",
                Font = new Font("Microsoft YaHei", 20, FontStyle.Bold),
                ForeColor = Color.FromArgb(80, 200, 120),
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 50
            };

            var checkPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 80,
                BackColor = BG_COLOR,
                Padding = new Padding(60, 20, 60, 0)
            };

            _chkLaunch = new CheckBox
            {
                Text = "立即启动 " + APP_NAME,
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_PRIMARY,
                Checked = true,
                Dock = DockStyle.Top,
                Height = 30,
                BackColor = BG_COLOR
            };

            _chkDesktop = new CheckBox
            {
                Text = "查看安装目录",
                Font = new Font("Microsoft YaHei", 10),
                ForeColor = TEXT_PRIMARY,
                Checked = false,
                Dock = DockStyle.Top,
                Height = 30,
                BackColor = BG_COLOR
            };

            checkPanel.Controls.Add(_chkDesktop);
            checkPanel.Controls.Add(_chkLaunch);

            _donePage.Controls.Add(checkPanel);
            _donePage.Controls.Add(title);
        }

        // ── 底部按钮 ────────────────────────────────────────────
        void BuildButtons()
        {
            var btnPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 50,
                BackColor = Color.FromArgb(245, 245, 248),
                Padding = new Padding(20, 10, 20, 10)
            };

            _btnCancel = new Button
            {
                Text = "取消",
                Size = new Size(80, 32),
                FlatStyle = FlatStyle.Flat,
                BackColor = CARD_COLOR,
                ForeColor = TEXT_SECONDARY,
                Font = new Font("Microsoft YaHei", 9)
            };
            _btnCancel.FlatAppearance.BorderColor = TEXT_SECONDARY;
            _btnCancel.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            _btnCancel.Location = new Point(btnPanel.Width - 100, 9);
            _btnCancel.Click += (s, e) =>
            {
                if (_currentPage == 2 && !_installDone && !_installFailed)
                {
                    // 安装中 → 请求取消
                    var result = MessageBox.Show(
                        "确定要取消安装吗？已解压的文件将被清理。",
                        APP_NAME, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                    if (result == DialogResult.Yes)
                    {
                        _cancelRequested = true;
                        s_cancelRequested = true;
                        _btnCancel.Enabled = false;
                        _statusLabel.Text = "正在取消...";
                        // 立即 Kill 7z 进程，打断阻塞的 ReadLine
                        if (s_sevenZipProc != null)
                        {
                            try { s_sevenZipProc.Kill(); } catch { }
                        }
                    }
                    return;
                }
                Application.Exit();
            };

            _btnBack = new Button
            {
                Text = "上一步",
                Size = new Size(80, 32),
                FlatStyle = FlatStyle.Flat,
                BackColor = CARD_COLOR,
                ForeColor = TEXT_PRIMARY,
                Font = new Font("Microsoft YaHei", 9)
            };
            _btnBack.FlatAppearance.BorderColor = TEXT_SECONDARY;
            _btnBack.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            _btnBack.Location = new Point(btnPanel.Width - 280, 9);
            _btnBack.Click += (s, e) => ShowPage(_currentPage - 1);

            _btnNext = new Button
            {
                Text = "下一步",
                Size = new Size(80, 32),
                FlatStyle = FlatStyle.Flat,
                BackColor = BRAND_COLOR,
                ForeColor = Color.White,
                Font = new Font("Microsoft YaHei", 9, FontStyle.Bold)
            };
            _btnNext.FlatAppearance.BorderColor = BRAND_COLOR;
            _btnNext.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            _btnNext.Location = new Point(btnPanel.Width - 190, 9);
            _btnNext.Click += (s, e) => OnNextClick();

            btnPanel.Controls.AddRange(new Control[] { _btnCancel, _btnBack, _btnNext });

            // 处理 DPI 缩放后的位置
            btnPanel.Resize += (s, e) =>
            {
                _btnCancel.Location = new Point(btnPanel.Width - 100, 9);
                _btnBack.Location = new Point(btnPanel.Width - 280, 9);
                _btnNext.Location = new Point(btnPanel.Width - 190, 9);
            };

            // 注意 WinForms Dock z-order：后 Add 的控件先占据空间。
            // 顺序必须是：先加 DockStyle.Bottom 的按钮栏，再加 DockStyle.Fill 的页面，
            // 这样页面才会填充按钮栏以上的全部区域。
            Controls.Add(btnPanel);
            Controls.Add(_welcomePage);
            Controls.Add(_dirPage);
            Controls.Add(_installPage);
            Controls.Add(_donePage);
        }

        void OnNextClick()
        {
            if (_currentPage == 0)
            {
                ShowPage(1);
            }
            else if (_currentPage == 1)
            {
                // 开始安装
                string dir = _dirTextBox.Text.Trim();
                if (string.IsNullOrEmpty(dir))
                {
                    MessageBox.Show("请选择安装目录", APP_NAME, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (!Directory.Exists(dir))
                {
                    try { Directory.CreateDirectory(dir); }
                    catch (Exception ex)
                    {
                        MessageBox.Show("无法创建目录: " + ex.Message, APP_NAME, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }
                }

                _btnNext.Enabled = false;
                _btnBack.Enabled = false;
                _btnNext.Text = "安装中...";
                ShowPage(2);
                StartInstall(dir);
            }
            else if (_currentPage == 2 && _cancelRequested)
            {
                // 取消后重新安装
                _cancelRequested = false;
                s_cancelRequested = false;
                _progressBar.Value = 0;
                _progressLabel.Text = "0%";
                _btnNext.Enabled = false;
                _btnBack.Enabled = false;
                _btnCancel.Enabled = true;
                _btnNext.Text = "安装中...";
                StartInstall(_dirTextBox.Text.Trim());
            }
            else if (_currentPage == 3)
            {
                // 完成
                Application.Exit();
            }
        }

        void StartInstall(string installDir)
        {
            _installFailed = false;
            _cancelRequested = false;
            s_cancelRequested = false;

            var thread = new Thread(() =>
            {
                try
                {
                    PerformInstall(installDir, (percent, status) =>
                    {
                        // 检查取消
                        if (_cancelRequested) return;

                        // 回到 UI 线程更新
                        if (IsDisposed) return;
                        BeginInvoke((MethodInvoker)delegate
                        {
                            if (percent < 0)
                            {
                                if (percent == -2)
                                {
                                    // 取消
                                    _installFailed = false;
                                    _cancelRequested = true;
                                }
                                else
                                {
                                    // 错误
                                    _installFailed = true;
                                    _statusLabel.Text = status;
                                    _statusLabel.ForeColor = Color.FromArgb(220, 80, 80);
                                    _progressBar.Style = ProgressBarStyle.Blocks;
                                }
                            }
                            else
                            {
                                _progressBar.Value = Math.Min(percent, 100);
                                _progressLabel.Text = percent + "%";
                                _statusLabel.Text = status;
                            }
                        });
                    });

                    // 安装被取消
                    if (_cancelRequested)
                    {
                        // 清理已解压的文件
                        try { if (Directory.Exists(installDir)) Directory.Delete(installDir, true); } catch { }

                        BeginInvoke((MethodInvoker)delegate
                        {
                            _progressBar.Value = 0;
                            _progressLabel.Text = "0%";
                            _statusLabel.Text = "";
                            _btnNext.Enabled = true;
                            _btnNext.Text = "重新安装";
                            _btnBack.Enabled = true;
                            _btnBack.Text = "上一步";
                        });
                        return;
                    }

                    if (!_installFailed)
                    {
                        // 安装成功 → 启动应用 + 退出安装程序
                        _installDone = true;
                        BeginInvoke((MethodInvoker)delegate
                        {
                            LaunchApp(s_installDir);
                            Application.Exit();
                        });
                    }
                    else
                    {
                        BeginInvoke((MethodInvoker)delegate
                        {
                            _btnNext.Enabled = true;
                            _btnNext.Text = "重试";
                            _btnBack.Enabled = true;
                        });
                    }
                }
                catch (Exception ex)
                {
                    BeginInvoke((MethodInvoker)delegate
                    {
                        _statusLabel.Text = "安装出错: " + ex.Message;
                        _statusLabel.ForeColor = Color.FromArgb(220, 80, 80);
                        _btnNext.Enabled = true;
                        _btnNext.Text = "重试";
                        _btnBack.Enabled = true;
                    });
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        void ShowPage(int index)
        {
            _currentPage = Math.Max(0, Math.Min(3, index));

            // 隐藏所有
            _welcomePage.Visible = false;
            _dirPage.Visible = false;
            _installPage.Visible = false;
            _donePage.Visible = false;

            // 按钮状态
            _btnBack.Visible = true;
            _btnCancel.Visible = true;

            switch (_currentPage)
            {
                case 0: // 欢迎
                    _welcomePage.Visible = true;
                    _btnBack.Enabled = false;
                    _btnNext.Text = "下一步";
                    _btnNext.Enabled = true;
                    break;

                case 1: // 目录
                    _dirPage.Visible = true;
                    _btnBack.Enabled = true;
                    _btnNext.Text = "安装";
                    _btnNext.Enabled = true;
                    break;

                case 2: // 安装中
                    _installPage.Visible = true;
                    _btnBack.Enabled = false;
                    _btnNext.Enabled = false;
                    _btnNext.Text = "安装中...";
                    _btnCancel.Enabled = true;
                    break;

                case 3: // 完成
                    _donePage.Visible = true;
                    _btnBack.Visible = false;
                    _btnCancel.Visible = false;
                    _btnNext.Text = "完成";
                    _btnNext.Enabled = true;

                    // 处理 checkbox
                    if (_chkLaunch.Checked)
                    {
                        LaunchApp(s_installDir);
                    }
                    break;
            }
        }

        // 窗口关闭时清理
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // 安装进行中（且未完成）时不允许关闭
            if (_currentPage == 2 && !_installFailed && !_installDone && !_cancelRequested)
            {
                e.Cancel = true;
                return;
            }
            if (s_tempDir != null && Directory.Exists(s_tempDir))
            {
                try { Directory.Delete(s_tempDir, true); } catch { }
            }
            base.OnFormClosing(e);
        }
    }
}
