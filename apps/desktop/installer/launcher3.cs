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

        // 1. Defender 排除
        reporter(0, "正在配置 Windows Defender...");
        AddDefenderExclusion(installDir);
        AddDefenderExclusion(s_tempDir);

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
        using (var key = Registry.CurrentUser.CreateSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Qiji"))
        {
            key.SetValue("DisplayName", APP_NAME);
            key.SetValue("DisplayIcon", appExe + ", 0");
            key.SetValue("UninstallString", Path.Combine(appDir, "uninstall.exe"));
            key.SetValue("InstallLocation", appDir);
            key.SetValue("DisplayVersion", APP_VERSION);
            key.SetValue("Publisher", APP_NAME);
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }

        // 8. 初始化数据目录
        reporter(96, "正在初始化数据目录...");
        string qijiHome = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "qiji");
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

            string defaultPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "Qiji");

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
